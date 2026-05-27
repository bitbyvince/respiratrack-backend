import * as inventoryService from "./inventory.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export async function listInventory(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangay_id = role === "super_admin" ? req.query.barangay_id : userBarangay;

    const result = await inventoryService.listInventory({
      barangay_id,
      stock_status: req.query.stock_status,
      drug_name: req.query.drug_name,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });

    return sendSuccess(res, 200, "Inventory fetched", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getInventoryGrouped(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;

    const grouped = await inventoryService.getInventoryGroupedByBarangay(barangayId);

    return sendSuccess(res, 200, "Grouped inventory fetched", grouped);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getLowStock(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;
    const includeOk = req.query.include_ok === "true";

    const items = await inventoryService.getLowStockItems(barangayId, includeOk);

    return sendSuccess(res, 200, "Low stock items fetched", items);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getStockoutPredictions(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;
    const daysThreshold = req.query.days_threshold ? Number(req.query.days_threshold) : 30;

    const predictions = await inventoryService.getStockoutPredictions(barangayId, daysThreshold);

    return sendSuccess(res, 200, "Stockout predictions fetched", predictions);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getInventoryItem(req, res) {
  try {
    const item = await inventoryService.getInventoryById(req.params.inventoryId);

    const { role, barangay_id: userBarangay } = req.user;
    if (role !== "super_admin" && item.barangay_id !== userBarangay) {
      return sendError(res, 403, "Access denied to this inventory record");
    }

    return sendSuccess(res, 200, "Inventory item fetched", item);
  } catch (err) {
    const status = err.message === "Inventory record not found" ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

export async function adjustStock(req, res) {
  try {
    const item = await inventoryService.getInventoryById(req.params.inventoryId);

    const { role, barangay_id: userBarangay, user_id } = req.user;
    if (role !== "super_admin" && item.barangay_id !== userBarangay) {
      return sendError(res, 403, "Access denied to this inventory record");
    }

    const result = await inventoryService.adjustStock(
      req.params.inventoryId,
      req.body.adjustment,
      req.body.reason,
      req.body.notes,
      user_id
    );

    return sendSuccess(res, 200, "Stock adjusted", result);
  } catch (err) {
    const status = err.message === "Inventory record not found" ? 404 : 400;
    return sendError(res, status, err.message);
  }
}