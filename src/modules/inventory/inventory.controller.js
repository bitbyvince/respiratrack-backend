const inventoryService = require("./inventory.service");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

/**
 * GET /inventory
 * List all inventory records with optional filters.
 * Super admin sees all; nurse/barangay_admin scoped to their barangay.
 *
 * Query: barangay_id?, stock_status?, drug_name?, page?, limit?
 * Role:  super_admin, barangay_admin, nurse
 */
async function listInventory(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangay_id =
      role === "super_admin" ? req.query.barangay_id : userBarangay;

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

/**
 * GET /inventory/grouped
 * Returns inventory grouped by barangay.
 * Powers the super admin stock overview dashboard card.
 *
 * Query: barangay_id?
 * Role:  super_admin, barangay_admin (own barangay only)
 */
async function getInventoryGrouped(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin" ? req.query.barangay_id : userBarangay;

    const grouped =
      await inventoryService.getInventoryGroupedByBarangay(barangayId);

    return sendSuccess(res, 200, "Grouped inventory fetched", grouped);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /inventory/low-stock
 * Returns all inventory items that are not at OK status.
 * Powers the low-stock alert panel on the dashboard.
 *
 * Query: barangay_id?, include_ok?
 * Role:  super_admin, barangay_admin, nurse
 */
async function getLowStock(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin" ? req.query.barangay_id : userBarangay;

    const includeOk = req.query.include_ok === "true";

    const items = await inventoryService.getLowStockItems(
      barangayId,
      includeOk,
    );

    return sendSuccess(res, 200, "Low stock items fetched", items);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /inventory/stockout-predictions
 * Returns estimated stockout dates per drug per barangay.
 * Powers the stockout prediction widget on the dashboard.
 *
 * Query: barangay_id?, days_threshold?
 * Role:  super_admin, barangay_admin, nurse
 */
async function getStockoutPredictions(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin" ? req.query.barangay_id : userBarangay;

    const daysThreshold = req.query.days_threshold
      ? Number(req.query.days_threshold)
      : 30;

    const predictions = await inventoryService.getStockoutPredictions(
      barangayId,
      daysThreshold,
    );

    return sendSuccess(res, 200, "Stockout predictions fetched", predictions);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /inventory/:inventoryId
 * Fetch a single inventory record by its ID.
 *
 * Role: super_admin, barangay_admin, nurse
 */
async function getInventoryItem(req, res) {
  try {
    const item = await inventoryService.getInventoryById(
      req.params.inventoryId,
    );

    // Non-super-admins may only view their own barangay's records
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

/**
 * PATCH /inventory/:inventoryId/adjust
 * Manual stock adjustment (damaged, expired, recount correction, etc.)
 * Triggers stock status recompute and alert sync on write.
 *
 * Body: { adjustment, reason, notes? }
 * Role: barangay_admin (own barangay), super_admin
 */
async function adjustStock(req, res) {
  try {
    const item = await inventoryService.getInventoryById(
      req.params.inventoryId,
    );

    const { role, barangay_id: userBarangay, user_id } = req.user;
    if (role !== "super_admin" && item.barangay_id !== userBarangay) {
      return sendError(res, 403, "Access denied to this inventory record");
    }

    const result = await inventoryService.adjustStock(
      req.params.inventoryId,
      req.body.adjustment,
      req.body.reason,
      req.body.notes,
      user_id,
    );

    return sendSuccess(res, 200, "Stock adjusted", result);
  } catch (err) {
    const status = err.message === "Inventory record not found" ? 404 : 400;
    return sendError(res, status, err.message);
  }
}

module.exports = {
  listInventory,
  getInventoryGrouped,
  getLowStock,
  getStockoutPredictions,
  getInventoryItem,
  adjustStock,
};
