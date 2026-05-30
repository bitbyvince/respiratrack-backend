// medication-log.routes.js

import { Router } from "express";
import * as controller from "./medication-log.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  logMedicationSchema,
  updateMedicationLogSchema,
} from "./medication-log.validator.js";

const router = Router();

// ── Inline role check — avoids circular dependency ────────
const allowRoles =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          success: false,
          code: "NOT_AUTHENTICATED",
          message: "Authentication required.",
        });
    }
    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({
          success: false,
          code: "FORBIDDEN_ROLE",
          message: `Access denied. Your role: ${req.user.role}.`,
        });
    }
    return next();
  };

// ── Patient self-view ─────────────────────────────────────
router.get(
  "/my",
  authenticate,
  allowRoles("patient"),
  controller.getMyLogByDate,
);

// ── Mark taken ────────────────────────────────────────────
router.post(
  "/",
  authenticate,
  allowRoles("nurse", "patient"),
  validate(logMedicationSchema),
  controller.logMedication,
);

// ── Staff + patient read routes ───────────────────────────
router.get(
  "/patient/:patientId",
  authenticate,
  allowRoles("nurse", "barangay_admin", "super_admin", "patient"),
  controller.getPatientLogs,
);

router.get(
  "/patient/:patientId/today",
  authenticate,
  allowRoles("nurse", "patient"),
  controller.getTodayLog,
);

router.get(
  "/patient/:patientId/missed",
  authenticate,
  allowRoles("nurse", "barangay_admin", "super_admin"),
  controller.getMissedDoses,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  allowRoles("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayLogs,
);

router.patch(
  "/:logId",
  authenticate,
  allowRoles("nurse"),
  validate(updateMedicationLogSchema),
  controller.updateLog,
);

export default router;
