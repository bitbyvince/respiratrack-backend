import cron from "node-cron";
import Patient from "../models/Patient.model.js";
import MedicationLog from "../models/MedicationLog.model.js";
import User from "../models/User.model.js";
import { db } from "../config/firebase.js";
import { notifyPatient } from "../utils/notifyPatient.js";
import logger from "../utils/logger.js";

const DEFAULT_REMINDER_HOUR = 8;

/**
 * Medication Reminder Job
 * Runs hourly. For each active patient currently in their treatment
 * window who hasn't logged a dose yet today, sends a reminder once
 * the current hour (Asia/Manila) matches their chosen reminder time
 * (notification_preferences/{user_id} in Firestore — defaults to
 * 08:00 and "enabled" if the patient never set a preference).
 */
export const runMedicationReminderJob = async () => {
  logger.info("[medicationReminder.job] Checking patients due for a reminder...");

  try {
    const now = new Date();
    const manilaHour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Manila",
      }).format(now),
    );

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const patients = await Patient.find({
      is_active: true,
      date_started: { $lte: now },
      end_date: { $gte: now },
    });

    for (const patient of patients) {
      if (!patient.user_id) continue;

      const alreadyLogged = await MedicationLog.exists({
        patient_id: patient.patient_id,
        log_date: { $gte: todayStart, $lt: todayEnd },
      });
      if (alreadyLogged) continue;

      let reminderHour = DEFAULT_REMINDER_HOUR;
      let enabled = true;
      try {
        const prefDoc = await db
          .collection("notification_preferences")
          .doc(patient.user_id)
          .get();
        if (prefDoc.exists) {
          const prefs = prefDoc.data();
          if (prefs.medication_reminder === false) enabled = false;
          if (typeof prefs.reminder_hour === "number") {
            reminderHour = prefs.reminder_hour;
          }
        }
      } catch (err) {
        logger.warn(
          `[medicationReminder.job] Preference lookup failed for ${patient.user_id}: ${err.message}`,
        );
      }

      if (!enabled || manilaHour !== reminderHour) continue;

      const user = await User.findOne({ user_id: patient.user_id });

      await notifyPatient({
        userId: patient.user_id,
        fcmToken: user?.fcm_token,
        type: "medication_reminder",
        title: "Time to take your medicine",
        body: `Don't forget your Anti-TB dose today, ${patient.first_name}. Log it once you've taken it.`,
        data: {
          deep_link: "respiratrack://medication-log",
          tb_case_number: patient.tb_case_number,
        },
      });

      logger.info(`[medicationReminder.job] Reminder sent to ${patient.tb_case_number}`);
    }

    logger.info("[medicationReminder.job] Completed.");
  } catch (err) {
    logger.error(`[medicationReminder.job] Error: ${err.message}`);
  }
};

export const scheduleMedicationReminderJob = () => {
  cron.schedule("0 * * * *", runMedicationReminderJob, { timezone: "Asia/Manila" });
  logger.info("[medicationReminder.job] Scheduled — hourly, Asia/Manila");
};
