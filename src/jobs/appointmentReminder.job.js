import cron from "node-cron";
import Appointment from "../models/Appointment.model.js";
import Patient from "../models/Patient.model.js";
import User from "../models/User.model.js";
import { notifyPatient } from "../utils/notifyPatient.js";
import logger from "../utils/logger.js";

/**
 * Appointment Reminder Job
 * Runs every 15 minutes. Uses Appointment.getPendingReminders()
 * (Confirmed, not yet reminded, scheduled within the next 24h) and
 * notifies the patient once, then marks reminder_sent so it never
 * fires twice for the same appointment.
 */
export const runAppointmentReminderJob = async () => {
  logger.info("[appointmentReminder.job] Checking appointments due for a reminder...");

  try {
    const pending = await Appointment.getPendingReminders();

    for (const appt of pending) {
      const patient = await Patient.findOne({ patient_id: appt.patient_id });
      if (!patient?.user_id) continue;

      const user = await User.findOne({ user_id: patient.user_id });

      await notifyPatient({
        userId: patient.user_id,
        fcmToken: user?.fcm_token,
        type: "appointment_reminder",
        title: "Upcoming Appointment",
        body: `You have a ${appt.purpose} appointment tomorrow at ${appt.scheduled_time} at ${
          patient.health_center_name || "your health center"
        }.`,
        data: {
          deep_link: "respiratrack://appointments",
          appointment_id: appt.appointment_id,
        },
      });

      await appt.markReminderSent();
      logger.info(`[appointmentReminder.job] Reminder sent for ${appt.appointment_id}`);
    }

    logger.info("[appointmentReminder.job] Completed.");
  } catch (err) {
    logger.error(`[appointmentReminder.job] Error: ${err.message}`);
  }
};

export const scheduleAppointmentReminderJob = () => {
  cron.schedule("*/15 * * * *", runAppointmentReminderJob, { timezone: "Asia/Manila" });
  logger.info("[appointmentReminder.job] Scheduled — every 15 minutes");
};
