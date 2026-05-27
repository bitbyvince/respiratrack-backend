import { Router } from "express";
import * as controller from "./compliance.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  authorizeStaff,
  authorizeAdmin,
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
  authorizeStaff,
  enforceBarangayScope,
  validate(listComplianceSchema, "query"),
  controller.getComplianceSnapshots
);

router.get(
  "/latest",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listComplianceSchema, "query"),
  controller.getLatestSnapshots
);

router.get(
  "/summary",
  authenticate,
  authorizeAdmin,
  validate(listComplianceSchema, "query"),
  controller.getComplianceSummary
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(snapshotParamsSchema, "params"),
  validate(listComplianceSchema, "query"),
  controller.getBarangaySnapshot
);

export default router;