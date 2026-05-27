const express = require("express");
const router = express.Router();
const controller = require("./alert.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorize } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const { createAlertSchema, resolveAlertSchema } = require("./alert.validator");

router.post(
  "/",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  validate(createAlertSchema),
  controller.createAlert,
);

router.get(
  "/",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getAlerts,
);

router.get(
  "/:alertId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getAlert,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayAlerts,
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getPatientAlerts,
);

router.patch(
  "/:alertId/resolve",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  validate(resolveAlertSchema),
  controller.resolveAlert,
);

router.patch(
  "/:alertId/acknowledge",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.acknowledgeAlert,
);

module.exports = router;
