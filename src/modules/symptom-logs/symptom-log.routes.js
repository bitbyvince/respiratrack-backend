const express = require("express");
const router = express.Router();
const controller = require("./symptom-log.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  logSymptomSchema,
  reviewSymptomSchema,
} = require("./symptom-log.validator");

router.post(
  "/",
  authenticate,
  authorize("patient", "nurse"),
  validate(logSymptomSchema),
  controller.logSymptom,
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getPatientLogs,
);

router.get(
  "/patient/:patientId/latest",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getLatestLog,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayLogs,
);

router.patch(
  "/:logId/review",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  validate(reviewSymptomSchema),
  controller.reviewLog,
);

module.exports = router;
