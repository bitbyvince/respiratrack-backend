import * as notificationService from "./notification.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export async function registerToken(req, res) {
  try {
    const result = await notificationService.registerFcmToken(
      req.user.user_id,
      req.body.fcm_token
    );
    return sendSuccess(res, "FCM token registered", result, 200);
  } catch (err) {
    const status = err.message === "User not found" ? 404 : 500;
    return sendError(res, err);
  }
}

export async function removeToken(req, res) {
  try {
    await notificationService.removeFcmToken(req.user.user_id);
    return sendSuccess(res, "FCM token removed", null, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function sendNotification(req, res) {
  try {
    const { user_ids, title, body, type, data } = req.body;
    const result = await notificationService.sendToUsers(user_ids, { title, body, type, data });
    return sendSuccess(res, "Notifications sent", result, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function broadcastNotification(req, res) {
  try {
    const { roles, barangay_id, title, body, type, data } = req.body;
    const { role, barangay_id: userBarangay } = req.user;
    const scopedBarangayId = role === "super_admin" ? barangay_id : userBarangay;

    const result = await notificationService.broadcastToRoles(
      roles,
      scopedBarangayId,
      { title, body, type, data }
    );

    return sendSuccess(res, "Broadcast sent", result, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function listNotifications(req, res) {
  try {
    const { role, user_id: authUserId } = req.user;
    const userId =
      role === "super_admin" && req.query.user_id ? req.query.user_id : authUserId;

    const result = await notificationService.listNotifications({
      user_id: userId,
      type: req.query.type,
      is_read:
        req.query.is_read !== undefined ? req.query.is_read === "true" : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });

    return sendSuccess(res, "Notifications fetched", result, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getUnreadCount(req, res) {
  try {
    const result = await notificationService.getUnreadCount(req.user.user_id);
    return sendSuccess(res, "Unread count fetched", result, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function markRead(req, res) {
  try {
    const result = await notificationService.markAsRead(
      req.user.user_id,
      req.body.notification_ids
    );
    return sendSuccess(res, "Notifications marked as read", result, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function markAllRead(req, res) {
  try {
    const result = await notificationService.markAllAsRead(req.user.user_id);
    return sendSuccess(res, "All notifications marked as read", result, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export default {
  registerToken,
  removeToken,
  sendNotification,
  broadcastNotification,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};