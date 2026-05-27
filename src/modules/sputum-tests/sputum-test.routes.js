const express = require("express");
const router = express.Router();

const controller = require("./sputum-test.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  createSputumTestSchema,
  enterResultSchema,
  updateSputumTestSchema,
  listSputumTestsSchema,
  getUpcomingSchema,
} = require("./sputum-test.validator");
const { ROLES } = require("../../constants/roles");

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];
const ALL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.BARANGAY_ADMIN,
  ROLES.NURSE,
  ROLES.PATIENT,
];
const STAFF_WRITE = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /sputum-tests
 * Schedule a new sputum test for a patient.
 */
router.post(
  "/",
  authenticate,
  authorizeRoles(STAFF_WRITE),
  validate(createSputumTestSchema),
  controller.createSputumTest
);

/**
 * GET /sputum-tests
 * Paginated list — filterable by patient, barangay, result, month,
 * overdue status, and date range.
 */
router.get(
  "/",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(listSputumTestsSchema, "query"),
  controller.listSputumTests
);

/**
 * GET /sputum-tests/upcoming
 * Tests due in the next N days — nurse dashboard panel.
 */
router.get(
  "/upcoming",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getUpcomingSchema, "query"),
  controller.getUpcomingTests
);

/**
 * GET /sputum-tests/overdue
 * All Pending tests past their due date.
 */
router.get(
  "/overdue",
  authenticate,
  authorizeRoles(ALL_STAFF),
  controller.getOverdueTests
);

/**
 * GET /sputum-tests/patient/:patientId/summary
 * Full sputum tracker summary for a patient.
 * Patients can only access their own summary.
 */
router.get(
  "/patient/:patientId/summary",
  authenticate,
  authorizeRoles(ALL_ROLES),
  controller.getPatientSputumSummary
);

/**
 * GET /sputum-tests/:testId
 * Single sputum test record.
 * Patients can only access their own tests.
 */
router.get(
  "/:testId",
  authenticate,
  authorizeRoles(ALL_ROLES),
  controller.getSputumTest
);

/**
 * PATCH /sputum-tests/:testId/result
 * Enter or update the lab result.
 * Resolves the Sputum Test Due alert and syncs the patient schedule.
 */
router.patch(
  "/:testId/result",
  authenticate,
  authorizeRoles(STAFF_WRITE),
  validate(enterResultSchema),
  controller.enterResult
);

/**
 * PATCH /sputum-tests/:testId
 * Update non-result fields — due_date, date_collected, notes.
 */
router.patch(
  "/:testId",
  authenticate,
  authorizeRoles(STAFF_WRITE),
  validate(updateSputumTestSchema),
  controller.updateSputumTest
);

module.exports = router;