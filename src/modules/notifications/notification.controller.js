import * as notificationService from "./notification.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import Notification from "../../models/Notification.model.js";

export async function registerToken(req, res) {
  try {
    const result = await notificationService.registerFcmToken(
      req.user.user_id,
      req.body.fcm_token
    );
    return sendSuccess(res, 200, "FCM token registered", result);
  } catch (err) {
    const status = err.message === "User not found" ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

export async function removeToken(req, res) {
  try {
    await notificationService.removeFcmToken(req.user.user_id);
    return sendSuccess(res, 200, "FCM token removed");
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function sendNotification(req, res) {
  try {
    const { user_ids, title, body, type, data } = req.body;
    const result = await notificationService.sendToUsers(user_ids, { title, body, type, data });
    return sendSuccess(res, 200, "Notifications sent", result);
  } catch (err) {
    return sendError(res, 500, err.message);
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
    return sendSuccess(res, 200, "Broadcast sent", result);
  } catch (err) {
    return sendError(res, 500, err.message);
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
    return sendSuccess(res, 200, "Notifications fetched", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getUnreadCount(req, res) {
  try {
    const result = await notificationService.getUnreadCount(req.user.user_id);
    return sendSuccess(res, 200, "Unread count fetched", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function markRead(req, res) {
  try {
    const result = await notificationService.markAsRead(
      req.user.user_id,
      req.body.notification_ids
    );
    return sendSuccess(res, 200, "Notifications marked as read", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function markAllRead(req, res) {
  try {
    const result = await notificationService.markAllAsRead(req.user.user_id);
    return sendSuccess(res, 200, "All notifications marked as read", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function logNurseNotification(req, res) {
  try {
    const { title, body, type } = req.body;
    const notif = await Notification.create({
      notification_id: `NOTIF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      user_id: req.user.user_id,
      title,
      body,
      type: type ?? "GENERAL",
      is_read: false,
      fcm_success: false,
      sent_at: new Date(),
      created_at: new Date(),
    });
    return sendSuccess(res, 201, "Notification logged", notif);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function deleteNotification(req, res) {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    return sendSuccess(res, 200, "Notification deleted");
  } catch (err) {
    return sendError(res, 500, err.message);
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
  logNurseNotification,
  deleteNotification,
};