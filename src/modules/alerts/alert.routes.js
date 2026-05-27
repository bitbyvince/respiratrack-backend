import express from "express";
import * as controller from "./alert.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createAlertSchema, resolveAlertSchema } from "./alert.validator.js";

const router = express.Router();

router.post(
  "/",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  validate(createAlertSchema),
  controller.createAlert,
);

router.get(
  "/",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getAlerts,
);

router.get(
  "/:alertId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getAlert,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayAlerts,
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getPatientAlerts,
);

router.patch(
  "/:alertId/resolve",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  validate(resolveAlertSchema),
  controller.resolveAlert,
);

router.patch(
  "/:alertId/acknowledge",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.acknowledgeAlert,
);

export default router;
