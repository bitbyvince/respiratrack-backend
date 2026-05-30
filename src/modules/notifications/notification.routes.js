import { Router } from "express";
import controller from "./notification.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { authorizeRoles } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  sendNotificationSchema,
  sendBroadcastSchema,
  getNotificationsSchema,
  markReadSchema,
  registerTokenSchema,
} from "./notification.validator.js";
import { ROLES } from "../../constants/roles.js";

const router = Router();

const ALL_ROLES = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATIENT];
const ADMIN_AND_ABOVE = [ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN];

router.post(
  "/token",
  authenticate,
  authorizeRoles(...ALL_ROLES),
  validate(registerTokenSchema),
  controller.registerToken
);

router.delete(
  "/token",
  authenticate,
  authorizeRoles(...ALL_ROLES),
  controller.removeToken
);

router.post(
  "/send",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE),
  validate(sendNotificationSchema),
  controller.sendNotification
);

router.post(
  "/broadcast",
  authenticate,
  authorizeRoles(...ADMIN_AND_ABOVE),
  validate(sendBroadcastSchema),
  controller.broadcastNotification
);

router.post(
  "/nurse-log",
  authenticate,
  authorizeRoles(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE),
  controller.logNurseNotification
);

router.get(
  "/",
  authenticate,
  authorizeRoles(...ALL_ROLES),
  validate(getNotificationsSchema, "query"),
  controller.listNotifications
);

router.get(
  "/unread-count",
  authenticate,
  authorizeRoles(...ALL_ROLES),
  controller.getUnreadCount
);

router.patch(
  "/mark-read",
  authenticate,
  authorizeRoles(...ALL_ROLES),
  validate(markReadSchema),
  controller.markRead
);

router.patch(
  "/mark-all-read",
  authenticate,
  authorizeRoles(...ALL_ROLES),
  controller.markAllRead
);

router.delete(
  "/:id",
  authenticate,
  authorizeRoles(...ALL_ROLES),
  controller.deleteNotification
);

export default router;