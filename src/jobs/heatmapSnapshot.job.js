const cron = require('node-cron');

const Barangay        = require('../models/Barangay.model');
const Patient         = require('../models/Patient.model');
const Alert           = require('../models/Alert.model');
const EscalationLog   = require('../models/EscalationLog.model');
const Inventory       = require('../models/Inventory.model');
const HeatmapSnapshot = require('../models/HeatmapSnapshot.model');
const logger          = require('../utils/logger');

/**
 * Rebuilds heatmap snapshot data per barangay.
 * Runs nightly at 23:50 (Philippine Time), just before the compliance snapshot.
 *
 * Per barangay, computes:
 *  - active_cases, compliance_rate, at_risk_count, defaulter_count
 *  - escalation_counts per level
 *  - stock_status (worst status across all drugs in that barangay)
 *  - heat_intensity = 1 - (compliance_rate / 100)
 *  - risk_level derived from heat_intensity
 */

const STOCK_STATUS_RANK = { OK: 0, Low: 1, Critical: 2, Stockout: 3 };

const getWorstStockStatus = (inventoryDocs) => {
  if (!inventoryDocs.length) return 'OK';
  return inventoryDocs.reduce((worst, inv) => {
    return STOCK_STATUS_RANK[inv.stock_status] > STOCK_STATUS_RANK[worst]
      ? inv.stock_status
      : worst;
  }, 'OK');
};

const getRiskLevelFromIntensity = (intensity) => {
  if (intensity >= 0.6) return 'critical';
  if (intensity >= 0.4) return 'high';
  if (intensity >= 0.2) return 'moderate';
  return 'low';
};

const runHeatmapSnapshot = async () => {
  logger.info('[heatmapSnapshot.job] Rebuilding heatmap snapshots...');

  try {
    const today     = new Date();
    today.setHours(0, 0, 0, 0);
    const barangays = await Barangay.find({});

    for (const barangay of barangays) {
      // ── Patients ────────────────────────────────────────────
      const patients = await Patient.find({
        barangay_id: barangay.barangay_id,
        is_active: true,
      });

      const activeCases    = patients.length;
      const compliantCount = patients.filter(p => p.compliance?.risk_level === 'Compliant').length;
      const atRiskCount    = patients.filter(p => p.compliance?.risk_level === 'At Risk').length;
      const defaulterCount = patients.filter(p => p.compliance?.risk_level === 'Defaulter').length;

      const complianceRate = activeCases > 0
        ? parseFloat(((compliantCount / activeCases) * 100).toFixed(2))
        : 0;

      const heatIntensity = parseFloat((1 - complianceRate / 100).toFixed(4));
      const riskLevel     = getRiskLevelFromIntensity(heatIntensity);

      // ── Escalation Counts ────────────────────────────────────
      const escalationCounts = { level_1: 0, level_2: 0, level_3: 0 };

      const activeEscalations = await EscalationLog.find({
        barangay_id: barangay.barangay_id,
        resolved:    false,
      });

      for (const esc of activeEscalations) {
        if (esc.level === 1) escalationCounts.level_1++;
        else if (esc.level === 2) escalationCounts.level_2++;
        else if (esc.level === 3) escalationCounts.level_3++;
      }

      // ── Stock Status ─────────────────────────────────────────
      const inventoryDocs = await Inventory.find({
        barangay_id: barangay.barangay_id,
      });
      const stockStatus = getWorstStockStatus(inventoryDocs);

      // ── Upsert Snapshot ──────────────────────────────────────
      const snapshotId = `HMAP-${barangay.barangay_id}-${today.toISOString().slice(0, 10)}`;

      await HeatmapSnapshot.findOneAndUpdate(
        {
          barangay_id:   barangay.barangay_id,
          period:        'daily',
          snapshot_date: today,
        },
        {
          $set: {
            snapshot_id:       snapshotId,
            snapshot_date:     today,
            period:            'daily',
            barangay_id:       barangay.barangay_id,
            barangay_name:     barangay.name,
            health_center_name: barangay.health_center?.name,
            coordinates:       barangay.coordinates,
            boundary_geojson:  barangay.boundary_geojson,
            active_cases:      activeCases,
            compliance_rate:   complianceRate,
            at_risk_count:     atRiskCount,
            defaulter_count:   defaulterCount,
            escalation_counts: escalationCounts,
            stock_status:      stockStatus,
            heat_intensity:    heatIntensity,
            risk_level:        riskLevel,
            created_at:        new Date(),
          },
        },
        { upsert: true, new: true }
      );

      logger.info(
        `[heatmapSnapshot.job] Snapshot saved for ${barangay.name} — ` +
        `Intensity: ${heatIntensity}, Risk: ${riskLevel}, Stock: ${stockStatus}`
      );
    }

    logger.info('[heatmapSnapshot.job] Heatmap snapshot rebuild completed.');
  } catch (err) {
    logger.error(`[heatmapSnapshot.job] Error: ${err.message}`);
  }
};

// ─── Cron Schedule ────────────────────────────────────────────────────────────
// Runs every day at 23:50 (Philippine Time, UTC+8)
// Intentionally before complianceSnapshot.job (23:59)

const scheduleHeatmapSnapshot = () => {
  cron.schedule(
    '50 23 * * *',
    runHeatmapSnapshot,
    { timezone: 'Asia/Manila' }
  );
  logger.info('[heatmapSnapshot.job] Scheduled — daily at 23:50 Asia/Manila');
};

module.exports = { scheduleHeatmapSnapshot, runHeatmapSnapshot };