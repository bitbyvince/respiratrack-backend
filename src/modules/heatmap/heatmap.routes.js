import { Router } from "express";
import * as controller from "./heatmap.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  getHeatmapSchema,
  buildSnapshotSchema,
  getBarangayDetailSchema,
  getHeatmapHistorySchema,
} from "./heatmap.validator.js";
import { ROLES } from "../../constants/roles.js";

const router = Router();

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];
const ADMIN_ONLY = [ROLES.SUPER_ADMIN];

router.get(
  "/",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getHeatmapSchema, "query"),
  controller.getHeatmap
);

router.post(
  "/build",
  authenticate,
  authorizeRoles(...ADMIN_ONLY),
  validate(buildSnapshotSchema),
  controller.buildSnapshots
);

router.get(
  "/barangays/:barangayId",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getBarangayDetailSchema, "query"),
  controller.getBarangayDetail
);

router.get(
  "/barangays/:barangayId/history",
  authenticate,
  authorizeRoles(...ALL_STAFF),
  validate(getHeatmapHistorySchema, "query"),
  controller.getHeatmapHistory
);

export default router;