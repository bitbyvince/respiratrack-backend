import express from "express";
import * as controller from "./stock-allocation.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createAllocationSchema,
  getAllocationsQuerySchema,
} from "./stock-allocation.validator.js";
import ROLES from "../../constants/roles.js";

const router = express.Router();
router.use(authenticate);

router.post(
  "/",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.PATC),
  validate(createAllocationSchema),
  controller.createAllocation,
);
router.get(
  "/",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  validate(getAllocationsQuerySchema, "query"),
  controller.getAllocations,
);
router.get(
  "/summary/:barangay_id",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  controller.getAllocationSummary,
);
router.get(
  "/:allocation_id",
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.PATC),
  controller.getAllocationById,
);

export default router;
