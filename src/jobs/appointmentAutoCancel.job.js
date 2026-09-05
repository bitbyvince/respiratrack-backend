import Appointment from "../models/Appointment.model.js";
import Patient from "../models/Patient.model.js";
import User from "../models/User.model.js";
import { notifyPatient } from "../utils/notifyPatient.js";
import logger from "../utils/logger.js";

/**
 * Appointment Auto-Cancel Job
 * Runs every 15 minutes. Any Pending/Confirmed appointment whose
 * scheduled date + time has already passed is cancelled automatically,
 * since the slot can no longer be honored.
 */
export const runAppointmentAutoCancelJob = async () => {
  logger.info("[appointmentAutoCancel.job] Checking for expired appointments...");

  try {
    const expired = await Appointment.getExpiredActive();

    for (const appt of expired) {
      await appt.cancel("SYSTEM", "Automatically cancelled: the scheduled date/time has passed.");

      const patient = await Patient.findOne({ patient_id: appt.patient_id });
      if (patient?.user_id) {
        const user = await User.findOne({ user_id: patient.user_id });
        await notifyPatient({
          userId: patient.user_id,
          fcmToken: user?.fcm_token,
          type: "appointment_cancelled",
          title: "Appointment Cancelled",
          body: `Your ${appt.purpose} appointment on ${appt.scheduled_date.toDateString()} at ${appt.scheduled_time} was automatically cancelled because the scheduled time has passed.`,
          data: {
            deep_link: "respiratrack://appointments",
            appointment_id: appt.appointment_id,
          },
        });
      }

      logger.info(`[appointmentAutoCancel.job] Auto-cancelled ${appt.appointment_id}`);
    }

    logger.info("[appointmentAutoCancel.job] Completed.");
  } catch (err) {
    logger.error(`[appointmentAutoCancel.job] Error: ${err.message}`);
  }
};
