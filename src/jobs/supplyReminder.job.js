import Patient from "../models/Patient.model.js";
import User from "../models/User.model.js";
import { getMySupplyStatus } from "../modules/dispensing/dispensing.service.js";
import { notifyPatient } from "../utils/notifyPatient.js";
import logger from "../utils/logger.js";

const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
});

export const runSupplyReminderJob = async () => {
  logger.info("[supplyReminder.job] Checking patients for low medicine supply...");

  try {
    const now = new Date();
    const todayManilaDate = manilaDateFormatter.format(now);

    const patients = await Patient.find({ is_active: true });

    for (const patient of patients) {
      if (!patient.user_id) continue;

      const lastSent = patient.last_supply_alert_sent;
      if (lastSent && manilaDateFormatter.format(new Date(lastSent)) === todayManilaDate) {
        continue;
      }

      const supply = await getMySupplyStatus(patient.patient_id);
      if (supply.overall.status !== "Low" && supply.overall.status !== "Critical") continue;

      const user = await User.findOne({ user_id: patient.user_id });

      const lowestDrug = supply.medicines
        .filter((m) => m.status === supply.overall.status)
        .sort((a, b) => (a.remaining_quantity ?? 0) - (b.remaining_quantity ?? 0))[0];
      const drugLabel = lowestDrug ? `${lowestDrug.drug_name} ${lowestDrug.strength}` : "medicine";

      const body =
        supply.overall.status === "Critical"
          ? `Your ${drugLabel} supply has run out. Book a Medication Refill appointment at ${patient.health_center_name || "your health center"} as soon as possible.`
          : `Your ${drugLabel} supply is running low (${lowestDrug?.remaining_quantity ?? 0} ${lowestDrug?.unit ?? "unit"}(s) left). Book a Medication Refill appointment at ${patient.health_center_name || "your health center"}.`;

      await notifyPatient({
        userId: patient.user_id,
        fcmToken: user?.fcm_token,
        type: "medication_stock_low",
        title: "Medicine Supply Running Low",
        body,
        data: {
          deep_link: "respiratrack://appointments/book",
          tb_case_number: patient.tb_case_number,
        },
      });

      await Patient.updateOne(
        { patient_id: patient.patient_id },
        { $set: { last_supply_alert_sent: now } },
      );

      logger.info(`[supplyReminder.job] Low-supply alert sent to ${patient.tb_case_number}`);
    }

    logger.info("[supplyReminder.job] Completed.");
  } catch (err) {
    logger.error(`[supplyReminder.job] Error: ${err.message}`);
  }
};
