const HeatmapSnapshot = require("../../models/HeatmapSnapshot.model");
const Barangay = require("../../models/Barangay.model");
const Patient = require("../../models/Patient.model");
const Alert = require("../../models/Alert.model");
const EscalationLog = require("../../models/EscalationLog.model");
const Inventory = require("../../models/Inventory.model");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derives a risk level label from a compliance rate percentage.
 * Mirrors the thresholds used in barangay.stats.risk_level.
 *   >= 80% → low
 *   >= 65% → moderate
 *   >= 50% → high
 *   <  50% → critical
 */
function deriveRiskLevel(complianceRate) {
  if (complianceRate >= 80) return "low";
  if (complianceRate >= 65) return "moderate";
  if (complianceRate >= 50) return "high";
  return "critical";
}

/**
 * heat_intensity = 1 - (compliance_rate / 100), clamped to [0, 1].
 * Higher non-compliance → hotter zone on the map.
 */
function calcHeatIntensity(complianceRate) {
  return parseFloat((1 - complianceRate / 100).toFixed(4));
}

/**
 * Resolves the worst stock status across all inventory records
 * for a barangay. Priority: Stockout > Critical > Low > OK.
 */
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

/**
 * Normalises a snapshot_date param to midnight UTC for the given date.
 * Defaults to today if not provided.
 */
function normaliseSnapshotDate(date) {
  const d = date ? new Date(date) : new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Core Builder ─────────────────────────────────────────────────────────────

/**
 * Computes a fresh heatmap snapshot for every barangay and persists it.
 * Called nightly by heatmapSnapshot.job.js.
 *
 * @param {string} period   - "daily" | "monthly" | "all_time"
 * @param {Date}   snapshotDate
 * @returns {HeatmapSnapshot[]} - array of upserted snapshot docs
 */
async function buildSnapshots(period = "monthly", snapshotDate) {
  const date = normaliseSnapshotDate(snapshotDate);
  const barangays = await Barangay.find({});

  const results = await Promise.all(
    barangays.map((brgy) => buildSnapshotForBarangay(brgy, period, date))
  );

  return results;
}

/**
 * Builds and upserts a single barangay snapshot.
 */
async function buildSnapshotForBarangay(barangay, period, date) {
  const barangayId = barangay.barangay_id;

  // ── Active patients for this barangay ──────────────────────────────────────
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

  for (const p of patients) {
    const rl = p.compliance?.risk_level;
    if (rl === "Compliant") compliantCount++;
    else if (rl === "At Risk") atRiskCount++;
    else if (rl === "Defaulter") defaulterCount++;
    totalCompliance += p.compliance?.compliance_percentage ?? 0;
  }

  const complianceRate =
    totalPatients > 0
      ? parseFloat((totalCompliance / totalPatients).toFixed(2))
      : 100;

  // ── Open escalations ───────────────────────────────────────────────────────
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

  // ── Inventory stock status ─────────────────────────────────────────────────
  const inventory = await Inventory.find({ barangay_id: barangayId }).select(
    "stock_status"
  );
  const stockStatus = resolveStockStatus(inventory);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const riskLevel = deriveRiskLevel(complianceRate);
  const heatIntensity = calcHeatIntensity(complianceRate);

  // ── Upsert snapshot ────────────────────────────────────────────────────────
  const snapshot = await HeatmapSnapshot.findOneAndUpdate(
    { barangay_id: barangayId, period, snapshot_date: date },
    {
      $set: {
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

  return snapshot;
}

// ─── Query Functions ──────────────────────────────────────────────────────────

/**
 * Returns the latest heatmap snapshot for every barangay
 * (or a specific one if barangay_id is supplied).
 * Used to render the full heatmap overlay on the web dashboard.
 *
 * @param {string}  period
 * @param {Date}    snapshotDate  - if omitted, returns the most recent available
 * @param {string}  barangayId   - optional filter
 */
async function getHeatmap(period = "monthly", snapshotDate, barangayId) {
  const filter = { period };

  if (barangayId) filter.barangay_id = barangayId;

  if (snapshotDate) {
    const date = normaliseSnapshotDate(snapshotDate);
    filter.snapshot_date = date;
  }

  // If no date supplied, grab the latest snapshot date available for the period
  if (!snapshotDate) {
    const latest = await HeatmapSnapshot.findOne({ period })
      .sort({ snapshot_date: -1 })
      .select("snapshot_date");

    if (!latest) return [];
    filter.snapshot_date = latest.snapshot_date;
  }

  const snapshots = await HeatmapSnapshot.find(filter).sort({
    heat_intensity: -1,
  });

  return snapshots;
}

/**
 * Returns the full detail snapshot for a single barangay.
 * Powers the sidebar panel when a heatmap zone is clicked (Add 5).
 *
 * @param {string} barangayId
 * @param {string} period
 * @param {Date}   snapshotDate
 */
async function getBarangayDetail(barangayId, period = "monthly", snapshotDate) {
  const filter = { barangay_id: barangayId, period };

  if (snapshotDate) {
    filter.snapshot_date = normaliseSnapshotDate(snapshotDate);
  }

  const snapshot = await HeatmapSnapshot.findOne(filter).sort({
    snapshot_date: -1,
  });

  if (!snapshot) throw new Error(`No heatmap snapshot found for ${barangayId}`);

  // Enrich with live patient list for the sidebar panel
  const patients = await Patient.find({
    barangay_id: barangayId,
    is_active: true,
  }).select(
    "patient_id tb_case_number full_name compliance.risk_level " +
    "compliance.compliance_percentage compliance.consecutive_missed_doses " +
    "escalation.level treatment_phase"
  );

  // Active alerts for this barangay
  const activeAlerts = await Alert.find({
    barangay_id: barangayId,
    status: "Active",
  })
    .sort({ created_at: -1 })
    .select("alert_id alert_type severity message created_at");

  return {
    snapshot,
    patients,
    active_alerts: activeAlerts,
  };
}

/**
 * Returns time-series snapshot history for a single barangay.
 * Powers the compliance trend chart on the sidebar / dashboard.
 *
 * @param {string} barangayId
 * @param {string} period
 * @param {Date}   from
 * @param {Date}   to
 * @param {number} limit
 */
async function getHeatmapHistory(
  barangayId,
  period = "monthly",
  from,
  to,
  limit = 30
) {
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

  // Return ascending order for charting
  return history.reverse();
}

module.exports = {
  buildSnapshots,
  buildSnapshotForBarangay,
  getHeatmap,
  getBarangayDetail,
  getHeatmapHistory,
};