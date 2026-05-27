import * as heatmapService from "./heatmap.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export async function getHeatmap(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;

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

export async function getBarangayDetail(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const { barangayId } = req.params;

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

export async function getHeatmapHistory(req, res) {
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

export async function buildSnapshots(req, res) {
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