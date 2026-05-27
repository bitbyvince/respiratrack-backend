medication - log.routes.js;

const express = require("express");
const router = express.Router();
const controller = require("./medication-log.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  logMedicationSchema,
  updateMedicationLogSchema,
} = require("./medication-log.validator");

router.post(
  "/",
  authenticate,
  authorize("nurse", "patient"),
  validate(logMedicationSchema),
  controller.logMedication,
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getPatientLogs,
);

router.get(
  "/patient/:patientId/today",
  authenticate,
  authorize("nurse", "patient"),
  controller.getTodayLog,
);

router.get(
  "/patient/:patientId/missed",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getMissedDoses,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayLogs,
);

router.patch(
  "/:logId",
  authenticate,
  authorize("nurse"),
  validate(updateMedicationLogSchema),
  controller.updateLog,
);

module.exports = router;
