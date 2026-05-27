const express = require("express");
const router = express.Router();

const controller = require("./report.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  getPatientReportSchema,
  getBarangayReportSchema,
  getCityReportSchema,
  getComplianceTrendSchema,
  getInventoryReportSchema,
  getTreatmentOutcomeSchema,
} = require("./report.validator");
const { ROLES } = require("../../constants/roles");

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];
const ADMIN_AND_ABOVE = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN];
const SUPER_ADMIN_ONLY = [ROLES.SUPER_ADMIN];

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /reports/patient
 * Individual patient report — all linked records in one payload.
 * Supports JSON and PDF export.
 */
router.get(
  "/patient",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getPatientReportSchema, "query"),
  controller.getPatientReport
);

/**
 * GET /reports/barangay
 * Barangay aggregate report — patient breakdown, trends, outcomes, stock.
 * Supports JSON and PDF export.
 */
router.get(
  "/barangay",
  authenticate,
  authorizeRoles(ADMIN_AND_ABOVE),
  validate(getBarangayReportSchema, "query"),
  controller.getBarangayReport
);

/**
 * GET /reports/city
 * City-wide aggregate report across all barangays.
 * For NTP quarterly/annual submission — super admin only.
 * Supports JSON and PDF export.
 */
router.get(
  "/city",
  authenticate,
  authorizeRoles(SUPER_ADMIN_ONLY),
  validate(getCityReportSchema, "query"),
  controller.getCityReport
);

/**
 * GET /reports/compliance-trend
 * Time-series compliance snapshots for dashboard trend charts.
 */
router.get(
  "/compliance-trend",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getComplianceTrendSchema, "query"),
  controller.getComplianceTrend
);

/**
 * GET /reports/inventory
 * Current stock levels report — per barangay or city-wide.
 * Supports JSON and PDF export.
 */
router.get(
  "/inventory",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getInventoryReportSchema, "query"),
  controller.getInventoryReport
);

/**
 * GET /reports/treatment-outcomes
 * Treatment outcome breakdown in NTP reporting format.
 * Supports JSON and PDF export.
 */
router.get(
  "/treatment-outcomes",
  authenticate,
  authorizeRoles(ADMIN_AND_ABOVE),
  validate(getTreatmentOutcomeSchema, "query"),
  controller.getTreatmentOutcomes
);

module.exports = router;