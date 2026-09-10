import * as inventoryService from "./inventory.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { isSuperAdminLevel } from "../../constants/roles.js";

export async function listInventory(req, res) {
  try {
    const { role, barangay_id: userBarangay, health_center_id: userHealthCenter } = req.user;
    const barangay_id = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;
    const health_center_id = isSuperAdminLevel(role) ? req.query.health_center_id : userHealthCenter;
    const result = await inventoryService.listInventory({
      barangay_id,
      health_center_id,
      stock_status: req.query.stock_status,
      drug_name: req.query.drug_name,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    return sendSuccess(res, 200, "Inventory fetched", result);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export async function getInventoryGrouped(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;
    const grouped = await inventoryService.getInventoryGroupedByBarangay(barangayId);
    return sendSuccess(res, 200, "Grouped inventory fetched", grouped);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export async function getLowStock(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;
    const includeOk = req.query.include_ok === "true";
    const items = await inventoryService.getLowStockItems(barangayId, includeOk);
    return sendSuccess(res, 200, "Low stock items fetched", items);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export async function getStockoutPredictions(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;
    const daysThreshold = req.query.days_threshold ? Number(req.query.days_threshold) : 30;
    const predictions = await inventoryService.getStockoutPredictions(barangayId, daysThreshold);
    return sendSuccess(res, 200, "Stockout predictions fetched", predictions);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export async function getInventoryItem(req, res) {
  try {
    const item = await inventoryService.getInventoryById(req.params.inventoryId);
    const { role, barangay_id: userBarangay } = req.user;
    if (!isSuperAdminLevel(role) && item.barangay_id !== userBarangay) {
      return sendError(res, 403, "Access denied to this inventory record");
    }
    return sendSuccess(res, 200, "Inventory item fetched", item);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export async function createInventoryItem(req, res) {
  try {
    const { role, barangay_id: userBarangay, user_id } = req.user;
    const barangay_id = isSuperAdminLevel(role) ? req.body.barangay_id : userBarangay;
    if (!barangay_id) {
      return sendError(res, 400, "barangay_id is required");
    }
    if (!isSuperAdminLevel(role) && req.body.barangay_id && req.body.barangay_id !== userBarangay) {
      return sendError(res, 403, "Access denied to create inventory for a different barangay");
    }

    const item = await inventoryService.createInventoryItem({
      ...req.body,
      barangay_id,
      createdByUserId: user_id,
    });
    return sendSuccess(res, 201, "Inventory item created", item);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export async function adjustStock(req, res) {
  try {
    const item = await inventoryService.getInventoryById(req.params.inventoryId);
    const { role, barangay_id: userBarangay, user_id } = req.user;
    if (!isSuperAdminLevel(role) && item.barangay_id !== userBarangay) {
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
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export async function restockInventory(req, res) {
  try {
    const item = await inventoryService.getInventoryById(req.params.inventoryId);
    const { role, barangay_id: userBarangay, user_id } = req.user;
    if (!isSuperAdminLevel(role) && item.barangay_id !== userBarangay) {
      return sendError(res, 403, "Access denied to this inventory record");
    }

    const result = await inventoryService.restockInventoryItem(
      req.params.inventoryId,
      req.body.quantity_added,
      req.body.notes,
      user_id
    );

    return sendSuccess(res, 200, "Inventory restocked", result);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export async function exportInventoryPdf(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;

    const pdfBuffer = await inventoryService.exportInventoryPdf(barangayId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="inventory_${Date.now()}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return sendError(res, err);
  }
}