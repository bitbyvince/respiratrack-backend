import MedicationLog from "../models/MedicationLog.model.js";
import SymptomLog from "../models/SymptomLog.model.js";
import { computeRiskScore } from "./riskScoring.js";

const DAY_MS = 86400000;

const dateOnly = (d) => new Date(new Date(d).toISOString().split("T")[0]);
const dateKey = (d) => d.toISOString().split("T")[0];

const walkBackward = (statusByDate, fromDate, stopDate, matches) => {
  let streak = 0;
  let cursor = new Date(fromDate);
  while (cursor >= stopDate) {
    if (!matches(statusByDate.get(dateKey(cursor)))) break;
    streak++;
    cursor = new Date(cursor.getTime() - DAY_MS);
  }
  return streak;
};

export async function computePatientCompliance(patient) {
  const totalDosesRequired = patient.compliance?.total_doses_required || 0;
  const startOnly = dateOnly(patient.date_started);
  const todayOnly = dateOnly(new Date());
  const todayKey = dateKey(todayOnly);

  const treatmentEndOnly = new Date(startOnly.getTime() + (totalDosesRequired - 1) * DAY_MS);
  const lastElapsedDay = todayOnly < treatmentEndOnly ? todayOnly : treatmentEndOnly;

  const logs = await MedicationLog.find({ patient_id: patient.patient_id })
    .select("log_date overall_status")
    .sort({ log_date: 1 });

  const statusByDate = new Map();
  for (const log of logs) {
    statusByDate.set(dateKey(dateOnly(log.log_date)), log.overall_status);
  }

  let dosesTaken = 0;
  let dosesMissed = 0;
  let lastDoseTaken = null;

  for (
    let cursor = new Date(startOnly);
    cursor <= lastElapsedDay;
    cursor = new Date(cursor.getTime() + DAY_MS)
  ) {
    const key = dateKey(cursor);
    const status = statusByDate.get(key);

    if (status === "Taken") {
      dosesTaken++;
      lastDoseTaken = new Date(cursor);
    } else if (status === "Partial" || status === "Missed") {
      dosesMissed++;
    } else if (key !== todayKey) {
      dosesMissed++;
    }
  }

  const dosesRemaining = Math.max(totalDosesRequired - dosesTaken - dosesMissed, 0);

  const compliancePercentage =
    totalDosesRequired > 0
      ? Math.min(parseFloat(((dosesTaken / totalDosesRequired) * 100).toFixed(2)), 100)
      : 0;

  const adherence =
    compliancePercentage === 0 ? "Pending" : compliancePercentage >= 90 ? "Regular" : "Irregular";

  let streakCursor = new Date(lastElapsedDay);
  if (dateKey(streakCursor) === todayKey && !statusByDate.has(todayKey)) {
    streakCursor = new Date(streakCursor.getTime() - DAY_MS);
  }

  const consecutiveDaysTaken = walkBackward(
    statusByDate, streakCursor, startOnly, (s) => s === "Taken",
  );
  const consecutiveMissedDoses = walkBackward(
    statusByDate, streakCursor, startOnly,
    (s) => s === "Partial" || s === "Missed" || s === undefined,
  );

  // Defaulter = 56 consecutive days with no dose logged (2 full 28-day
  // treatment months missed in a row) — matches the TB DOTS program's
  // own definition rather than an arbitrary shorter cutoff.
  const riskLevel =
    consecutiveMissedDoses >= 56 ? "Defaulter" : consecutiveMissedDoses >= 2 ? "At Risk" : "Compliant";

  const daysIntoTreatment = Math.max(Math.floor((todayOnly - startOnly) / DAY_MS) + 1, 1);

  const symptomWindowStart = new Date(todayOnly.getTime() - 14 * DAY_MS);
  const symptomFrequency = await SymptomLog.countDocuments({
    patient_id: patient.patient_id,
    logged_at: { $gte: symptomWindowStart },
  });

  const riskScore = computeRiskScore({
    consecutiveMissedDoses,
    symptomFrequency,
    daysIntoTreatment,
    treatmentPhase: patient.treatment_phase || "Intensive",
  });

  return {
    compliance: {
      total_doses_required: totalDosesRequired,
      doses_taken: dosesTaken,
      doses_missed: dosesMissed,
      doses_remaining: dosesRemaining,
      compliance_percentage: compliancePercentage,
      adherence,
      consecutive_missed_doses: consecutiveMissedDoses,
      consecutive_days_taken: consecutiveDaysTaken,
      last_dose_taken: lastDoseTaken,
      risk_level: riskLevel,
      last_missed_check: todayOnly,
    },
    risk_score: riskScore,
  };
}
