const cron = require('node-cron');

const Patient      = require('../models/Patient.model');
const Alert        = require('../models/Alert.model');
const { sendToDevice } = require('../utils/firebaseMessaging');
const User         = require('../models/User.model');
const logger       = require('../utils/logger');

/**
 * Sputum Test Reminder Job
 * Runs daily at 08:00 AM (Philippine Time).
 *
 * For each active patient:
 *  1. Check their sputum_test_schedule for any Pending test
 *     due in exactly 3 days from today
 *  2. If found:
 *     a. Create a 'Sputum Test Due' alert targeting nurse + barangay_admin
 *     b. Push an FCM notification to the patient's mobile device (if token exists)
 *     c. Push an FCM notification to the assigned nurse
 */

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
};

const isSameDay = (a, b) => {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate()
  );
};

const runSputumReminderJob = async () => {
  logger.info('[sputumReminder.job] Checking upcoming sputum tests...');

  try {
    const today        = new Date();
    today.setHours(0, 0, 0, 0);
    const reminderDate = addDays(today, 3); // target: due in 3 days

    const patients = await Patient.find({ is_active: true });

    for (const patient of patients) {
      const schedule = patient.sputum_test_schedule ?? [];

      // Find a pending test due in exactly 3 days
      const upcomingTest = schedule.find(
        (entry) =>
          entry.status === 'Pending' &&
          isSameDay(new Date(entry.due_date), reminderDate)
      );

      if (!upcomingTest) continue;

      logger.info(
        `[sputumReminder.job] Reminder triggered for ${patient.tb_case_number} ` +
        `— Month ${upcomingTest.month} test due on ${reminderDate.toDateString()}`
      );

      // ── 1. Avoid duplicate alerts ────────────────────────────
      const existingAlert = await Alert.findOne({
        patient_id: patient.patient_id,
        alert_type: 'Sputum Test Due',
        created_at: { $gte: today },
      });

      if (!existingAlert) {
        const alertCount = await Alert.countDocuments({});
        const alertId    = `ALT-${String(alertCount + 1).padStart(4, '0')}`;

        await Alert.create({
          alert_id:         alertId,
          patient_id:       patient.patient_id,
          tb_case_number:   patient.tb_case_number,
          barangay_id:      patient.barangay_id,
          alert_type:       'Sputum Test Due',
          escalation_level: 0,
          message:
            `Patient ${patient.tb_case_number} has a Month ${upcomingTest.month} ` +
            `sputum test due on ${reminderDate.toDateString()}.`,
          severity:     'Info',
          status:       'Active',
          target_roles: ['nurse', 'barangay_admin'],
          created_at:   new Date(),
          resolved_at:  null,
          resolved_by:  null,
        });
      }

      // ── 2. Push notification to patient ─────────────────────
      const patientUser = patient.user_id
        ? await User.findOne({ user_id: patient.user_id })
        : null;

      if (patientUser?.fcm_token) {
        try {
          await sendToDevice({
            fcmToken: patientUser.fcm_token,
            title:    'Sputum Test Reminder',
            body:
              `Your Month ${upcomingTest.month} sputum test is due on ` +
              `${reminderDate.toDateString()}. Please visit your health center.`,
            data: {
              type:           'sputum_reminder',
              tb_case_number: patient.tb_case_number,
              due_date:       reminderDate.toISOString(),
              month:          String(upcomingTest.month),
            },
          });
          logger.info(
            `[sputumReminder.job] FCM sent to patient ${patient.tb_case_number}`
          );
        } catch (fcmErr) {
          logger.warn(
            `[sputumReminder.job] FCM to patient failed: ${fcmErr.message}`
          );
        }
      }

      // ── 3. Push notification to assigned nurse ───────────────
      const nurse = patient.assigned_nurse_id
        ? await User.findOne({ user_id: patient.assigned_nurse_id })
        : null;

      if (nurse?.fcm_token) {
        try {
          await sendToDevice({
            fcmToken: nurse.fcm_token,
            title:    'Sputum Test Due — Patient Reminder',
            body:
              `${patient.full_name} (${patient.tb_case_number}) has a ` +
              `Month ${upcomingTest.month} sputum test due on ${reminderDate.toDateString()}.`,
            data: {
              type:           'sputum_reminder',
              patient_id:     patient.patient_id,
              tb_case_number: patient.tb_case_number,
              due_date:       reminderDate.toISOString(),
            },
          });
          logger.info(
            `[sputumReminder.job] FCM sent to nurse ${nurse.user_id} for patient ${patient.tb_case_number}`
          );
        } catch (fcmErr) {
          logger.warn(
            `[sputumReminder.job] FCM to nurse failed: ${fcmErr.message}`
          );
        }
      }
    }

    logger.info('[sputumReminder.job] Sputum reminder job completed.');
  } catch (err) {
    logger.error(`[sputumReminder.job] Error: ${err.message}`);
  }
};

// ─── Cron Schedule ────────────────────────────────────────────────────────────
// Runs every day at 08:00 AM (Philippine Time, UTC+8)

const scheduleSputumReminderJob = () => {
  cron.schedule(
    '0 8 * * *',
    runSputumReminderJob,
    { timezone: 'Asia/Manila' }
  );
  logger.info('[sputumReminder.job] Scheduled — daily at 08:00 Asia/Manila');
};

module.exports = { scheduleSputumReminderJob, runSputumReminderJob };