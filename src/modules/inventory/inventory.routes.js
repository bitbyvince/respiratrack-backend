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
} from "./inventory.validator.js";
import { ROLES } from "../../constants/roles.js";

const router = Router();

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];
const ADMIN_AND_ABOVE = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN];

router.get(
  "/",
  authenticate,
  authorizeRoles(...ALL_STAFF),      // 👈 add spread
  validate(getInventorySchema, "query"),
  controller.listInventory
);

router.get(
  "/grouped",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE), // 👈 add spread
  controller.getInventoryGrouped
);

router.get(
  "/low-stock",
  authenticate,
  authorizeRoles(...ALL_STAFF),       // 👈 add spread
  validate(getLowStockSchema, "query"),
  controller.getLowStock
);

router.get(
  "/stockout-predictions",
  authenticate,
  authorizeRoles(...ALL_STAFF),       // 👈 add spread
  validate(getStockoutPredictionSchema, "query"),
  controller.getStockoutPredictions
);

router.get(
  "/:inventoryId",
  authenticate,
  authorizeRoles(...ALL_STAFF),       // 👈 add spread
  controller.getInventoryItem
);

router.patch(
  "/:inventoryId/adjust",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE), // 👈 add spread
  validate(adjustStockSchema),
  controller.adjustStock
);

export default router;