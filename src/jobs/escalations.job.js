const cron = require('node-cron');

const Patient       = require('../models/Patient.model');
const Alert         = require('../models/Alert.model');
const EscalationLog = require('../models/EscalationLog.model');
const { resolveEscalationLevel } = require('../utils/riskScoring');
const logger        = require('../utils/logger');

/**
 * Evaluates escalation thresholds for all active patients.
 * Runs daily at 00:05 AM (Philippine Time).
 *
 * Escalation levels (mirrors escalationLevels.js):
 *  Level 0 → no action
 *  Level 1 → consecutive_missed >= 2  → notify assigned nurse
 *  Level 2 → consecutive_missed >= 5  → notify barangay admin
 *  Level 3 → consecutive_missed >= 14 → notify super admin, mark Defaulter
 */

const ESCALATION_META = {
  1: {
    alert_type:   'Escalation L1',
    severity:     'Warning',
    target_roles: ['nurse'],
    label:        'missed 2 or more consecutive doses',
  },
  2: {
    alert_type:   'Escalation L2',
    severity:     'Warning',
    target_roles: ['nurse', 'barangay_admin'],
    label:        'missed 5 or more consecutive doses',
  },
  3: {
    alert_type:   'Escalation L3',
    severity:     'Critical',
    target_roles: ['nurse', 'barangay_admin', 'super_admin'],
    label:        'missed 14 or more consecutive doses and is classified as a Defaulter',
  },
};

const runEscalationJob = async () => {
  logger.info('[escalation.job] Evaluating escalation thresholds...');

  try {
    const patients = await Patient.find({ is_active: true });

    for (const patient of patients) {
      const consecutiveMissed = patient.compliance?.consecutive_missed_doses ?? 0;
      const newLevel          = resolveEscalationLevel(consecutiveMissed);
      const currentLevel      = patient.escalation?.level ?? 0;

      // Only escalate upward — never downgrade via this job
      if (newLevel <= currentLevel) continue;

      const meta = ESCALATION_META[newLevel];
      const now  = new Date();

      // ── 1. Update patient escalation field ───────────────────
      await Patient.findOneAndUpdate(
        { patient_id: patient.patient_id },
        {
          $set: {
            'escalation.level':        newLevel,
            'escalation.escalated_at': now,
            'escalation.escalated_by': 'system',
            'escalation.notes':        `${consecutiveMissed} consecutive missed doses — ${meta.label}`,
            // Mark as Defaulter at level 3
            ...(newLevel === 3 && { 'compliance.risk_level': 'Defaulter' }),
            updated_at: now,
          },
        }
      );

      // ── 2. Create Alert ───────────────────────────────────────
      const alertCount = await Alert.countDocuments({});
      const alertId    = `ALT-${String(alertCount + 1).padStart(4, '0')}`;

      await Alert.create({
        alert_id:         alertId,
        patient_id:       patient.patient_id,
        tb_case_number:   patient.tb_case_number,
        barangay_id:      patient.barangay_id,
        alert_type:       meta.alert_type,
        escalation_level: newLevel,
        message:          `Patient ${patient.tb_case_number} has ${meta.label}.`,
        severity:         meta.severity,
        status:           'Active',
        target_roles:     meta.target_roles,
        created_at:       now,
        resolved_at:      null,
        resolved_by:      null,
      });

      // ── 3. Create Escalation Log ──────────────────────────────
      const logCount = await EscalationLog.countDocuments({});
      const logId    = `ESC-${String(logCount + 1).padStart(4, '0')}`;

      const notifiedParties = meta.target_roles.map((role) => ({
        user_id:      null,
        role,
        notified_at:  now,
      }));

      await EscalationLog.create({
        escalation_id:        logId,
        patient_id:           patient.patient_id,
        tb_case_number:       patient.tb_case_number,
        barangay_id:          patient.barangay_id,
        level:                newLevel,
        triggered_at:         now,
        triggered_by:         'system',
        consecutive_missed:   consecutiveMissed,
        reason:               `${consecutiveMissed} consecutive missed doses — auto-escalated to Level ${newLevel}`,
        notified_parties:     notifiedParties,
        acknowledged_by:      null,
        acknowledged_at:      null,
        acknowledgement_notes: '',
        resolved:             false,
        resolved_at:          null,
        resolution_notes:     '',
        created_at:           now,
      });

      logger.warn(
        `[escalation.job] Patient ${patient.tb_case_number} escalated to Level ${newLevel} ` +
        `(${consecutiveMissed} consecutive missed doses)`
      );
    }

    logger.info('[escalation.job] Escalation evaluation completed.');
  } catch (err) {
    logger.error(`[escalation.job] Error: ${err.message}`);
  }
};

// ─── Cron Schedule ────────────────────────────────────────────────────────────
// Runs every day at 00:05 AM (Philippine Time, UTC+8)

const scheduleEscalationJob = () => {
  cron.schedule(
    '5 0 * * *',
    runEscalationJob,
    { timezone: 'Asia/Manila' }
  );
  logger.info('[escalation.job] Scheduled — daily at 00:05 Asia/Manila');
};

module.exports = { scheduleEscalationJob, runEscalationJob };