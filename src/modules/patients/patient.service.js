import bcrypt from 'bcryptjs';
import Patient from '../../models/Patient.model.js';
import User from '../../models/User.model.js';
import { createError } from '../../utils/apiResponse.js';
import { generateCaseNumber } from '../../utils/caseNumberGenerator.js';
import { computeRiskScore } from '../../utils/riskScoring.js';
import { computeCompliance } from '../../utils/complianceCalculator.js';
import { exportPatientListPdf } from '../../utils/pdfExporter.js';
import ROLES from '../../constants/roles.js';

// ── PAGINATION ───────────────────────────────────────────
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const getPagination = (query) => {
  const page = Math.max(parseInt(query.page) || DEFAULT_PAGE, 1);
  const limit = Math.min(parseInt(query.limit) || DEFAULT_LIMIT, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ── BARANGAY SCOPE GUARD ─────────────────────────────────
const assertSameBarangay = (requester, targetBarangayId) => {
  if (requester.role !== ROLES.SUPER_ADMIN && requester.barangay_id !== targetBarangayId) {
    throw createError(403, 'Access denied. Patient belongs to a different barangay.');
  }
};

// ── GENERATE SEQUENTIAL PATIENT ID ──────────────────────
const generatePatientId = async () => {
  const latest = await Patient.findOne().sort({ created_at: -1 }).select('patient_id');
  if (!latest) return 'PT-0001';
  const num = parseInt(latest.patient_id.split('-')[1]) + 1;
  return `PT-${String(num).padStart(4, '0')}`;
};

const generateUserId = async () => {
  const users = await User.find({}, 'user_id').lean();
  if (!users.length) return 'USR-0001';
  const nums = users.map(u => parseInt(u.user_id?.split('-')[1])).filter(n => !isNaN(n));
  const max = Math.max(...nums);
  return `USR-${String(max + 1).padStart(4, '0')}`;
};

// ── COMPUTE TREATMENT END DATE ───────────────────────────
const computeEndDate = (dateStarted, durationMonths) => {
  const end = new Date(dateStarted);
  end.setMonth(end.getMonth() + durationMonths);
  return end;
};

// ── BUILD SPUTUM SCHEDULE ────────────────────────────────
const buildSputumSchedule = (dateStarted) => {
  return [2, 5, 6].map((month) => {
    const due = new Date(dateStarted);
    due.setMonth(due.getMonth() + month);
    return { month, due_date: due, status: 'Pending' };
  });
};

// ── TREATMENT DAY COUNTER ────────────────────────────────
const computeTreatmentDay = (dateStarted) => {
  const today = new Date();
  const start = new Date(dateStarted);
  const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return Math.max(diff + 1, 1);
};

// ================================================================
// LIST & SEARCH PATIENTS
// ================================================================
export const listPatients = async (filters = {}) => {
  const { page, limit, skip } = getPagination(filters);

  const query = {
  ...(filters.barangay_id && { barangay_id: filters.barangay_id }),
  ...(filters.risk_level && { 'compliance.risk_level': filters.risk_level }),
  ...(filters.escalation_level !== undefined && { 'escalation.level': parseInt(filters.escalation_level) }),
  ...(filters.treatment_phase && { treatment_phase: filters.treatment_phase }),
  ...(filters.is_active !== undefined && { is_active: filters.is_active === 'true' }),
  ...(filters.search && {
    $or: [
      { full_name: { $regex: filters.search, $options: 'i' } },
      { tb_case_number: { $regex: filters.search, $options: 'i' } },
      { patient_id: { $regex: filters.search, $options: 'i' } },
    ],
  }),
};

  const [patients, total] = await Promise.all([
    Patient.find(query).skip(skip).limit(limit).sort({ created_at: -1 }),
    Patient.countDocuments(query),
  ]);

  return { patients, total, page, limit };
};

// ================================================================
// GET PATIENT BY ID
// ================================================================
export const getPatientById = async (patientId, requester) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');
  assertSameBarangay(requester, patient.barangay_id);
  return patient;
};

// ================================================================
// GET PATIENT BY USER ID (mobile self-view)
// ================================================================
export const getPatientByUserId = async (userId) => {
  const patient = await Patient.findOne({ user_id: userId });
  if (!patient) throw createError(404, 'No patient record linked to this account.');
  return patient;
};

// ================================================================
// REGISTER PATIENT
// ================================================================
export const registerPatient = async (data, requester) => {
  const existingPhone = await Patient.findOne({ phone_number: data.phone_number });
  if (existingPhone) throw createError(409, 'A patient with this phone number already exists.');

  if (data.philhealth_number) {
    const existingPhilHealth = await Patient.findOne({ philhealth_number: data.philhealth_number });
    if (existingPhilHealth)
      throw createError(409, 'A patient with this PhilHealth number already exists.');
  }

  const patientId = await generatePatientId();
  const tbCaseNumber = await generateCaseNumber();
  const endDate = computeEndDate(data.date_started, 6);
  const sputumSchedule = buildSputumSchedule(data.date_started);

  const initialCompliance = {
    total_doses_required: 168,
    doses_taken: 0,
    doses_missed: 0,
    doses_remaining: 168,
    compliance_percentage: 0,
    adherence: 'Pending',
    consecutive_missed_doses: 0,
    last_dose_taken: null,
    risk_level: 'Compliant',
  };

  const initialRiskScore = {
    score: 0,
    factors: {
      consecutive_missed: 0,
      symptom_frequency: 0,
      days_into_treatment: 1,
      phase_weight: data.treatment_phase === 'Intensive' ? 1.2 : 1.0,
    },
    last_computed: new Date(),
  };

  const patient = new Patient({
    patient_id: patientId,
    tb_case_number: tbCaseNumber,
    user_id: null,
    registered_by: requester.user_id,
    last_name: data.last_name,
    first_name: data.first_name,
    middle_name: data.middle_name || '',
    full_name: `${data.first_name} ${data.middle_name || ''} ${data.last_name}`.trim(),
    birth_date: new Date(data.birth_date),
    age: data.age,
    sex: data.sex,
    philhealth_number: data.philhealth_number || null,
    phone_number: data.phone_number,
    email: data.email || null,
barangay_id: requester.role === ROLES.SUPER_ADMIN ? data.barangay_id : requester.barangay_id,
barangay_name: requester.role === ROLES.SUPER_ADMIN ? data.barangay_name : requester.barangay_name ?? data.barangay_name,
health_center_id: requester.role === ROLES.SUPER_ADMIN ? data.health_center_id : requester.health_center_id,
health_center_name: requester.role === ROLES.SUPER_ADMIN ? data.health_center_name : requester.health_center_name ?? data.health_center_name,
    assigned_nurse_id:
      requester.role === ROLES.NURSE ? requester.user_id : data.assigned_nurse_id || null,
    diagnosis: data.diagnosis,
    date_of_diagnosis: new Date(data.date_of_diagnosis),
    classification: data.classification,
    bacteriological_status: data.bacteriological_status,
    patient_type: {
      is_new: data.patient_type?.is_new ?? true,
      is_retreatment: data.patient_type?.is_retreatment ?? false,
      is_drug_susceptible: data.patient_type?.is_drug_susceptible ?? true,
      is_drug_resistant: data.patient_type?.is_drug_resistant ?? false,
    },
    treatment_phase: data.treatment_phase,
    location_of_treatment: data.location_of_treatment,
    date_started: new Date(data.date_started),
    end_date: endDate,
    treatment_duration_months: 6,
    schedule_of_treatment: new Date(data.date_started),
    dat_support: data.dat_support,
    regimen_type: data.regimen_type,
    drug_regimen: data.drug_regimen,
    treatment_supporter: data.treatment_supporter || { name: null, contact: null },
    treatment_outcome: {
      status: 'On Treatment',
      date_of_outcome: null,
      recorded_by: null,
    },
    contact_tracing: {
      number_of_contacts: data.contact_tracing?.number_of_contacts ?? 0,
      schedule: data.contact_tracing?.schedule ? new Date(data.contact_tracing.schedule) : null,
    },
    additional_notes: data.additional_notes || '',
    sputum_test_schedule: sputumSchedule,
    compliance: initialCompliance,
    risk_score: initialRiskScore,
    escalation: {
      level: 0,
      escalated_at: null,
      escalated_by: 'system',
      acknowledged_by: null,
      acknowledged_at: null,
      notes: '',
    },
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  await patient.save();

  const defaultPin = Math.floor(1000 + Math.random() * 9000).toString();
  const pinHash = await bcrypt.hash(defaultPin, 12);
  const mobileUserId = await generateUserId();

  const mobileUser = new User({
    user_id: mobileUserId,
    role: 'patient',
    first_name: data.first_name,
    last_name: data.last_name,
    phone_number: data.phone_number,
    tb_case_number: tbCaseNumber,
    pin_hash: pinHash,
    patient_id: patientId,
    barangay_id: patient.barangay_id,
    health_center_id: patient.health_center_id,
    is_active: true,
  });

  await mobileUser.save();

  await Patient.findOneAndUpdate(
    { patient_id: patientId },
    { user_id: mobileUserId, updated_at: new Date() },
  );

  return { patient, defaultPin };
};

// ================================================================
// UPDATE PATIENT
// ================================================================
export const updatePatient = async (patientId, data, requester) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');
  assertSameBarangay(requester, patient.barangay_id);

  const firstName = data.first_name || patient.first_name;
  const middleName = data.middle_name ?? patient.middle_name;
  const lastName = data.last_name || patient.last_name;
  const fullName = `${firstName} ${middleName || ''} ${lastName}`.trim();

  const dateStarted = data.date_started ? new Date(data.date_started) : patient.date_started;
  const endDate = computeEndDate(dateStarted, 6);
  const sputumSchedule = data.date_started
    ? buildSputumSchedule(dateStarted)
    : patient.sputum_test_schedule;

  const allowedUpdates = {
    ...(data.first_name && { first_name: data.first_name }),
    ...(data.last_name && { last_name: data.last_name }),
    ...(data.middle_name !== undefined && { middle_name: data.middle_name }),
    full_name: fullName,
    ...(data.birth_date && { birth_date: new Date(data.birth_date) }),
    ...(data.age && { age: data.age }),
    ...(data.sex && { sex: data.sex }),
    ...(data.philhealth_number !== undefined && { philhealth_number: data.philhealth_number }),
    ...(data.phone_number && { phone_number: data.phone_number }),
    ...(data.email !== undefined && { email: data.email }),
    ...(data.diagnosis && { diagnosis: data.diagnosis }),
    ...(data.date_of_diagnosis && { date_of_diagnosis: new Date(data.date_of_diagnosis) }),
    ...(data.classification && { classification: data.classification }),
    ...(data.bacteriological_status && { bacteriological_status: data.bacteriological_status }),
    ...(data.patient_type && { patient_type: data.patient_type }),
    ...(data.treatment_phase && { treatment_phase: data.treatment_phase }),
    ...(data.location_of_treatment && { location_of_treatment: data.location_of_treatment }),
    ...(data.date_started && {
      date_started: dateStarted,
      end_date: endDate,
      schedule_of_treatment: dateStarted,
      sputum_test_schedule: sputumSchedule,
    }),
    ...(data.dat_support && { dat_support: data.dat_support }),
    ...(data.regimen_type && { regimen_type: data.regimen_type }),
    ...(data.drug_regimen && { drug_regimen: data.drug_regimen }),
    ...(data.treatment_supporter && { treatment_supporter: data.treatment_supporter }),
    ...(data.contact_tracing && { contact_tracing: data.contact_tracing }),
    ...(data.additional_notes !== undefined && { additional_notes: data.additional_notes }),
    ...(data.assigned_nurse_id && { assigned_nurse_id: data.assigned_nurse_id }),
    updated_at: new Date(),
  };

  const updated = await Patient.findOneAndUpdate({ patient_id: patientId }, allowedUpdates, {
    new: true,
  });

  return updated;
};

// ================================================================
// UPDATE TREATMENT OUTCOME
// ================================================================
export const updateTreatmentOutcome = async (patientId, data, requester) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');
  assertSameBarangay(requester, patient.barangay_id);

  const terminalStatuses = [
    'Cured', 'Treatment Completed', 'Treatment Failed',
    'Died', 'Lost to Follow-Up', 'Not Evaluated',
  ];
  const isTerminal = terminalStatuses.includes(data.status);

  const updated = await Patient.findOneAndUpdate(
    { patient_id: patientId },
    {
      'treatment_outcome.status': data.status,
      'treatment_outcome.date_of_outcome': new Date(),
      'treatment_outcome.recorded_by': requester.user_id,
      ...(isTerminal && { is_active: false }),
      updated_at: new Date(),
    },
    { new: true },
  );

  return updated;
};

// ================================================================
// UPDATE SPUTUM SCHEDULE
// ================================================================
export const updateSputumSchedule = async (patientId, data, requester) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');
  assertSameBarangay(requester, patient.barangay_id);

  const scheduleIndex = patient.sputum_test_schedule.findIndex((s) => s.month === data.month);
  if (scheduleIndex === -1)
    throw createError(400, `No sputum test scheduled for month ${data.month}.`);

  const updatedSchedule = [...patient.sputum_test_schedule];
  updatedSchedule[scheduleIndex] = {
    ...updatedSchedule[scheduleIndex],
    ...(data.due_date && { due_date: new Date(data.due_date) }),
    ...(data.status && { status: data.status }),
  };

  const updated = await Patient.findOneAndUpdate(
    { patient_id: patientId },
    { sputum_test_schedule: updatedSchedule, updated_at: new Date() },
    { new: true },
  );

  return updated;
};

