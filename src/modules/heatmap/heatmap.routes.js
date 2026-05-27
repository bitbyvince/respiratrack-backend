const express = require("express");
const router = express.Router();

const controller = require("./heatmap.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  getHeatmapSchema,
  buildSnapshotSchema,
  getBarangayDetailSchema,
  getHeatmapHistorySchema,
} = require("./heatmap.validator");
const { ROLES } = require("../../constants/roles");

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];
const ADMIN_ONLY = [ROLES.SUPER_ADMIN];

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /heatmap
 * Full map overlay — all barangay snapshots for the latest period.
 * Super admin sees all; nurse/barangay_admin scoped to their barangay.
 */
router.get(
  "/",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getHeatmapSchema, "query"),
  controller.getHeatmap
);

/**
 * POST /heatmap/build
 * Admin-triggered manual snapshot rebuild.
 * Normally fired automatically by heatmapSnapshot.job.js.
 */
router.post(
  "/build",
  authenticate,
  authorizeRoles(ADMIN_ONLY),
  validate(buildSnapshotSchema),
  controller.buildSnapshots
);

/**
 * GET /heatmap/barangays/:barangayId
 * Single-zone detail panel — snapshot + patient list + active alerts.
 * Corresponds to the clickable zone → sidebar flow (Add 5).
 */
router.get(
  "/barangays/:barangayId",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getBarangayDetailSchema, "query"),
  controller.getBarangayDetail
);

/**
 * GET /heatmap/barangays/:barangayId/history
 * Time-series snapshots for a single barangay — powers trend chart.
 */
router.get(
  "/barangays/:barangayId/history",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(getHeatmapHistorySchema, "query"),
  controller.getHeatmapHistory
);

module.exports = router;