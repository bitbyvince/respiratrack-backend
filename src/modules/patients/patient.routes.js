const express = require("express");
const router = express.Router();
const patientController = require("./patient.controller");
const { validate } = require("../../middleware/validate.middleware");
const { authMiddleware } = require("../../middleware/auth.middleware");
const { roleMiddleware } = require("../../middleware/role.middleware");
const ROLES = require("../../constants/roles");
const {
  registerPatientSchema,
  updatePatientSchema,
  updateTreatmentOutcomeSchema,
  updateSputumScheduleSchema,
  listPatientsSchema,
} = require("./patient.validator");

// ── All routes require authentication ────────────────────
router.use(authMiddleware);

// ================================================================
// LIST & SEARCH
// ================================================================

// GET /api/patients
// super_admin       → all barangays
// barangay_admin    → their barangay only
// nurse             → their barangay only
// patient           → forbidden (patients use /api/patients/me)
router.get(
  "/",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  validate(listPatientsSchema, "query"),
  patientController.listPatients,
);

// ================================================================
// PATIENT SELF-VIEW (mobile app)
// ================================================================

// GET /api/patients/me
// Returns the logged-in patient's own full profile
router.get(
  "/me",
  roleMiddleware([ROLES.PATIENT]),
  patientController.getMyPatientProfile,
);

// ================================================================
// SINGLE PATIENT
// ================================================================

// GET /api/patients/:patient_id
router.get(
  "/:patient_id",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  patientController.getPatient,
);

// ================================================================
// REGISTER NEW PATIENT
// nurse or barangay_admin registers a new TB patient
// ================================================================

// POST /api/patients
router.post(
  "/",
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  validate(registerPatientSchema),
  patientController.registerPatient,
);

// ================================================================
// UPDATE PATIENT INFO
// ================================================================

// PATCH /api/patients/:patient_id
// Updates personal & treatment info (not outcome)
router.patch(
  "/:patient_id",
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.SUPER_ADMIN]),
  validate(updatePatientSchema),
  patientController.updatePatient,
);

// ================================================================
// TREATMENT OUTCOME
// Only barangay_admin or super_admin can classify final outcome
// ================================================================

// PATCH /api/patients/:patient_id/outcome
router.patch(
  "/:patient_id/outcome",
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN]),
  validate(updateTreatmentOutcomeSchema),
  patientController.updateTreatmentOutcome,
);

// ================================================================
// SPUTUM TEST SCHEDULE
// ================================================================

// PATCH /api/patients/:patient_id/sputum-schedule
// Nurse/admin updates status of a specific sputum test slot
router.patch(
  "/:patient_id/sputum-schedule",
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.NURSE]),
  validate(updateSputumScheduleSchema),
  patientController.updateSputumSchedule,
);

// ================================================================
// DEACTIVATE / REACTIVATE
// ================================================================

// PATCH /api/patients/:patient_id/deactivate
router.patch(
  "/:patient_id/deactivate",
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN]),
  patientController.deactivatePatient,
);

// PATCH /api/patients/:patient_id/reactivate
router.patch(
  "/:patient_id/reactivate",
  roleMiddleware([ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN]),
  patientController.reactivatePatient,
);

// ================================================================
// EXPORT
// ================================================================

// GET /api/patients/export/pdf
// super_admin → all barangays | barangay_admin → their barangay only
router.get(
  "/export/pdf",
  roleMiddleware([ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN]),
  patientController.exportPatientsPdf,
);

module.exports = router;
