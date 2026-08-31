import HeatmapSnapshot from "../../models/HeatmapSnapshot.model.js";
import Barangay from "../../models/Barangay.model.js";
import Patient from "../../models/Patient.model.js";
import Alert from "../../models/Alert.model.js";
import EscalationLog from "../../models/EscalationLog.model.js";
import Inventory from "../../models/Inventory.model.js";

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

  return Promise.all(
    barangays.map((brgy) => buildSnapshotForBarangay(brgy, period, date))
  );
}

export async function buildSnapshotForBarangay(barangay, period, date) {
  const barangayId = barangay.barangay_id;

  const patients = await Patient.find({
    barangay_id: barangayId,
    is_active: true,
  }).select(
    "compliance.risk_level compliance.compliance_percentage escalation.level"
  );

  const totalPatients = patients.length;
  let compliantCount = 0;
  let atRiskCount = 0;
  let defaulterCount = 0;
  let totalCompliance = 0;

  // AFTER
let eligibleCount = 0;

for (const p of patients) {
  const rl = p.compliance?.risk_level;
  if (rl === "Compliant") compliantCount++;
  else if (rl === "At Risk") atRiskCount++;
  else if (rl === "Defaulter") defaulterCount++;

  // Only include in compliance rate if started more than 7 days ago
  const startedMoreThan7DaysAgo = p.date_started && new Date(p.date_started) <= sevenDaysAgo;
    if (startedMoreThan7DaysAgo) {
      totalCompliance += p.compliance?.compliance_percentage ?? 0;
      eligibleCount++;
    }
  }

  const complianceRate =
    eligibleCount > 0
      ? parseFloat((totalCompliance / eligibleCount).toFixed(2))
      : 100; // default to 100% if all patients just started
      

  const openEscalations = await EscalationLog.find({
    barangay_id: barangayId,
    resolved: false,
  }).select("level");

  const escalationCounts = { level_1: 0, level_2: 0, level_3: 0 };
  for (const e of openEscalations) {
    if (e.level === 1) escalationCounts.level_1++;
    else if (e.level === 2) escalationCounts.level_2++;
    else if (e.level === 3) escalationCounts.level_3++;
  }

  const inventory = await Inventory.find({ barangay_id: barangayId }).select("stock_status");
  const stockStatus = resolveStockStatus(inventory);

  const riskLevel = deriveRiskLevel(complianceRate, totalPatients);
  const heatIntensity = calcHeatIntensity(complianceRate);

  const snapshotId = `HMAP-${barangayId}-${period}-${date.toISOString().split('T')[0]}`;


    return HeatmapSnapshot.findOneAndUpdate(
      { barangay_id: barangayId, period, snapshot_date: date },
      {
        $set: {
      snapshot_id: snapshotId,
      barangay_name: barangay.name,
        health_center_name: barangay.health_center?.name ?? "",
        coordinates: barangay.coordinates,
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

export async function getHeatmap(period = "monthly", snapshotDate, barangayId) {
  const filter = { period };

  if (barangayId) filter.barangay_id = barangayId;

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

export async function getBarangayDetail(barangayId, period = "monthly", snapshotDate) {
  const filter = { barangay_id: barangayId, period };

  if (snapshotDate) {
    filter.snapshot_date = normaliseSnapshotDate(snapshotDate);
  }

  const snapshot = await HeatmapSnapshot.findOne(filter).sort({ snapshot_date: -1 });

  if (!snapshot) throw new Error(`No heatmap snapshot found for ${barangayId}`);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const patients = await Patient.find({
    barangay_id: barangayId,
    is_active: true,
  }).select(
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

export async function getHeatmapHistory(barangayId, period = "monthly", from, to, limit = 30) {
  const filter = { barangay_id: barangayId, period };

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