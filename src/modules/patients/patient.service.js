import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import Patient from '../../models/Patient.model.js';
import User from '../../models/User.model.js';
import Alert from '../../models/Alert.model.js';
import { createError } from '../../utils/apiResponse.js';
import { generateCaseNumber } from '../../utils/caseNumberGenerator.js';
import { computePatientCompliance } from '../../utils/complianceEngine.js';
import { generatePatientListPdf } from '../../utils/pdfExporter.js';
import ROLES, { isSuperAdminLevel } from '../../constants/roles.js';
import { createAlert } from '../alerts/alert.service.js';
import { sendToDevice } from '../../utils/firebaseMessaging.js';

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
  if (!isSuperAdminLevel(requester.role) && requester.barangay_id !== targetBarangayId) {
    throw createError(403, 'Access denied. Patient belongs to a different barangay.');
  }
};

// ── GENERATE SEQUENTIAL PATIENT ID ──────────────────────
// Uses regex + sort by patient_id (Tablet fix: more reliable than sorting by created_at)
const generatePatientId = async () => {
  const latest = await Patient.findOne(
    { patient_id: { $regex: '^PT-' } },
    { patient_id: 1 }
  ).sort({ patient_id: -1 });

  if (!latest) return 'PT-0001';
  const num = parseInt(latest.patient_id.split('-')[1], 10);
  return `PT-${String(num + 1).padStart(4, '0')}`;
};

// ── GENERATE SEQUENTIAL USER ID ──────────────────────────
// Kept from Web: human-readable USR-XXXX format used across system
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

