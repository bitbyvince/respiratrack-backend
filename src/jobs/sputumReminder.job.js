import cron from "node-cron";
import Patient from "../models/Patient.model.js";
import Alert from "../models/Alert.model.js";
import User from "../models/User.model.js";
import { sendToDevice } from "../utils/firebaseMessaging.js";
import logger from "../utils/logger.js";

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
};

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const runSputumReminderJob = async () => {
  logger.info("[sputumReminder.job] Checking upcoming sputum tests...");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminderDate = addDays(today, 3);
    const patients = await Patient.find({ is_active: true });

    for (const patient of patients) {
      const schedule = patient.sputum_test_schedule ?? [];
      const upcomingTest = schedule.find(
        (entry) =>
          entry.status === "Pending" &&
          isSameDay(new Date(entry.due_date), reminderDate),
      );

      if (!upcomingTest) continue;

      const existingAlert = await Alert.findOne({
        patient_id: patient.patient_id,
        alert_type: "Sputum Test Due",
        created_at: { $gte: today },
      });

      if (!existingAlert) {
        const alertCount = await Alert.countDocuments({});
        const alertId = `ALT-${String(alertCount + 1).padStart(4, "0")}`;

        await Alert.create({
          alert_id: alertId,
          patient_id: patient.patient_id,
          tb_case_number: patient.tb_case_number,
          barangay_id: patient.barangay_id,
          alert_type: "Sputum Test Due",
          escalation_level: 0,
          message:
            `Patient ${patient.tb_case_number} has a Month ${upcomingTest.month} ` +
            `sputum test due on ${reminderDate.toDateString()}.`,
          severity: "Info",
          status: "Active",
          target_roles: ["nurse", "barangay_admin"],
          created_at: new Date(),
          resolved_at: null,
          resolved_by: null,
        });
      }

      const patientUser = patient.user_id
        ? await User.findOne({ user_id: patient.user_id })
        : null;

      if (patientUser?.fcm_token) {
        try {
          await sendToDevice({
            fcmToken: patientUser.fcm_token,
            title: "Sputum Test Reminder",
            body:
              `Your Month ${upcomingTest.month} sputum test is due on ` +
              `${reminderDate.toDateString()}. Please visit your health center.`,
            data: {
              type: "sputum_reminder",
              tb_case_number: patient.tb_case_number,
              due_date: reminderDate.toISOString(),
              month: String(upcomingTest.month),
            },
          });
        } catch (fcmErr) {
          logger.warn(
            `[sputumReminder.job] FCM to patient failed: ${fcmErr.message}`,
          );
        }
      }

      const nurse = patient.assigned_nurse_id
        ? await User.findOne({ user_id: patient.assigned_nurse_id })
        : null;

      if (nurse?.fcm_token) {
        try {
          await sendToDevice({
            fcmToken: nurse.fcm_token,
            title: "Sputum Test Due — Patient Reminder",
            body:
              `${patient.full_name} (${patient.tb_case_number}) has a ` +
              `Month ${upcomingTest.month} sputum test due on ${reminderDate.toDateString()}.`,
            data: {
              type: "sputum_reminder",
              patient_id: patient.patient_id,
              tb_case_number: patient.tb_case_number,
              due_date: reminderDate.toISOString(),
            },
          });
        } catch (fcmErr) {
          logger.warn(
            `[sputumReminder.job] FCM to nurse failed: ${fcmErr.message}`,
          );
        }
      }
    }

    logger.info("[sputumReminder.job] Sputum reminder job completed.");
  } catch (err) {
    logger.error(`[sputumReminder.job] Error: ${err.message}`);
  }
};

export const scheduleSputumReminderJob = () => {
  cron.schedule("0 8 * * *", runSputumReminderJob, { timezone: "Asia/Manila" });
  logger.info("[sputumReminder.job] Scheduled — daily at 08:00 Asia/Manila");
};

export { runSputumReminderJob };
