const heatmapService = require("./heatmap.service");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

/**
 * GET /heatmap
 * Returns the latest heatmap snapshot for all barangays (or filtered by one).
 * Powers the full map overlay on the web dashboard.
 *
 * Query: period?, snapshot_date?, barangay_id?
 * Role:  super_admin, barangay_admin, nurse
 */
async function getHeatmap(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    // Scope non-super-admin users to their own barangay
    const barangayId =
      role === "super_admin"
        ? req.query.barangay_id
        : userBarangay;

    const snapshots = await heatmapService.getHeatmap(
      req.query.period,
      req.query.snapshot_date,
      barangayId
    );

    return sendSuccess(res, 200, "Heatmap data fetched", snapshots);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /heatmap/barangays/:barangayId
 * Returns full detail + live patient list + active alerts for a single
 * barangay zone. Powers the clickable sidebar panel (Add 5).
 *
 * Query: period?, snapshot_date?
 * Role:  super_admin, barangay_admin (own), nurse (own)
 */
async function getBarangayDetail(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const { barangayId } = req.params;

    // Non-super-admins may only view their own barangay
    if (role !== "super_admin" && barangayId !== userBarangay) {
      return sendError(res, 403, "Access denied to this barangay");
    }

    const detail = await heatmapService.getBarangayDetail(
      barangayId,
      req.query.period,
      req.query.snapshot_date
    );

    return sendSuccess(res, 200, "Barangay detail fetched", detail);
  } catch (err) {
    const status = err.message.includes("No heatmap snapshot") ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

/**
 * GET /heatmap/barangays/:barangayId/history
 * Returns time-series snapshots for trend charting.
 *
 * Query: period?, from?, to?, limit?
 * Role:  super_admin, barangay_admin (own), nurse (own)
 */
async function getHeatmapHistory(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const { barangayId } = req.params;

    if (role !== "super_admin" && barangayId !== userBarangay) {
      return sendError(res, 403, "Access denied to this barangay");
    }

    const history = await heatmapService.getHeatmapHistory(
      barangayId,
      req.query.period,
      req.query.from,
      req.query.to,
      req.query.limit ? Number(req.query.limit) : undefined
    );

    return sendSuccess(res, 200, "Heatmap history fetched", history);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * POST /heatmap/build
 * Manually triggers a snapshot rebuild for all barangays.
 * Normally fired by heatmapSnapshot.job.js — exposed for admin use.
 *
 * Body: { period?, snapshot_date? }
 * Role: super_admin only
 */
async function buildSnapshots(req, res) {
  try {
    const snapshots = await heatmapService.buildSnapshots(
      req.body.period,
      req.body.snapshot_date
    );

    return sendSuccess(
      res,
      201,
      `${snapshots.length} heatmap snapshot(s) built`,
      { count: snapshots.length }
    );
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

module.exports = {
  getHeatmap,
  getBarangayDetail,
  getHeatmapHistory,
  buildSnapshots,
};