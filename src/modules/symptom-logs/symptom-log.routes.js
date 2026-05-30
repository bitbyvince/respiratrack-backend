// src/modules/symptom-logs/symptom-log.routes.js

import express from "express";
import * as controller from "./symptom-log.controller.js";
import * as service from "./symptom-log.service.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import {
  logSymptomSchema,
  reviewSymptomSchema,
} from "./symptom-log.validator.js";

const router = express.Router();

// ── Patient submits symptom log (mobile) ─────────────────────
router.post(
  "/",
  authenticate,
  authorizeRoles("patient", "nurse"),
  validate(logSymptomSchema),
  controller.logSymptom,
);

// ── Patient fetches own history (mobile) ─────────────────────
// GET /api/symptom-logs/history?page=1&limit=20
router.get(
  "/history",
  authenticate,
  authorizeRoles("patient"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const result = await service.getPatientLogs(req.user.patient_id, {
        page: Number(page),
        limit: Number(limit),
      });
      return sendSuccess(res, 200, "Symptom logs retrieved.", result);
    } catch (err) {
      return sendError(res, err);
    }
  },
);

// ── Patient fetches today's log (mobile) ─────────────────────
// GET /api/symptom-logs/today
router.get(
  "/today",
  authenticate,
  authorizeRoles("patient"),
  async (req, res) => {
    try {
      const log = await service.getLatestLog(req.user.patient_id);
      return sendSuccess(
        res,
        200,
        "Today's symptom log retrieved.",
        log ?? null,
      );
    } catch (err) {
      return sendError(res, err);
    }
  },
);

// ── Staff routes ──────────────────────────────────────────────
router.get(
  "/patient/:patientId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getPatientLogs,
);

router.get(
  "/patient/:patientId/latest",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getLatestLog,
);

router.get(
  "/barangay/:barangayId",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  controller.getBarangayLogs,
);

router.patch(
  "/:logId/review",
  authenticate,
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  validate(reviewSymptomSchema),
  controller.reviewLog,
);

export default router;
