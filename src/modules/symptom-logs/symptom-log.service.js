const SymptomLog = require('../../models/SymptomLog.model');
const Patient = require('../../models/Patient.model');

const VALID_SYMPTOMS = [
  'Nausea',
  'Vomiting',
  'Rash',
  'Joint Pain',
  'Dizziness',
  'Blurred Vision',
  'Abdominal Pain',
  'Fever',
  'Fatigue',
  'Other',
];

const generateLogId = async () => {
  const count = await SymptomLog.countDocuments();
  return `SYM-LOG-${String(count + 1).padStart(4, '0')}`;
};

exports.logSymptom = async (data, user) => {
  const { patient_id, symptoms, free_text_notes } = data;

  const patient = await Patient.findOne({ patient_id });
  if (!patient) throw new Error('Patient not found.');

  for (const s of symptoms) {
    if (!VALID_SYMPTOMS.includes(s.symptom)) {
      throw new Error(`Invalid symptom: ${s.symptom}. Must be one of: ${VALID_SYMPTOMS.join(', ')}`);
    }
    if (![1, 2, 3].includes(s.severity)) {
      throw new Error(`Invalid severity for ${s.symptom}. Must be 1 (Mild), 2 (Moderate), or 3 (Severe).`);
    }
  }

  const logId = await generateLogId();

  const log = await SymptomLog.create({
    log_id: logId,
    patient_id,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    logged_at: new Date(),
    symptoms,
    free_text_notes: free_text_notes || '',
    reviewed_by: null,
    reviewed_at: null,
  });

  return log;
};

exports.getPatientLogs = async (patientId, { page, limit, from, to, severity }) => {
  const query = { patient_id: patientId };

  if (from || to) {
    query.logged_at = {};
    if (from) query.logged_at.$gte = new Date(from);
    if (to) query.logged_at.$lte = new Date(to);
  }

  if (severity) {
    query['symptoms.severity'] = parseInt(severity);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [logs, total] = await Promise.all([
    SymptomLog.find(query).sort({ logged_at: -1 }).skip(skip).limit(parseInt(limit)),
    SymptomLog.countDocuments(query),
  ]);

  return { logs, total, page: parseInt(page), limit: parseInt(limit) };
};

exports.getLatestLog = async (patientId) => {
  return await SymptomLog.findOne({ patient_id: patientId }).sort({ logged_at: -1 });
};

exports.getBarangayLogs = async (barangayId, { date, reviewed }) => {
  const query = { barangay_id: barangayId };

  if (date) {
    const start = new Date(date);
    const end = new Date(start.getTime() + 86400000);
    query.logged_at = { $gte: start, $lt: end };
  }

  if (reviewed !== undefined) {
    if (reviewed === 'true') {
      query.reviewed_by = { $ne: null };
    } else {
      query.reviewed_by = null;
    }
  }

  return await SymptomLog.find(query).sort({ logged_at: -1 });
};

exports.reviewLog = async (logId, user) => {
  const log = await SymptomLog.findOne({ log_id: logId });
  if (!log) throw new Error('Symptom log not found.');
  if (log.reviewed_by) throw new Error('This log has already been reviewed.');

  log.reviewed_by = user.user_id;
  log.reviewed_at = new Date();
  await log.save();

  return log;
};