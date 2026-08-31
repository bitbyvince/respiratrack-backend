import SymptomLog from "../../models/SymptomLog.model.js";
import Patient from "../../models/Patient.model.js";

const VALID_SYMPTOMS = [
  "Nausea",
  "Vomiting",
  "Rash",
  "Joint Pain",
  "Dizziness",
  "Blurred Vision",
  "Abdominal Pain",
  "Fever",
  "Fatigue",
  "Other",
];

const generateLogId = async () => {
  const count = await SymptomLog.countDocuments();
  return `SYM-LOG-${String(count + 1).padStart(4, "0")}`;
};

export const logSymptom = async (data, user) => {
  const { patient_id, symptoms, free_text_notes } = data;

  const patient = await Patient.findOne({ patient_id });
  if (!patient) throw new Error("Patient not found.");

  for (const s of symptoms) {
    if (!VALID_SYMPTOMS.includes(s.symptom))
      throw new Error(
        `Invalid symptom: ${s.symptom}. Must be one of: ${VALID_SYMPTOMS.join(", ")}`,
      );
    if (![1, 2, 3].includes(s.severity))
      throw new Error(
        `Invalid severity for ${s.symptom}. Must be 1 (Mild), 2 (Moderate), or 3 (Severe).`,
      );
  }

  return SymptomLog.create({
    log_id: await generateLogId(),
    patient_id,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    logged_at: new Date(),
    symptoms,
    free_text_notes: free_text_notes || "",
    reviewed_by: null,
    reviewed_at: null,
  });
};

export const getPatientLogs = async (
  patientId,
  { page, limit, from, to, severity },
) => {
  const query = { patient_id: patientId };
  if (from || to) {
    query.logged_at = {};
    if (from) query.logged_at.$gte = new Date(from);
    if (to) query.logged_at.$lte = new Date(to);
  }
  if (severity) query["symptoms.severity"] = parseInt(severity);

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [logs, total] = await Promise.all([
    SymptomLog.find(query)
      .sort({ logged_at: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    SymptomLog.countDocuments(query),
  ]);
  return { logs, total, page: parseInt(page), limit: parseInt(limit) };
};

export const getLatestLog = async (patientId) =>
  SymptomLog.findOne({ patient_id: patientId }).sort({ logged_at: -1 });

export const getTodayLog = async (patientId) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  return SymptomLog.findOne({
    patient_id: patientId,
    logged_at: { $gte: start, $lt: end },
  });
};

export const getBarangayLogs = async (barangayId, { date, reviewed }) => {
  const query = { barangay_id: barangayId };
  if (date) {
    const start = new Date(date);
    query.logged_at = {
      $gte: start,
      $lt: new Date(start.getTime() + 86400000),
    };
  }
  if (reviewed !== undefined) {
    query.reviewed_by = reviewed === "true" ? { $ne: null } : null;
  }
  return SymptomLog.find(query).sort({ logged_at: -1 });
};

export const reviewLog = async (logId, user) => {
  const log = await SymptomLog.findOne({ log_id: logId });
  if (!log) throw new Error("Symptom log not found.");
  if (log.reviewed_by) throw new Error("This log has already been reviewed.");
  log.reviewed_by = user.user_id;
  log.reviewed_at = new Date();
  await log.save();
  return log;
};
