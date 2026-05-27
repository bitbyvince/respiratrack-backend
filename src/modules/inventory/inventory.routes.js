const express = require("express");
const router = express.Router();

const controller = require("./inventory.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  getInventorySchema,
  adjustStockSchema,
  getLowStockSchema,
  getStockoutPredictionSchema,
} = require("./inventory.validator");
const { ROLES } = require("../../constants/roles");

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];
const ADMIN_AND_ABOVE = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN];
const SUPER_ADMIN_ONLY = [ROLES.SUPER_ADMIN];

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /inventory
 * Full paginated inventory list with optional filters.
 */
router.get(
  "/",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getInventorySchema, "query"),
  controller.listInventory
);

/**
 * GET /inventory/grouped
 * Inventory grouped by barangay — super admin overview card.
 */
router.get(
  "/grouped",
  authenticate,
  authorizeRoles(ADMIN_AND_ABOVE),
  controller.getInventoryGrouped
);

/**
 * GET /inventory/low-stock
 * All non-OK inventory items — powers low-stock alert panel.
 */
router.get(
  "/low-stock",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getLowStockSchema, "query"),
  controller.getLowStock
);

/**
 * GET /inventory/stockout-predictions
 * Estimated stockout dates per drug — powers prediction widget.
 */
router.get(
  "/stockout-predictions",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getStockoutPredictionSchema, "query"),
  controller.getStockoutPredictions
);

/**
 * POST /inventory/recompute
 * Admin-triggered full stock status recompute.
 * Normally fired by stockoutPrediction.job.js.
 */
router.post(
  "/recompute",
  authenticate,
  authorizeRoles(SUPER_ADMIN_ONLY),
  controller.recomputeAll
);

/**
 * GET /inventory/:inventoryId
 * Single inventory record detail.
 */
router.get(
  "/:inventoryId",
  authenticate,
  authorizeRoles(ALL_STAFF),
  controller.getInventoryItem
);

/**
 * PATCH /inventory/:inventoryId/adjust
 * Manual stock correction — damaged, expired, recount, returned.
 */
router.patch(
  "/:inventoryId/adjust",
  authenticate,
  authorizeRoles(ADMIN_AND_ABOVE),
  validate(adjustStockSchema),
  controller.adjustStock
);

module.exports = router;