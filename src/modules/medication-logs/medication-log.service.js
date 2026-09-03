import MedicationLog from "../../models/MedicationLog.model.js";
import Patient from "../../models/Patient.model.js";
import { computeStreaks } from "../../utils/streakCalculator.js";

const generateLogId = async () => {
  const count = await MedicationLog.countDocuments();
  return `MED-LOG-${String(count + 1).padStart(4, "0")}`;
};

export async function logMedication(data, user) {
  const { patient_id, log_date, medicines, notes } = data;

  const patient = await Patient.findOne({ patient_id });
  if (!patient) throw new Error("Patient not found.");

  const dateObj = log_date ? new Date(log_date) : new Date();
  const dateOnly = dateObj.toISOString().split("T")[0];
  const todayOnly = new Date().toISOString().split("T")[0];

  if (user.role === "patient" && dateOnly < todayOnly) {
    throw new Error("That day has already ended and can no longer be logged.");
  }

  const existing = await MedicationLog.findOne({
    patient_id,
    log_date: {
      $gte: new Date(dateOnly),
      $lt: new Date(new Date(dateOnly).getTime() + 86400000),
    },
  });
  if (existing) throw new Error("A medication log for this patient already exists for today.");

  const allTaken = medicines.every((m) => m.status === "Taken");
  const allMissed = medicines.every((m) => m.status === "Missed");
  const overall_status = allTaken ? "Taken" : allMissed ? "Missed" : "Partial";

  const treatmentStart = new Date(patient.date_started);
  const treatment_day = Math.floor((dateObj - treatmentStart) / 86400000) + 1;

  const logId = await generateLogId();

  const log = await MedicationLog.create({
    log_id: logId,
    patient_id,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    log_date: new Date(dateOnly),
    logged_at: new Date(),
    logged_by: user.role === "patient" ? "patient" : "nurse",
    treatment_day,
    medicines,
    overall_status,
    notes: notes || "",
  });

  await updatePatientCompliance(patient, overall_status, dateObj);

  return log;
}

async function updatePatientCompliance(patient, overall_status, logDate) {
  const totalLogs = await MedicationLog.countDocuments({ patient_id: patient.patient_id });
  const takenLogs = await MedicationLog.countDocuments({
    patient_id: patient.patient_id,
    overall_status: { $in: ["Taken", "Partial"] },
  });

  const compliance_percentage =
    patient.compliance.total_doses_required > 0
      ? (takenLogs / patient.compliance.total_doses_required) * 100
      : 0;

  const { consecutiveDaysTaken, consecutiveMissedDoses } = await computeStreaks(
    patient.patient_id,
    patient.date_started,
  );
  const consecutive_missed_doses = consecutiveMissedDoses;

  const risk_level =
    consecutive_missed_doses >= 14
      ? "Defaulter"
      : consecutive_missed_doses >= 2
      ? "At Risk"
      : "Compliant";

  await Patient.updateOne(
    { patient_id: patient.patient_id },
    {
      $set: {
        "compliance.doses_taken": takenLogs,
        "compliance.doses_missed": totalLogs - takenLogs,
        "compliance.doses_remaining": patient.compliance.total_doses_required - takenLogs,
        "compliance.compliance_percentage": parseFloat(compliance_percentage.toFixed(2)),
        "compliance.consecutive_missed_doses": consecutive_missed_doses,
        "compliance.consecutive_days_taken": consecutiveDaysTaken,
        "compliance.risk_level": risk_level,
        "compliance.last_dose_taken":
          overall_status !== "Missed" ? logDate : patient.compliance.last_dose_taken,
        updated_at: new Date(),
      },
    }
  );
}

export async function getPatientLogs(patientId, { page, limit, status, from, to }) {
  const query = { patient_id: patientId };
  if (status) query.overall_status = status;
  if (from || to) {
    query.log_date = {};
    if (from) query.log_date.$gte = new Date(from);
    if (to) query.log_date.$lte = new Date(to);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [logs, total] = await Promise.all([
    MedicationLog.find(query).sort({ log_date: -1 }).skip(skip).limit(parseInt(limit)),
    MedicationLog.countDocuments(query),
  ]);

  return { logs, total, page: parseInt(page), limit: parseInt(limit) };
}

export async function getTodayLog(patientId) {
  const today = new Date();
  const start = new Date(today.toISOString().split("T")[0]);
  const end = new Date(start.getTime() + 86400000);

  return MedicationLog.findOne({
    patient_id: patientId,
    log_date: { $gte: start, $lt: end },
  });
}

export async function getMissedDoses(patientId, { from, to }) {
  const query = { patient_id: patientId, overall_status: "Missed" };
  if (from || to) {
    query.log_date = {};
    if (from) query.log_date.$gte = new Date(from);
    if (to) query.log_date.$lte = new Date(to);
  }
  return MedicationLog.find(query).sort({ log_date: -1 });
}

export async function getBarangayLogs(barangayId, { date, status }) {
  const query = { barangay_id: barangayId };
  if (status) query.overall_status = status;
  if (date) {
    const start = new Date(date);
    const end = new Date(start.getTime() + 86400000);
    query.log_date = { $gte: start, $lt: end };
  }
  return MedicationLog.find(query).sort({ log_date: -1 });
}

export async function updateLog(logId, data, user) {
  const log = await MedicationLog.findOne({ log_id: logId });
  if (!log) throw new Error("Log not found.");

  const { medicines, notes } = data;
  if (medicines) {
    const allTaken = medicines.every((m) => m.status === "Taken");
    const allMissed = medicines.every((m) => m.status === "Missed");
    log.medicines = medicines;
    log.overall_status = allTaken ? "Taken" : allMissed ? "Missed" : "Partial";
  }
  if (notes !== undefined) log.notes = notes;

  await log.save();

  const patient = await Patient.findOne({ patient_id: log.patient_id });
  if (patient) await updatePatientCompliance(patient, log.overall_status, log.log_date);

  return log;
}