// ================================================================
// LIST & SEARCH PATIENTS
// ================================================================
export const listPatients = async (filters = {}) => {
  const { page, limit, skip } = getPagination(filters);

  const query = {
    ...(filters.barangay_id && { barangay_id: filters.barangay_id }),
    ...(filters.risk_level && { 'compliance.risk_level': filters.risk_level }),
    // Web-only filter: escalation level
    ...(filters.escalation_level !== undefined && {
      'escalation.level': parseInt(filters.escalation_level),
    }),
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
// Tablet improvement: supports both patient_id string and MongoDB _id
export const getPatientById = async (patientId, requester) => {
  const isMongoId = /^[a-f\d]{24}$/i.test(patientId);
  const patient = await Patient.findOne(
    isMongoId
      ? { $or: [{ patient_id: patientId }, { _id: patientId }] }
      : { patient_id: patientId }
  );
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

export const updateMyContact = async (userId, data) => {
  const patient = await Patient.findOne({ user_id: userId });
  if (!patient) throw createError(404, 'No patient record linked to this account.');

  const changes = [];

  if (data.phone_number !== undefined && data.phone_number !== '' && data.phone_number !== patient.phone_number) {
    changes.push(`phone number to ${data.phone_number}`);
    patient.phone_number = data.phone_number;
  }
  if (data.email !== undefined && data.email !== '' && data.email !== patient.email) {
    changes.push(`email to ${data.email}`);
    patient.email = data.email;
  }

  await patient.save();

  if (changes.length > 0) {
    await notifyNurseOfContactChange(patient, changes);
  }

  return patient;
};

const notifyNurseOfContactChange = async (patient, changes) => {
  const message = `Patient ${patient.tb_case_number} updated their ${changes.join(' and ')}. Please re-verify before your next contact attempt.`;

  await Alert.create({
    alert_id: await Alert.generateNextId(),
    patient_id: patient.patient_id,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    alert_type: 'Contact Info Updated',
    escalation_level: 0,
    message,
    severity: 'Info',
    status: 'Active',
    target_roles: ['nurse'],
    created_at: new Date(),
    resolved_at: null,
    resolved_by: null,
  });

  if (!patient.assigned_nurse_id) return;
  const nurse = await User.findOne({ user_id: patient.assigned_nurse_id });
  if (!nurse?.fcm_token) return;

  try {
    await sendToDevice({
      fcmToken: nurse.fcm_token,
      title: 'Patient Contact Info Changed',
      body: message,
      data: {
        type: 'contact_info_updated',
        patient_id: patient.patient_id,
      },
    });
  } catch {
    // Best-effort push; the Alert record above is the source of truth.
  }
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

  const defaultPin = randomInt(1000, 10000).toString();
  const pinHash = await bcrypt.hash(defaultPin, 12);
  const mobileUserId = await generateUserId();

  // Tablet improvement: filter(Boolean) prevents double spaces from missing middle name
  const nameParts = [data.first_name, data.middle_name, data.last_name].filter(Boolean);

  const initialCompliance = { total_doses_required: 168 };

  const patient = new Patient({
    patient_id: patientId,
    tb_case_number: tbCaseNumber,
    user_id: mobileUserId,
    registered_by: requester.user_id,
    last_name: data.last_name,
    first_name: data.first_name,
    middle_name: data.middle_name || '',
    full_name: nameParts.join(' '),
    birth_date: new Date(data.birth_date),
    age: data.age,
    sex: data.sex,
    philhealth_number: data.philhealth_number || null,
    phone_number: data.phone_number,
    email: data.email || null,
    // Web: SUPER_ADMIN/PATC can register for any barangay; others are scoped to their own
    barangay_id: isSuperAdminLevel(requester.role) ? data.barangay_id : requester.barangay_id,
    barangay_name: isSuperAdminLevel(requester.role) ? data.barangay_name : requester.barangay_name ?? data.barangay_name,
    health_center_id: isSuperAdminLevel(requester.role) ? data.health_center_id : requester.health_center_id,
    health_center_name: isSuperAdminLevel(requester.role) ? data.health_center_name : requester.health_center_name ?? data.health_center_name,
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

  const { compliance, risk_score } = await computePatientCompliance(patient);
  await Patient.updateOne({ patient_id: patient.patient_id }, { $set: { compliance, risk_score } });

    // Notify barangay_admin/patc/super_admin that this health center needs restocking
    try {
      const drugList = (patient.drug_regimen || [])
        .map((d) => `${d.drug_name} ${d.strength} x${d.number_to_be_taken}/dose`)
        .join(', ');
      const category = patient.patient_type?.is_retreatment ? 'Retreatment' : 'New';

      await createAlert({
        patient_id: patient.patient_id,
        tb_case_number: patient.tb_case_number,
        barangay_id: patient.barangay_id,
        alert_type: 'Stock Request',
        severity: 'Warning',
        message: `${category} patient ${patient.full_name} (${patient.tb_case_number}) registered at ${patient.health_center_name}, ${patient.barangay_name}. Regimen: ${patient.regimen_type || 'N/A'} — ${drugList || 'see patient record'}. Please prepare stock.`,
        target_roles: ['super_admin', 'patc', 'barangay_admin'],
      });
    } catch (err) {
      console.error('Failed to create stock request alert:', err);
      // Don't let a notification failure block patient registration
    }

  // Tablet improvement: User.create() in one step; user_id already set above so no second update needed
  await User.create({
    user_id: mobileUserId,
    role: 'patient',
    first_name: data.first_name,
    last_name: data.last_name,
    email: data.email || null,
    phone_number: data.phone_number,
    tb_case_number: tbCaseNumber,
    patient_id: patientId,
    pin_hash: pinHash,
    barangay_id: patient.barangay_id,
    health_center_id: patient.health_center_id,
    is_active: true,
  });

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
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

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
// UPDATE PATIENT STATUS (Web route: PATCH /:patient_id/status)
// ================================================================
export const updatePatientStatus = async (patientId, status, requester) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');
  assertSameBarangay(requester, patient.barangay_id);

  const outcomeStatus =
    status === 'Completed' ? 'Treatment Completed' :
    status === 'Defaulted' ? 'Lost to Follow-Up' :
    'On Treatment';

  const updated = await Patient.findOneAndUpdate(
    { patient_id: patientId },
    {
      'treatment_outcome.status': outcomeStatus,
      'treatment_outcome.date_of_outcome': status !== 'Active' ? new Date() : null,
      'treatment_outcome.recorded_by': requester.user_id,
      is_active: status === 'Active',
      updated_at: new Date(),
    },
    { new: true },
  );

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

    return await generatePatientListPdf(patients);
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

export const recomputePatientCompliance = async (patientId) => {
  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw createError(404, 'Patient not found.');

  const { compliance, risk_score } = await computePatientCompliance(patient);

  await Patient.findOneAndUpdate(
    { patient_id: patientId },
    { compliance, risk_score, updated_at: new Date() },
  );
};