import cron from "node-cron";
import Patient from "../models/Patient.model.js";
import MedicationLog from "../models/MedicationLog.model.js";
import User from "../models/User.model.js";
import { computeComplianceSummary } from "../utils/complianceCalculator.js";
import { computeStreaks } from "../utils/streakCalculator.js";
import { notifyPatient } from "../utils/notifyPatient.js";
import logger from "../utils/logger.js";

const dateOnly = (d) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const addDays = (d, days) => {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
};

export const runMissedDoseJob = async () => {
  logger.info("[missedDose.job] Checking for patients who missed a dose...");

  try {
    const now = new Date();
    const todayStart = dateOnly(now);

    const patients = await Patient.find({
      is_active: true,
      date_started: { $lte: now },
      end_date: { $gte: now },
    });

    for (const patient of patients) {
      const cursorStart = patient.compliance?.last_missed_check
        ? addDays(dateOnly(patient.compliance.last_missed_check), 1)
        : dateOnly(patient.date_started);

      if (cursorStart > todayStart) continue;

      const missedDays = [];
      for (
        let day = cursorStart;
        day <= todayStart;
        day = addDays(day, 1)
      ) {
        const dayEnd = addDays(day, 1);
        const loggedThatDay = await MedicationLog.exists({
          patient_id: patient.patient_id,
          log_date: { $gte: day, $lt: dayEnd },
        });
        if (!loggedThatDay) missedDays.push(new Date(day));
      }

      if (missedDays.length === 0) {
        await Patient.updateOne(
          { patient_id: patient.patient_id },
          { $set: { "compliance.last_missed_check": todayStart } },
        );
        continue;
      }

      const dosesTaken = patient.compliance?.doses_taken ?? 0;
      const totalRequired = patient.compliance?.total_doses_required ?? 0;
      const dosesMissed = (patient.compliance?.doses_missed ?? 0) + missedDays.length;

      const { consecutiveDaysTaken, consecutiveMissedDoses } =
        await computeStreaks(patient.patient_id, patient.date_started);

      const summary = computeComplianceSummary({
        totalDosesRequired: totalRequired,
        dosesTaken,
        dosesMissed,
        consecutiveMissedDoses,
        lastDoseTaken: patient.compliance?.last_dose_taken ?? null,
      });
      summary.consecutive_days_taken = consecutiveDaysTaken;
      summary.last_missed_check = todayStart;

      await Patient.updateOne(
        { patient_id: patient.patient_id },
        { $set: { compliance: summary, updated_at: now } },
      );

      if (patient.user_id) {
        const user = await User.findOne({ user_id: patient.user_id });
        for (const missedDay of missedDays) {
          await notifyPatient({
            userId: patient.user_id,
            fcmToken: user?.fcm_token,
            type: "missed_dose",
            title: "You missed your medication",
            body: `We didn't see a medication log from you on ${missedDay.toDateString()}. Please don't skip your treatment — log your next dose as soon as you can.`,
            data: {
              deep_link: "respiratrack://medication-log",
              tb_case_number: patient.tb_case_number,
              missed_date: missedDay.toISOString().split("T")[0],
            },
          });
        }
      }

      logger.warn(
        `[missedDose.job] ${patient.tb_case_number} missed ${missedDays.length} day(s) — streak now ${consecutiveMissedDoses}`,
      );
    }

    logger.info("[missedDose.job] Completed.");
  } catch (err) {
    logger.error(`[missedDose.job] Error: ${err.message}`);
  }
};

export const scheduleMissedDoseJob = () => {
  cron.schedule("0 21 * * *", runMissedDoseJob, { timezone: "Asia/Manila" });
  logger.info("[missedDose.job] Scheduled — daily at 21:00 Asia/Manila");
};
