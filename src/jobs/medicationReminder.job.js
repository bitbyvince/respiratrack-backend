import Patient from "../models/Patient.model.js";
import MedicationLog from "../models/MedicationLog.model.js";
import User from "../models/User.model.js";
import { db } from "../config/firebase.js";
import { notifyPatient } from "../utils/notifyPatient.js";
import logger from "../utils/logger.js";

const DEFAULT_REMINDER_HOUR = 8;

const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
});

export const runMedicationReminderJob = async () => {
  logger.info("[medicationReminder.job] Checking patients due for a reminder...");

  try {
    const now = new Date();
    const todayManilaDate = manilaDateFormatter.format(now);
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

      const lastSent = patient.last_reminder_sent;
      if (lastSent && manilaDateFormatter.format(new Date(lastSent)) === todayManilaDate) {
        continue;
      }

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

      const drugList = (patient.drug_regimen || [])
        .map((d) => `${d.drug_name} ${d.strength}`)
        .join(", ");
      const body = drugList
        ? `Don't forget to take your ${drugList} today, ${patient.first_name}. Log it once you've taken it.`
        : `Don't forget your medication today, ${patient.first_name}. Log it once you've taken it.`;

      await notifyPatient({
        userId: patient.user_id,
        fcmToken: user?.fcm_token,
        type: "medication_reminder",
        title: "Time to take your medicine",
        body,
        data: {
          deep_link: "respiratrack://medication-log",
          tb_case_number: patient.tb_case_number,
        },
      });

      await Patient.updateOne(
        { patient_id: patient.patient_id },
        { $set: { last_reminder_sent: now } },
      );

      logger.info(`[medicationReminder.job] Reminder sent to ${patient.tb_case_number}`);
    }

    logger.info("[medicationReminder.job] Completed.");
  } catch (err) {
    logger.error(`[medicationReminder.job] Error: ${err.message}`);
  }
};