// ================================================================
// DEACTIVATE / REACTIVATE
// ================================================================
export const setPatientActiveStatus = async (patientId, isActive, requester) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');
  assertSameBarangay(requester, patient.barangay_id);

  await Patient.findOneAndUpdate(
    { patient_id: patientId },
    { is_active: isActive, updated_at: new Date() },
  );
};

// ================================================================
// EXPORT PDF
// ================================================================
export const exportPatientsPdf = async (filters = {}) => {
  const query = {
    ...(filters.barangay_id && { barangay_id: filters.barangay_id }),
    ...(filters.risk_level && { 'compliance.risk_level': filters.risk_level }),
    ...(filters.treatment_phase && { treatment_phase: filters.treatment_phase }),
    ...(filters.is_active !== undefined && { is_active: filters.is_active === 'true' }),
  };

  const patients = await Patient.find(query).sort({ created_at: -1 });
  if (!patients.length) throw createError(404, 'No patients found for the given filters.');

  return await exportPatientListPdf(patients);
};

// ================================================================
// LINK MOBILE ACCOUNT TO PATIENT RECORD
// ================================================================
export const linkUserAccount = async (patientId, userId) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');
  if (patient.user_id)
    throw createError(409, 'This patient already has a linked mobile account.');

  await Patient.findOneAndUpdate(
    { patient_id: patientId },
    { user_id: userId, updated_at: new Date() },
  );
};

// ================================================================
// RECOMPUTE COMPLIANCE & RISK SCORE
// ================================================================
export const recomputePatientCompliance = async (patientId) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');

  const updatedCompliance = await computeCompliance(patient);
  const updatedRiskScore = computeRiskScore({
    consecutive_missed: updatedCompliance.consecutive_missed_doses,
    symptom_frequency: patient.risk_score.factors.symptom_frequency,
    days_into_treatment: computeTreatmentDay(patient.date_started),
    treatment_phase: patient.treatment_phase,
  });

  await Patient.findOneAndUpdate(
    { patient_id: patientId },
    { compliance: updatedCompliance, risk_score: updatedRiskScore, updated_at: new Date() },
  );
};