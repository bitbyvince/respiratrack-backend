const express = require("express");
const router = express.Router();
const controller = require("./dispensing.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const {
  authorizeStaff,
  authorizeStockDispensing,
  enforceBarangayScope,
} = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  createDispensingSchema,
  listDispensingSchema,
  dispensingIdParamsSchema,
} = require("./dispensing.validator");

router.post(
  "/",
  authenticate,
  authorizeStockDispensing,
  validate(createDispensingSchema),
  controller.createDispensingRecord,
);

router.get(
  "/",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getDispensingRecords,
);

router.get(
  "/:recordId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(dispensingIdParamsSchema, "params"),
  controller.getDispensingRecord,
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getPatientDispensingRecords,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeStaff,
  enforceBarangayScope,
  validate(listDispensingSchema, "query"),
  controller.getBarangayDispensingRecords,
);

module.exports = router;
