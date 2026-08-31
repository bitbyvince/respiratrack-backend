import { Router } from "express";
import * as controller from "./compliance.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  authorizeStaffOrPatc,
  authorizeAdminOrPatc,
  enforceBarangayScope,
} from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  listComplianceSchema,
  snapshotParamsSchema,
} from "./compliance.validator.js";

const router = Router();

router.get(
  "/",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  validate(listComplianceSchema, "query"),
  controller.getComplianceSnapshots
);

router.get(
  "/latest",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  validate(listComplianceSchema, "query"),
  controller.getLatestSnapshots
);

router.get(
  "/summary",
  authenticate,
  authorizeAdminOrPatc,
  validate(listComplianceSchema, "query"),
  controller.getComplianceSummary
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeStaffOrPatc,
  enforceBarangayScope,
  validate(snapshotParamsSchema, "params"),
  validate(listComplianceSchema, "query"),
  controller.getBarangaySnapshot
);

export default router;