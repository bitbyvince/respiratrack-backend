import SymptomLog from "../../models/SymptomLog.model.js";
import Patient from "../../models/Patient.model.js";
import { generateSymptomLogsPdf } from "../../utils/pdfExporter.js";
import { ROLES } from "../../constants/roles.js";

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
    health_center_id: patient.health_center_id,
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

// Used by the admin web panel — barangay_id/health_center_id scoping
// is resolved by the controller based on the requester's role, same
// pattern as every other admin list endpoint in this app.
export const listSymptomLogs = async ({
  barangayId,
  healthCenterId,
  page = 1,
  limit = 20,
  from,
  to,
  severity,
  reviewed,
}) => {
  const query = {};
  if (healthCenterId) query.health_center_id = healthCenterId;
  else if (barangayId) query.barangay_id = barangayId;

  if (from || to) {
    query.logged_at = {};
    if (from) query.logged_at.$gte = new Date(from);
    if (to) query.logged_at.$lte = new Date(to);
  }
  if (severity) query["symptoms.severity"] = parseInt(severity);
  if (reviewed !== undefined) {
    query.reviewed_by = reviewed === "true" || reviewed === true ? { $ne: null } : null;
  }

  const parsedPage = parseInt(page) || 1;
  const parsedLimit = parseInt(limit) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [logs, total] = await Promise.all([
    SymptomLog.find(query).sort({ logged_at: -1 }).skip(skip).limit(parsedLimit),
    SymptomLog.countDocuments(query),
  ]);

  // Enrich with patient name/health center for display — the log
  // itself only carries tb_case_number + barangay_id.
  const patientIds = [...new Set(logs.map((l) => l.patient_id))];
  const patients = await Patient.find(
    { patient_id: { $in: patientIds } },
    { patient_id: 1, full_name: 1, barangay_name: 1, health_center_name: 1 },
  ).lean();
  const patientById = Object.fromEntries(patients.map((p) => [p.patient_id, p]));

  const data = logs.map((log) => {
    const obj = log.toObject();
    const patient = patientById[log.patient_id];
    obj.patient_name = patient?.full_name ?? null;
    obj.barangay_name = patient?.barangay_name ?? null;
    obj.health_center_name = patient?.health_center_name ?? null;
    return obj;
  });

  return { data, total, page: parsedPage, limit: parsedLimit, pages: Math.ceil(total / parsedLimit) };
};

export const exportSymptomLogsPdf = async (filters = {}, requesterRole = null) => {
  const { data } = await listSymptomLogs({ ...filters, page: 1, limit: 10000 });
  if (!data.length) throw new Error("No symptom logs found for the given filters.");

  // Scoped to one health center/barangay — every returned log shares
  // the same denormalized name, so the first record is representative
  // (same trick patient.service.js's exportPatientsPdf already uses).
  const scoped = Boolean(filters.healthCenterId || filters.barangayId);
  return generateSymptomLogsPdf(data, {
    barangayName: scoped ? data[0].barangay_name : null,
    healthCenterName: scoped ? data[0].health_center_name : null,
    isPatc: requesterRole === ROLES.PATC,
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
