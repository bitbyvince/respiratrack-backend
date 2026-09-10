import * as heatmapService from "./heatmap.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { isSuperAdminLevel } from "../../constants/roles.js";

export async function getHeatmap(req, res) {
  try {
    const { role, barangay_id: userBarangay, health_center_id: userHealthCenter } = req.user;
    const barangayId = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;
    const healthCenterId = isSuperAdminLevel(role) ? req.query.health_center_id : userHealthCenter;
    const snapshots = await heatmapService.getHeatmap(
      req.query.period,
      req.query.snapshot_date,
      barangayId,
      healthCenterId
    );
    return sendSuccess(res, 200, "Heatmap data fetched", snapshots);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getBarangayDetail(req, res) {
  try {
    const { role, barangay_id: userBarangay, health_center_id: userHealthCenter } = req.user;
    const { barangayId } = req.params;
    if (!isSuperAdminLevel(role) && barangayId !== userBarangay) {
      return sendError(res, 403, "Access denied to this barangay");
    }
    const healthCenterId = isSuperAdminLevel(role) ? req.query.health_center_id : userHealthCenter;
    const detail = await heatmapService.getBarangayDetail(
      barangayId,
      req.query.period,
      req.query.snapshot_date,
      healthCenterId
    );
    return sendSuccess(res, 200, "Barangay detail fetched", detail);
  } catch (err) {
    const status = err.message.includes("No heatmap snapshot") ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

export async function getHeatmapHistory(req, res) {
  try {
    const { role, barangay_id: userBarangay, health_center_id: userHealthCenter } = req.user;
    const { barangayId } = req.params;
    if (!isSuperAdminLevel(role) && barangayId !== userBarangay) {
      return sendError(res, 403, "Access denied to this barangay");
    }
    const healthCenterId = isSuperAdminLevel(role) ? req.query.health_center_id : userHealthCenter;
    const history = await heatmapService.getHeatmapHistory(
      barangayId,
      req.query.period,
      req.query.from,
      req.query.to,
      req.query.limit ? Number(req.query.limit) : undefined,
      healthCenterId
    );
    return sendSuccess(res, 200, "Heatmap history fetched", history);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function buildSnapshots(req, res) {
  try {
    const snapshots = await heatmapService.buildSnapshots(
      req.body.period,
      req.body.snapshot_date
    );
    return sendSuccess(res, 200, `${snapshots.length} heatmap snapshot(s) built`, {
      count: snapshots.length,
    });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}