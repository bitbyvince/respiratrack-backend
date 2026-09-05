import admin from "../../config/firebase.js";
import User from "../../models/User.model.js";
import Notification from "../../models/Notification.model.js";
import logger from "../../utils/logger.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sendToToken(fcmToken, payload) {
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: sanitizeData(payload.data ?? {}),
      android: {
        priority: "high",
        notification: {
          sound: "default",
          click_action: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
    });

    return { success: true, token: fcmToken };
  } catch (err) {
    logger.warn(`FCM send failed for token ${fcmToken}: ${err.message}`);
    return { success: false, token: fcmToken, error: err.message };
  }
}

function sanitizeData(data) {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );
}

function generateNotificationId() {
  const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `NOTIF-${rand}`;
}

async function logNotification({ user_id, title, body, type, data, fcm_success, fcm_error }) {
  return Notification.create({
    notification_id: generateNotificationId(),
    user_id,
    title,
    body,
    type,
    data: data ?? {},
    is_read: false,
    fcm_success,
    fcm_error: fcm_error ?? null,
    sent_at: new Date(),
    created_at: new Date(),
  });
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function registerFcmToken(userId, fcmToken) {
  const user = await User.findOneAndUpdate(
    { user_id: userId },
    { $set: { fcm_token: fcmToken, updated_at: new Date() } },
    { new: true }
  );

  if (!user) throw new Error("User not found");
  return { user_id: userId, fcm_token: fcmToken };
}

export async function removeFcmToken(userId) {
  await User.updateOne(
    { user_id: userId },
    { $unset: { fcm_token: "" }, $set: { updated_at: new Date() } }
  );
}

export async function sendToUsers(userIds, { title, body, type = "GENERAL", data = {} }) {
  const users = await User.find({
    user_id: { $in: userIds },
    is_active: true,
  }).select("user_id fcm_token");

  const withToken = users.filter((u) => u.fcm_token);
  const withoutToken = users.filter((u) => !u.fcm_token);

  const sendResults = await Promise.allSettled(
    withToken.map((u) =>
      sendToToken(u.fcm_token, { title, body, data })
        .then((result) => ({ ...result, user_id: u.user_id }))
    )
  );

  await Promise.allSettled(
    sendResults.map((r) => {
      const val = r.value ?? {};
      return logNotification({
        user_id: val.user_id,
        title,
        body,
        type,
        data,
        fcm_success: val.success ?? false,
        fcm_error: val.error ?? null,
      });
    })
  );

  if (withoutToken.length > 0) {
    logger.info(
      `Notification skipped — no FCM token for users: ${withoutToken
        .map((u) => u.user_id)
        .join(", ")}`
    );
  }

  const sent = sendResults.filter(
    (r) => r.status === "fulfilled" && r.value?.success
  ).length;
  const failed = sendResults.filter(
    (r) => r.status === "fulfilled" && !r.value?.success
  ).length;

  return { sent, failed, skipped: withoutToken.length, total_targeted: userIds.length };
}

export async function broadcastToRoles(roles, barangayId, { title, body, type = "GENERAL", data = {} }) {
  const filter = { role: { $in: roles }, is_active: true };

  const scopedFilter = barangayId
    ? {
        $or: [
          { ...filter, barangay_id: barangayId },
          { role: "super_admin", is_active: true },
        ],
      }
    : filter;

  const users = await User.find(scopedFilter).select("user_id");
  const userIds = users.map((u) => u.user_id);

  if (userIds.length === 0) {
    return { sent: 0, failed: 0, skipped: 0, total_targeted: 0 };
  }

  return sendToUsers(userIds, { title, body, type, data });
}

export async function sendToPatient(patientUserId, { title, body, type, data = {} }) {
  return sendToUsers([patientUserId], { title, body, type, data });
}

export async function listNotifications({ user_id, type, is_read, page, limit }) {
  const filter = {};
  if (user_id) filter.user_id = user_id;
  if (type) filter.type = type;
  if (is_read !== undefined) filter.is_read = is_read;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Notification.find(filter).sort({ sent_at: -1 }).skip(skip).limit(limit),
    Notification.countDocuments(filter),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getUnreadCount(userId) {
  const count = await Notification.countDocuments({
    user_id: userId,
    is_read: false,
  });
  return { user_id: userId, unread_count: count };
}

export async function markAsRead(userId, notificationIds) {
  const result = await Notification.updateMany(
    {
      notification_id: { $in: notificationIds },
      user_id: userId,
      is_read: false,
    },
    { $set: { is_read: true, read_at: new Date() } }
  );

  return { matched: result.matchedCount, updated: result.modifiedCount };
}

export async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { user_id: userId, is_read: false },
    { $set: { is_read: true, read_at: new Date() } }
  );

  return { updated: result.modifiedCount };
}

export async function deleteNotification(notificationMongoId, userId) {
  const notification = await Notification.findById(notificationMongoId);
  if (!notification) throw new Error("Notification not found");
  if (notification.user_id !== userId) {
    const err = new Error("Access denied");
    err.statusCode = 403;
    throw err;
  }
  await Notification.findByIdAndDelete(notificationMongoId);
}