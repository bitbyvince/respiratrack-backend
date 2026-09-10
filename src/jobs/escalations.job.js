import cron from "node-cron";
import Patient from "../models/Patient.model.js";
import Alert from "../models/Alert.model.js";
import EscalationLog from "../models/EscalationLog.model.js";
import User from "../models/User.model.js";
import { resolveEscalationLevel } from "../utils/riskScoring.js";
import { notifyPatient } from "../utils/notifyPatient.js";
import logger from "../utils/logger.js";

const ESCALATION_META = {
  1: {
    alert_type: "Escalation L1",
    severity: "Warning",
    target_roles: ["nurse"],
    label: "missed 2 or more consecutive doses — Missed Dose Alert",
    patientMessage:
      "You've missed 2 or more doses in a row. Please don't stop your treatment — take your medicine today.",
  },
  2: {
    alert_type: "Escalation L2",
    severity: "Warning",
    target_roles: ["nurse", "barangay_admin"],
    label: "missed 7 or more consecutive doses — At Risk of Interruption",
    patientMessage:
      "You've missed 7 or more doses in a row. Your health center has been notified — please visit or contact them as soon as possible.",
  },
  3: {
    alert_type: "Escalation L3",
    severity: "Critical",
    target_roles: ["nurse", "barangay_admin", "super_admin"],
    label: "missed 30 or more consecutive doses and is classified as Lost to Follow-Up",
    patientMessage:
      "You've missed 30 or more doses in a row. This is critical — please contact your health center immediately to continue your treatment safely.",
  },
};

const runEscalationJob = async () => {
  logger.info("[escalation.job] Evaluating escalation thresholds...");

  try {
    const patients = await Patient.find({ is_active: true });

    for (const patient of patients) {
      const consecutiveMissed =
        patient.compliance?.consecutive_missed_doses ?? 0;
      const newLevel = resolveEscalationLevel(consecutiveMissed);
      const currentLevel = patient.escalation?.level ?? 0;

      if (newLevel <= currentLevel) continue;

      const meta = ESCALATION_META[newLevel];
      const now = new Date();

      await Patient.findOneAndUpdate(
        { patient_id: patient.patient_id },
        {
          $set: {
            "escalation.level": newLevel,
            "escalation.escalated_at": now,
            "escalation.escalated_by": "system",
            "escalation.notes": `${consecutiveMissed} consecutive missed doses — ${meta.label}`,
            // "Lost to Follow-Up" is a treatment OUTCOME, not one of the
            // three compliance.risk_level values (Compliant/At Risk/
            // Defaulter) — writing it there was an invalid-enum value
            // that Mongoose's findOneAndUpdate silently allowed through
            // (validators don't run on update by default), and it would
            // then fall through every risk_level branch in aggregation
            // code (never counted as Compliant, At Risk, or Defaulter).
            ...(newLevel === 3 && { "treatment_outcome.status": "Lost to Follow-Up" }),
            updated_at: now,
          },
        },
      );

      const alertId = await Alert.generateNextId();

      await Alert.create({
        alert_id: alertId,
        patient_id: patient.patient_id,
        tb_case_number: patient.tb_case_number,
        barangay_id: patient.barangay_id,
        alert_type: meta.alert_type,
        escalation_level: newLevel,
        message: `Patient ${patient.tb_case_number} has ${meta.label}.`,
        severity: meta.severity,
        status: "Active",
        target_roles: meta.target_roles,
        created_at: now,
        resolved_at: null,
        resolved_by: null,
      });

      const logCount = await EscalationLog.countDocuments({});
      const logId = `ESC-${String(logCount + 1).padStart(4, "0")}`;

      // Field names below match EscalationLog.model.js exactly — this
      // used to write consecutive_missed/reason/notified_parties, none
      // of which exist on the schema (consecutive_missed_at_trigger is
      // required, so every single escalation attempt was throwing a
      // validation error and never actually getting logged).
      await EscalationLog.create({
        escalation_id: logId,
        patient_id: patient.patient_id,
        tb_case_number: patient.tb_case_number,
        barangay_id: patient.barangay_id,
        health_center_id: patient.health_center_id,
        level: newLevel,
        consecutive_missed_at_trigger: consecutiveMissed,
        triggered_by: "system",
        triggered_at: now,
        // notified_users needs a real user_id per entry (required by
        // schema) — we only know target ROLES here, not which specific
        // nurse/admin actually received it, so leave it empty rather
        // than writing a fake required id.
        notified_users: [],
        acknowledged_by: null,
        acknowledged_at: null,
        acknowledgement_notes: "",
        resolved: false,
        resolved_at: null,
        resolution_notes: "",
      });

      if (patient.user_id) {
        const user = await User.findOne({ user_id: patient.user_id });
        await notifyPatient({
          userId: patient.user_id,
          fcmToken: user?.fcm_token,
          type: "escalation",
          title: "Please Take Your Medication",
          body: meta.patientMessage,
          data: {
            deep_link: "respiratrack://medication-log",
            escalation_id: logId,
            level: String(newLevel),
          },
        });
      }

      logger.warn(
        `[escalation.job] Patient ${patient.tb_case_number} escalated to Level ${newLevel} ` +
          `(${consecutiveMissed} consecutive missed doses)`,
      );
    }

    logger.info("[escalation.job] Escalation evaluation completed.");
  } catch (err) {
    logger.error(`[escalation.job] Error: ${err.message}`);
  }
};

export const scheduleEscalationJob = () => {
  cron.schedule("5 0 * * *", runEscalationJob, { timezone: "Asia/Manila" });
  logger.info("[escalation.job] Scheduled — daily at 00:05 Asia/Manila");
};

export { runEscalationJob };