const cron = require('node-cron');
const mongoose = require('mongoose');

const Patient            = require('../models/Patient.model');
const Barangay           = require('../models/Barangay.model');
const ComplianceSnapshot = require('../models/ComplianceSnapshot.model');
const { computeRiskScore, getRiskLabel } = require('../utils/riskScoring');
const logger             = require('../utils/logger');

/**
 * Computes and saves a daily compliance snapshot per barangay.
 * Runs nightly at 11:59 PM (Philippine Time).
 *
 * Steps:
 *  1. Fetch all active patients grouped by barangay
 *  2. Compute per-barangay counts (compliant, at_risk, defaulter)
 *  3. Compute average risk score
 *  4. Upsert ComplianceSnapshot for today
 *  5. Update Barangay.stats
 */

const runComplianceSnapshot = async () => {
  logger.info('[complianceSnapshot.job] Starting daily compliance snapshot...');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const barangays = await Barangay.find({});

    for (const barangay of barangays) {
      const patients = await Patient.find({
        barangay_id: barangay.barangay_id,
        is_active: true,
      });

      if (patients.length === 0) {
        logger.info(`[complianceSnapshot.job] No active patients in ${barangay.name}, skipping.`);
        continue;
      }

      let compliantCount  = 0;
      let atRiskCount     = 0;
      let defaulterCount  = 0;
      let totalRiskScore  = 0;

      for (const patient of patients) {
        const riskLevel = patient.compliance?.risk_level;

        if (riskLevel === 'Compliant')  compliantCount++;
        else if (riskLevel === 'At Risk')   atRiskCount++;
        else if (riskLevel === 'Defaulter') defaulterCount++;

        totalRiskScore += patient.risk_score?.score ?? 0;
      }

      const totalPatients       = patients.length;
      const compliancePercentage = parseFloat(
        ((compliantCount / totalPatients) * 100).toFixed(2)
      );
      const averageRiskScore = parseFloat(
        (totalRiskScore / totalPatients).toFixed(2)
      );

      // Determine barangay-level risk
      const barangayRiskLevel =
        averageRiskScore >= 60 ? 'critical' :
        averageRiskScore >= 40 ? 'high'     :
        averageRiskScore >= 20 ? 'moderate' : 'low';

      // Upsert today's snapshot
      const snapshotId = `SNAP-${barangay.barangay_id}-${today.toISOString().slice(0, 10)}`;

      await ComplianceSnapshot.findOneAndUpdate(
        { barangay_id: barangay.barangay_id, snapshot_date: today },
        {
          $set: {
            snapshot_id:          snapshotId,
            snapshot_date:        today,
            barangay_id:          barangay.barangay_id,
            barangay_name:        barangay.name,
            total_patients:       totalPatients,
            compliant_count:      compliantCount,
            at_risk_count:        atRiskCount,
            defaulter_count:      defaulterCount,
            compliance_percentage: compliancePercentage,
            average_risk_score:   averageRiskScore,
            created_at:           new Date(),
          },
        },
        { upsert: true, new: true }
      );

      // Update Barangay.stats
      await Barangay.findOneAndUpdate(
        { barangay_id: barangay.barangay_id },
        {
          $set: {
            'stats.total_patients':       totalPatients,
            'stats.active_patients':      totalPatients,
            'stats.compliant_count':      compliantCount,
            'stats.at_risk_count':        atRiskCount,
            'stats.defaulter_count':      defaulterCount,
            'stats.compliance_percentage': compliancePercentage,
            'stats.risk_level':           barangayRiskLevel,
            'stats.last_computed':        new Date(),
            updated_at:                   new Date(),
          },
        }
      );

      logger.info(
        `[complianceSnapshot.job] Snapshot saved for ${barangay.name} — ` +
        `Compliant: ${compliantCount}, At Risk: ${atRiskCount}, Defaulter: ${defaulterCount}`
      );
    }

    logger.info('[complianceSnapshot.job] Daily compliance snapshot completed.');
  } catch (err) {
    logger.error(`[complianceSnapshot.job] Error: ${err.message}`);
  }
};

// ─── Cron Schedule ────────────────────────────────────────────────────────────
// Runs every day at 23:59 (Philippine Time, UTC+8)

const scheduleComplianceSnapshot = () => {
  cron.schedule(
    '59 23 * * *',
    runComplianceSnapshot,
    { timezone: 'Asia/Manila' }
  );
  logger.info('[complianceSnapshot.job] Scheduled — daily at 23:59 Asia/Manila');
};

module.exports = { scheduleComplianceSnapshot, runComplianceSnapshot };