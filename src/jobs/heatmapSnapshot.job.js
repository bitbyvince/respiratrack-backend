import cron from "node-cron";
import Barangay from "../models/Barangay.model.js";
import Patient from "../models/Patient.model.js";
import EscalationLog from "../models/EscalationLog.model.js";
import Inventory from "../models/Inventory.model.js";
import HeatmapSnapshot from "../models/HeatmapSnapshot.model.js";
import { resolveHealthCenterCoordinates } from "../utils/geoJitter.js";
import logger from "../utils/logger.js";

const STOCK_STATUS_RANK = { OK: 0, Low: 1, Critical: 2, Stockout: 3 };

const getWorstStockStatus = (inventoryDocs) => {
  if (!inventoryDocs.length) return "OK";
  return inventoryDocs.reduce((worst, inv) => {
    return STOCK_STATUS_RANK[inv.stock_status] > STOCK_STATUS_RANK[worst]
      ? inv.stock_status
      : worst;
  }, "OK");
};

const getRiskLevelFromIntensity = (intensity) => {
  if (intensity >= 0.6) return "critical";
  if (intensity >= 0.4) return "high";
  if (intensity >= 0.2) return "moderate";
  return "low";
};

const runHeatmapSnapshot = async () => {
  logger.info("[heatmapSnapshot.job] Rebuilding heatmap snapshots...");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const barangays = await Barangay.find({});

    for (const barangay of barangays) {
      const healthCenters = barangay.health_centers || [];

      for (const healthCenter of healthCenters) {
        const patients = await Patient.find({
          health_center_id: healthCenter.health_center_id,
          is_active: true,
        });

        const activeCases = patients.length;
        const compliantCount = patients.filter(
          (p) => p.compliance?.risk_level === "Compliant",
        ).length;
        const atRiskCount = patients.filter(
          (p) => p.compliance?.risk_level === "At Risk",
        ).length;
        const defaulterCount = patients.filter(
          (p) => p.compliance?.risk_level === "Defaulter",
        ).length;

        const complianceRate =
          activeCases > 0
            ? parseFloat(((compliantCount / activeCases) * 100).toFixed(2))
            : 0;

        const heatIntensity = parseFloat((1 - complianceRate / 100).toFixed(4));
        const riskLevel = getRiskLevelFromIntensity(heatIntensity);

        const escalationCounts = { level_1: 0, level_2: 0, level_3: 0 };
        const activeEscalations = await EscalationLog.find({
          health_center_id: healthCenter.health_center_id,
          resolved: false,
        });

        for (const esc of activeEscalations) {
          if (esc.level === 1) escalationCounts.level_1++;
          else if (esc.level === 2) escalationCounts.level_2++;
          else if (esc.level === 3) escalationCounts.level_3++;
        }

        const inventoryDocs = await Inventory.find({
          health_center_id: healthCenter.health_center_id,
        });
        const stockStatus = getWorstStockStatus(inventoryDocs);
        const snapshotId = `HMAP-${healthCenter.health_center_id}-${today.toISOString().slice(0, 10)}`;

        const coordinates = {
          type: "Point",
          coordinates: resolveHealthCenterCoordinates(barangay, healthCenter),
        };

        await HeatmapSnapshot.findOneAndUpdate(
          {
            health_center_id: healthCenter.health_center_id,
            period: "daily",
            snapshot_date: today,
          },
          {
            $set: {
              snapshot_id: snapshotId,
              snapshot_date: today,
              period: "daily",
              barangay_id: barangay.barangay_id,
              barangay_name: barangay.name,
              health_center_id: healthCenter.health_center_id,
              health_center_name: healthCenter.name,
              coordinates,
              boundary_geojson: barangay.boundary_geojson,
              active_cases: activeCases,
              compliance_rate: complianceRate,
              at_risk_count: atRiskCount,
              defaulter_count: defaulterCount,
              escalation_counts: escalationCounts,
              stock_status: stockStatus,
              heat_intensity: heatIntensity,
              risk_level: riskLevel,
              created_at: new Date(),
            },
          },
          { upsert: true, new: true },
        );

        logger.info(
          `[heatmapSnapshot.job] Snapshot saved for ${healthCenter.name} (${barangay.name}) — ` +
            `Intensity: ${heatIntensity}, Risk: ${riskLevel}, Stock: ${stockStatus}`,
        );
      }
    }

    logger.info("[heatmapSnapshot.job] Heatmap snapshot rebuild completed.");
  } catch (err) {
    logger.error(`[heatmapSnapshot.job] Error: ${err.message}`);
  }
};

export const scheduleHeatmapSnapshot = () => {
  cron.schedule("50 23 * * *", runHeatmapSnapshot, { timezone: "Asia/Manila" });
  logger.info("[heatmapSnapshot.job] Scheduled — daily at 23:50 Asia/Manila");
};

export { runHeatmapSnapshot };
