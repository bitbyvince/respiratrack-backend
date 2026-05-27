const express = require("express");
const router = express.Router();
const controller = require("./compliance.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const {
  authorizeStaff,
  authorizeAdmin,
  enforceBarangayScope,
} = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  listComplianceSchema,
  snapshotParamsSchema,
} = require("./compliance.validator");

router.get(
  "/",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listComplianceSchema, "query"),
  controller.getComplianceSnapshots,
);

router.get(
  "/latest",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listComplianceSchema, "query"),
  controller.getLatestSnapshots,
);

router.get(
  "/summary",
  authenticate,
  authorizeAdmin,
  validate(listComplianceSchema, "query"),
  controller.getComplianceSummary,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(snapshotParamsSchema, "params"),
  validate(listComplianceSchema, "query"),
  controller.getBarangaySnapshot,
);

module.exports = router;
