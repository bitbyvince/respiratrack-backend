import { Router } from "express";
import * as controller from "./inventory.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  getInventorySchema,
  adjustStockSchema,
  getLowStockSchema,
  getStockoutPredictionSchema,
  restockInventorySchema,
} from "./inventory.validator.js";
import { ROLES } from "../../constants/roles.js";

const router = Router();

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC];
const ADMIN_AND_ABOVE = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATC];

router.get(
  "/",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getInventorySchema, "query"),
  controller.listInventory
);

router.get(
  "/grouped",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE),
  controller.getInventoryGrouped
);

router.get(
  "/low-stock",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getLowStockSchema, "query"),
  controller.getLowStock
);

router.get(
  "/stockout-predictions",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getStockoutPredictionSchema, "query"),
  controller.getStockoutPredictions
);

router.get(
  "/export/pdf",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  controller.exportInventoryPdf
);

router.get(
  "/:inventoryId",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  controller.getInventoryItem
);

router.patch(
  "/:inventoryId/adjust",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE),
  validate(adjustStockSchema),
  controller.adjustStock
);

router.patch(
  "/:inventoryId/restock",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE),
  validate(restockInventorySchema),
  controller.restockInventory
);

export default router;