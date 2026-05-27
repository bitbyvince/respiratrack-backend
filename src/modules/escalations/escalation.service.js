const EscalationLog = require("../../models/EscalationLog.model");
const Alert = require("../../models/Alert.model");
const Patient = require("../../models/Patient.model");
const User = require("../../models/User.model");
const { sendPushNotification } = require("../../utils/firebaseMessaging");
const { success, error } = require("../../utils/apiResponse");
const { ESCALATION_LEVELS } = require("../../constants/escalationLevels");
const { ALERT_TYPES } = require("../../constants/alertTypes");
const { ROLES } = require("../../constants/roles");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derives escalation level from consecutive missed doses.
 *   0  → no escalation
 *   1  → >= 2  missed → notify assigned nurse
 *   2  → >= 5  missed → notify barangay admin
 *   3  → >= 14 missed → notify super admin + mark Defaulter
 */
function resolveEscalationLevel(consecutiveMissed) {
  if (consecutiveMissed >= ESCALATION_LEVELS.L3_THRESHOLD) return 3;
  if (consecutiveMissed >= ESCALATION_LEVELS.L2_THRESHOLD) return 2;
  if (consecutiveMissed >= ESCALATION_LEVELS.L1_THRESHOLD) return 1;
  return 0;
}

/**
 * Resolves which user roles to notify per escalation level.
 */
function getRolesForLevel(level) {
  if (level === 1) return [ROLES.NURSE];
  if (level === 2) return [ROLES.NURSE, ROLES.BARANGAY_ADMIN];
  if (level === 3) return [ROLES.NURSE, ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN];
  return [];
}

/**
 * Fetches all users matching a set of roles scoped to a barangay.
 * Super admins are fetched globally (no barangay scope).
 */
async function fetchUsersToNotify(roles, barangayId) {
  const queries = roles.map((role) => {
    if (role === ROLES.SUPER_ADMIN) return { role };
    return { role, barangay_id: barangayId, is_active: true };
  });

  const results = await Promise.all(
    queries.map((q) => User.find(q).select("user_id role fcm_token"))
  );

  return results.flat();
}

/**
 * Derives alert severity from escalation level.
 */
function alertSeverityForLevel(level) {
  if (level === 3) return "Critical";
  if (level === 2) return "Warning";
  return "Warning";
}

/**
 * Derives alert type string from escalation level.
 */
