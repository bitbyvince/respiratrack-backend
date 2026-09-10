import HeatmapSnapshot from "../../models/HeatmapSnapshot.model.js";
import Barangay from "../../models/Barangay.model.js";
import Patient from "../../models/Patient.model.js";
import Alert from "../../models/Alert.model.js";
import EscalationLog from "../../models/EscalationLog.model.js";
import Inventory from "../../models/Inventory.model.js";
import { resolveHealthCenterCoordinates } from "../../utils/geoJitter.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveRiskLevel(complianceRate, activePatients) {
  if (activePatients === 0) return "low";
  if (complianceRate === 0) return "moderate"; // just started, no doses yet
  if (complianceRate >= 90) return "low";
  if (complianceRate >= 75) return "moderate";
  if (complianceRate >= 50) return "high";
  return "critical";
}

function calcHeatIntensity(complianceRate) {
  return parseFloat((1 - complianceRate / 100).toFixed(4));
}

function resolveStockStatus(inventoryDocs) {
  const priority = { Stockout: 4, Critical: 3, Low: 2, OK: 1 };
  let worst = "OK";
  for (const doc of inventoryDocs) {
    if ((priority[doc.stock_status] ?? 0) > (priority[worst] ?? 0)) {
      worst = doc.stock_status;
    }
  }
  return worst;
}

function normaliseSnapshotDate(date) {
  const d = date ? new Date(date) : new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Core Builder ─────────────────────────────────────────────────────────────

export async function buildSnapshots(period = "monthly", snapshotDate) {
  const date = normaliseSnapshotDate(snapshotDate);
  const barangays = await Barangay.find({});

  const results = [];
  for (const brgy of barangays) {
    for (const healthCenter of brgy.health_centers || []) {
      results.push(buildSnapshotForHealthCenter(brgy, healthCenter, period, date));
    }
  }
  return Promise.all(results);
}

export async function buildSnapshotForHealthCenter(barangay, healthCenter, period, date) {
  const barangayId = barangay.barangay_id;
  const healthCenterId = healthCenter.health_center_id;

  const patients = await Patient.find({
    health_center_id: healthCenterId,
    is_active: true,
  }).select(
    "compliance.risk_level compliance.compliance_percentage escalation.level date_started"
  );

  const totalPatients = patients.length;
  let compliantCount = 0;
  let atRiskCount = 0;
  let defaulterCount = 0;

  for (const p of patients) {
    const rl = p.compliance?.risk_level;
    if (rl === "Compliant") compliantCount++;
    else if (rl === "At Risk") atRiskCount++;
    else if (rl === "Defaulter") defaulterCount++;
  }

  // Share of patients currently classified Compliant — NOT an average
  // of patient.compliance.compliance_percentage, which is "% of the
  // full 6-month course completed so far" and is naturally low for
  // anyone mid-treatment regardless of how well they're doing. That
  // made every facility with any mid-course patients look "high" or
  // "critical" even with zero at-risk/defaulter patients. This matches
  // the same compliance definition already used everywhere else in
  // the app (city report, Barangay.stats via complianceSnapshot.job).
  const complianceRate =
    totalPatients > 0
      ? parseFloat(((compliantCount / totalPatients) * 100).toFixed(2))
      : 100;


  const openEscalations = await EscalationLog.find({
    health_center_id: healthCenterId,
    resolved: false,
  }).select("level");

  const escalationCounts = { level_1: 0, level_2: 0, level_3: 0 };
  for (const e of openEscalations) {
    if (e.level === 1) escalationCounts.level_1++;
    else if (e.level === 2) escalationCounts.level_2++;
    else if (e.level === 3) escalationCounts.level_3++;
  }

  const inventory = await Inventory.find({ health_center_id: healthCenterId }).select("stock_status");
  const stockStatus = resolveStockStatus(inventory);

  const riskLevel = deriveRiskLevel(complianceRate, totalPatients);
  const heatIntensity = calcHeatIntensity(complianceRate);

  const snapshotId = `HMAP-${healthCenterId}-${period}-${date.toISOString().split('T')[0]}`;

  const coordinates = {
    type: "Point",
    coordinates: resolveHealthCenterCoordinates(barangay, healthCenter),
  };

  return HeatmapSnapshot.findOneAndUpdate(
    { health_center_id: healthCenterId, period, snapshot_date: date },
    {
      $set: {
        snapshot_id: snapshotId,
        barangay_id: barangayId,
        barangay_name: barangay.name,
        health_center_id: healthCenterId,
        health_center_name: healthCenter.name,
        coordinates,
        boundary_geojson: barangay.boundary_geojson,
        active_cases: totalPatients,
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
    { upsert: true, new: true }
  );
}

// ─── Query Functions ──────────────────────────────────────────────────────────

export async function getHeatmap(period = "monthly", snapshotDate, barangayId, healthCenterId) {
  const filter = { period };

  if (healthCenterId) filter.health_center_id = healthCenterId;
  else if (barangayId) filter.barangay_id = barangayId;

  if (snapshotDate) {
    filter.snapshot_date = normaliseSnapshotDate(snapshotDate);
  } else {
    const latest = await HeatmapSnapshot.findOne({ period })
      .sort({ snapshot_date: -1 })
      .select("snapshot_date");

    if (!latest) return [];
    filter.snapshot_date = latest.snapshot_date;
  }

  return HeatmapSnapshot.find(filter).sort({ heat_intensity: -1 });
}

export async function getBarangayDetail(barangayId, period = "monthly", snapshotDate, healthCenterId) {
  const filter = healthCenterId
    ? { health_center_id: healthCenterId, period }
    : { barangay_id: barangayId, period };

  if (snapshotDate) {
    filter.snapshot_date = normaliseSnapshotDate(snapshotDate);
  }

  const snapshot = await HeatmapSnapshot.findOne(filter).sort({ snapshot_date: -1 });

  if (!snapshot) throw new Error(`No heatmap snapshot found for ${healthCenterId || barangayId}`);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const patientFilter = healthCenterId
    ? { health_center_id: healthCenterId, is_active: true }
    : { barangay_id: barangayId, is_active: true };

  const patients = await Patient.find(patientFilter).select(
    "compliance.risk_level compliance.compliance_percentage escalation.level date_started"
  );

  const activeAlerts = await Alert.find({
    barangay_id: barangayId,
    status: "Active",
  })
    .sort({ created_at: -1 })
    .select("alert_id alert_type severity message created_at");

  return { snapshot, patients, active_alerts: activeAlerts };
}

export async function getHeatmapHistory(barangayId, period = "monthly", from, to, limit = 30, healthCenterId) {
  const filter = healthCenterId
    ? { health_center_id: healthCenterId, period }
    : { barangay_id: barangayId, period };

  if (from || to) {
    filter.snapshot_date = {};
    if (from) filter.snapshot_date.$gte = normaliseSnapshotDate(from);
    if (to) filter.snapshot_date.$lte = normaliseSnapshotDate(to);
  }

  const history = await HeatmapSnapshot.find(filter)
    .sort({ snapshot_date: -1 })
    .limit(limit)
    .select(
      "snapshot_date compliance_rate heat_intensity risk_level " +
      "active_cases at_risk_count defaulter_count escalation_counts stock_status"
    );

  return history.reverse();
}