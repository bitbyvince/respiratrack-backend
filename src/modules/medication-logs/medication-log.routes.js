import { Router } from "express";
import * as controller from "./medication-log.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorize } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  logMedicationSchema,
  updateMedicationLogSchema,
} from "./medication-log.validator.js";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("nurse", "patient"),
  validate(logMedicationSchema),
  controller.logMedication
);

router.get(
  "/my",
  authenticate,
  authorize("patient"),
  controller.getMyLogs
);

router.get(
  "/patient/:patientId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getPatientLogs
);

router.get(
  "/patient/:patientId/today",
  authenticate,
  authorize("nurse", "patient"),
  controller.getTodayLog
);

router.get(
  "/patient/:patientId/missed",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getMissedDoses
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorize("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayLogs
);

router.patch(
  "/:logId",
  authenticate,
  authorize("nurse"),
  validate(updateMedicationLogSchema),
  controller.updateLog
);

export default router;