function alertTypeForLevel(level) {
  if (level === 1) return ALERT_TYPES.ESCALATION_L1;
  if (level === 2) return ALERT_TYPES.ESCALATION_L2;
  return ALERT_TYPES.ESCALATION_L3;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Core escalation trigger — called by the escalation cron job or manually.
 * Idempotent: if an unresolved log at the same level already exists, skips.
 *
 * @param {string} patientId
 * @param {number} consecutiveMissed
 * @returns {{ created: boolean, level: number, escalation: object|null }}
 */
async function triggerEscalation(patientId, consecutiveMissed) {
  const level = resolveEscalationLevel(consecutiveMissed);
  if (level === 0) return { created: false, level: 0, escalation: null };

  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw new Error(`Patient not found: ${patientId}`);

  // Idempotency: skip if an unresolved escalation at this exact level exists
  const existing = await EscalationLog.findOne({
    patient_id: patientId,
    level,
    resolved: false,
  });
  if (existing) return { created: false, level, escalation: existing };

  const now = new Date();
  const rolesToNotify = getRolesForLevel(level);
  const users = await fetchUsersToNotify(rolesToNotify, patient.barangay_id);

  const notifiedUsers = users.map((u) => ({
    user_id: u.user_id,
    role: u.role,
    notified_at: now,
  }));

  // Persist escalation log
  const escalation = await EscalationLog.create({
    patient_id: patientId,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    level,
    consecutive_missed_at_trigger: consecutiveMissed,
    triggered_by: "system",
    triggered_at: now,
    notified_users: notifiedUsers,
    resolved: false,
  });

  // Update patient escalation block
  await Patient.updateOne(
    { patient_id: patientId },
    {
      $set: {
        "escalation.level": level,
        "escalation.escalated_at": now,
        "escalation.escalated_by": "system",
        "escalation.notes": `${consecutiveMissed} consecutive missed doses — escalation level ${level} triggered`,
        // Mark Defaulter at L3
        ...(level === 3 && { "compliance.risk_level": "Defaulter" }),
        updated_at: now,
      },
    }
  );

  // Create alert
  const alertMessage = buildAlertMessage(patient, level, consecutiveMissed);
  await Alert.create({
    patient_id: patientId,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    alert_type: alertTypeForLevel(level),
    escalation_level: level,
    message: alertMessage,
    severity: alertSeverityForLevel(level),
    status: "Active",
    target_roles: rolesToNotify,
    created_at: now,
  });

  // Push FCM notifications (fire-and-forget; failures logged, not thrown)
  const fcmTargets = users.filter((u) => u.fcm_token);
  await Promise.allSettled(
    fcmTargets.map((u) =>
      sendPushNotification(u.fcm_token, {
        title: `Escalation Level ${level}: ${patient.full_name}`,
        body: alertMessage,
        data: {
          type: alertTypeForLevel(level),
          patient_id: patientId,
          tb_case_number: patient.tb_case_number,
          escalation_level: String(level),
        },
      })
    )
  );

  return { created: true, level, escalation };
}

function buildAlertMessage(patient, level, consecutiveMissed) {
  const base = `Patient ${patient.tb_case_number} (${patient.full_name}) has missed ${consecutiveMissed} consecutive doses.`;
  if (level === 3) return `${base} Patient is now classified as a Defaulter.`;
  if (level === 2) return `${base} Barangay admin has been notified.`;
  return `${base} Assigned nurse has been notified.`;
}

/**
 * Acknowledge an escalation log.
 */
async function acknowledgeEscalation(escalationId, userId, notes = "") {
  const escalation = await EscalationLog.findOne({
    escalation_id: escalationId,
  });
  if (!escalation) throw new Error("Escalation not found");
  if (escalation.resolved) throw new Error("Escalation is already resolved");

  const now = new Date();
  escalation.acknowledged_by = userId;
  escalation.acknowledged_at = now;
  escalation.acknowledgement_notes = notes;
  await escalation.save();

  // Mirror acknowledgement onto patient record
  await Patient.updateOne(
    { patient_id: escalation.patient_id },
    {
      $set: {
        "escalation.acknowledged_by": userId,
        "escalation.acknowledged_at": now,
        updated_at: now,
      },
    }
  );

  return escalation;
}

/**
 * Resolve an escalation log and its linked active alert.
 */
async function resolveEscalation(escalationId, userId, notes = "") {
  const escalation = await EscalationLog.findOne({
    escalation_id: escalationId,
  });
  if (!escalation) throw new Error("Escalation not found");
  if (escalation.resolved) throw new Error("Escalation is already resolved");

  const now = new Date();
  escalation.resolved = true;
  escalation.resolved_at = now;
  escalation.resolution_notes = notes;
  await escalation.save();

  // Reset patient escalation block
  await Patient.updateOne(
    { patient_id: escalation.patient_id },
    {
      $set: {
        "escalation.level": 0,
        "escalation.escalated_at": null,
        "escalation.acknowledged_by": null,
        "escalation.acknowledged_at": null,
        "escalation.notes": notes,
        updated_at: now,
      },
    }
  );

  // Resolve linked alert
  await Alert.updateMany(
    {
      patient_id: escalation.patient_id,
      escalation_level: escalation.level,
      status: "Active",
    },
    { $set: { status: "Resolved", resolved_at: now, resolved_by: userId } }
  );

  return escalation;
}

/**
 * List escalation logs with optional filters.
 */
async function listEscalations({ barangay_id, patient_id, level, resolved, page, limit }) {
  const filter = {};
  if (barangay_id) filter.barangay_id = barangay_id;
  if (patient_id) filter.patient_id = patient_id;
  if (level !== undefined) filter.level = level;
  if (resolved !== undefined) filter.resolved = resolved;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    EscalationLog.find(filter).sort({ triggered_at: -1 }).skip(skip).limit(limit),
    EscalationLog.countDocuments(filter),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

/**
 * Fetch a single escalation log by escalation_id.
 */
async function getEscalationById(escalationId) {
  const escalation = await EscalationLog.findOne({ escalation_id: escalationId });
  if (!escalation) throw new Error("Escalation not found");
  return escalation;
}

module.exports = {
  triggerEscalation,
  acknowledgeEscalation,
  resolveEscalation,
  listEscalations,
  getEscalationById,
};