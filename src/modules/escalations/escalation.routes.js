const express = require("express");
const router = express.Router();

const controller = require("./escalation.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  triggerEscalationSchema,
  acknowledgeEscalationSchema,
  resolveEscalationSchema,
  listEscalationsSchema,
} = require("./escalation.validator");
const { ROLES } = require("../../constants/roles");

const ALL_STAFF = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE];
const ADMIN_ONLY = [ROLES.SUPER_ADMIN];

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /escalations/trigger
 * Internal or super_admin manual override.
 * Normally called by escalation.job.js — exposed for admin/debug use.
 */
router.post(
  "/trigger",
  authenticate,
  authorizeRoles(ADMIN_ONLY),
  validate(triggerEscalationSchema),
  controller.triggerEscalation
);

/**
 * GET /escalations
 * List escalation logs; scoped by role.
 */
router.get(
  "/",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(listEscalationsSchema, "query"),
  controller.listEscalations
);

/**
 * GET /escalations/:escalationId
 * Fetch single escalation log.
 */
router.get(
  "/:escalationId",
  authenticate,
  authorizeRoles(ALL_STAFF),
  controller.getEscalation
);

/**
 * PATCH /escalations/:escalationId/acknowledge
 * Mark escalation as acknowledged by the responding staff member.
 */
router.patch(
  "/:escalationId/acknowledge",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(acknowledgeEscalationSchema),
  controller.acknowledgeEscalation
);

/**
 * PATCH /escalations/:escalationId/resolve
 * Mark escalation as resolved — resets patient escalation block.
 */
router.patch(
  "/:escalationId/resolve",
  authenticate,
  authorizeRoles(ALL_STAFF),
  validate(resolveEscalationSchema),
  controller.resolveEscalation
);

module.exports = router;