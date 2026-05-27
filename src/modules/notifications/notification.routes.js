const express = require("express");
const router = express.Router();

const controller = require("./notification.controller");
const { authenticate } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");
const { validate } = require("../../middleware/validate.middleware");
const {
  sendNotificationSchema,
  sendBroadcastSchema,
  getNotificationsSchema,
  markReadSchema,
  registerTokenSchema,
} = require("./notification.validator");
const { ROLES } = require("../../constants/roles");

const ALL_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.BARANGAY_ADMIN,
  ROLES.NURSE,
  ROLES.PATIENT,
];
const ADMIN_AND_ABOVE = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN];

// ─── FCM Token Registration ───────────────────────────────────────────────────

/**
 * POST /notifications/token
 * Mobile app registers/refreshes its FCM token after login.
 */
router.post(
  "/token",
  authenticate,
  authorizeRoles(ALL_ROLES),
  validate(registerTokenSchema),
  controller.registerToken
);

/**
 * DELETE /notifications/token
 * Mobile app removes FCM token on logout.
 */
router.delete(
  "/token",
  authenticate,
  authorizeRoles(ALL_ROLES),
  controller.removeToken
);

// ─── Sending ──────────────────────────────────────────────────────────────────

/**
 * POST /notifications/send
 * Targeted push to specific user_ids.
 */
router.post(
  "/send",
  authenticate,
  authorizeRoles(ADMIN_AND_ABOVE),
  validate(sendNotificationSchema),
  controller.sendNotification
);

/**
 * POST /notifications/broadcast
 * Role-scoped broadcast — all users matching given roles.
 */
router.post(
  "/broadcast",
  authenticate,
  authorizeRoles(ADMIN_AND_ABOVE),
  validate(sendBroadcastSchema),
  controller.broadcastNotification
);

// ─── Reading & Status ─────────────────────────────────────────────────────────

/**
 * GET /notifications
 * Paginated notification log for the authenticated user.
 */
router.get(
  "/",
  authenticate,
  authorizeRoles(ALL_ROLES),
  validate(getNotificationsSchema, "query"),
  controller.listNotifications
);

/**
 * GET /notifications/unread-count
 * Badge count for the mobile app notification icon.
 */
router.get(
  "/unread-count",
  authenticate,
  authorizeRoles(ALL_ROLES),
  controller.getUnreadCount
);

/**
 * PATCH /notifications/mark-read
 * Mark a specific subset of notifications as read.
 */
router.patch(
  "/mark-read",
  authenticate,
  authorizeRoles(ALL_ROLES),
  validate(markReadSchema),
  controller.markRead
);

/**
 * PATCH /notifications/mark-all-read
 * Mark all unread notifications as read in one call.
 */
router.patch(
  "/mark-all-read",
  authenticate,
  authorizeRoles(ALL_ROLES),
  controller.markAllRead
);

module.exports = router;