import cron from "node-cron";
import Patient from "../models/Patient.model.js";
import Alert from "../models/Alert.model.js";
import EscalationLog from "../models/EscalationLog.model.js";
import { resolveEscalationLevel } from "../utils/riskScoring.js";
import logger from "../utils/logger.js";

const ESCALATION_META = {
  1: {
    alert_type: "Escalation L1",
    severity: "Warning",
    target_roles: ["nurse"],
    label: "missed 2 or more consecutive doses",
  },
  2: {
    alert_type: "Escalation L2",
    severity: "Warning",
    target_roles: ["nurse", "barangay_admin"],
    label: "missed 5 or more consecutive doses",
  },
  3: {
    alert_type: "Escalation L3",
    severity: "Critical",
    target_roles: ["nurse", "barangay_admin", "super_admin"],
    label:
      "missed 14 or more consecutive doses and is classified as a Defaulter",
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
            ...(newLevel === 3 && { "compliance.risk_level": "Defaulter" }),
            updated_at: now,
          },
        },
      );

      const alertCount = await Alert.countDocuments({});
      const alertId = `ALT-${String(alertCount + 1).padStart(4, "0")}`;

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

      await EscalationLog.create({
        escalation_id: logId,
        patient_id: patient.patient_id,
        tb_case_number: patient.tb_case_number,
        barangay_id: patient.barangay_id,
        level: newLevel,
        triggered_at: now,
        triggered_by: "system",
        consecutive_missed: consecutiveMissed,
        reason: `${consecutiveMissed} consecutive missed doses — auto-escalated to Level ${newLevel}`,
        notified_parties: meta.target_roles.map((role) => ({
          user_id: null,
          role,
          notified_at: now,
        })),
        acknowledged_by: null,
        acknowledged_at: null,
        acknowledgement_notes: "",
        resolved: false,
        resolved_at: null,
        resolution_notes: "",
        created_at: now,
      });

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