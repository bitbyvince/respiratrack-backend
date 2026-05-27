const admin = require("../../config/firebase");
const User = require("../../models/User.model");
const Notification = require("../../models/Notification.model");
const logger = require("../../utils/logger");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sends a single FCM push notification to one FCM token.
 * Returns a result object — never throws — so callers can use
 * Promise.allSettled without wrapping each call individually.
 *
 * @param {string} fcmToken
 * @param {object} payload  - { title, body, data }
 * @returns {{ success: boolean, token: string, error?: string }}
 */
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

/**
 * FCM data payloads must be string:string — coerce all values.
 */
function sanitizeData(data) {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );
}

/**
 * Generates a unique notification_id in the format NOTIF-XXXXXXXX.
 */
function generateNotificationId() {
  const rand = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `NOTIF-${rand}`;
}

/**
 * Persists a notification log record to MongoDB.
 * Called after every send attempt regardless of FCM success/failure.
 */
async function logNotification({
  user_id,
  title,
  body,
  type,
  data,
  fcm_success,
  fcm_error,
}) {
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

/**
 * Registers or updates an FCM token for the authenticated user.
 * Called by the mobile app on login or token refresh.
 *
 * @param {string} userId
 * @param {string} fcmToken
 */
async function registerFcmToken(userId, fcmToken) {
  const user = await User.findOneAndUpdate(
    { user_id: userId },
    { $set: { fcm_token: fcmToken, updated_at: new Date() } },
    { new: true }
  );

  if (!user) throw new Error("User not found");
  return { user_id: userId, fcm_token: fcmToken };
}

/**
 * Removes the FCM token for a user on logout.
 * Prevents push notifications from reaching signed-out devices.
 *
 * @param {string} userId
 */
async function removeFcmToken(userId) {
  await User.updateOne(
    { user_id: userId },
    { $unset: { fcm_token: "" }, $set: { updated_at: new Date() } }
  );
}

/**
 * Sends push notifications to a specific list of user_ids.
 * Looks up FCM tokens, fires sends in parallel, logs each result.
 *
 * @param {string[]} userIds
 * @param {string}   title
 * @param {string}   body
 * @param {string}   type
 * @param {object}   data     - arbitrary key/value pairs for the app
 * @returns {{ sent: number, failed: number, skipped: number }}
 */
async function sendToUsers(userIds, { title, body, type = "GENERAL", data = {} }) {
  const users = await User.find({
    user_id: { $in: userIds },
    is_active: true,
  }).select("user_id fcm_token");

  const withToken = users.filter((u) => u.fcm_token);
  const withoutToken = users.filter((u) => !u.fcm_token);

  // Fire all FCM sends in parallel
  const sendResults = await Promise.allSettled(
    withToken.map((u) =>
      sendToToken(u.fcm_token, { title, body, data })
        .then((result) => ({ ...result, user_id: u.user_id }))
    )
  );

  // Log every attempt to MongoDB (regardless of FCM outcome)
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

  // Log skipped users (no token registered)
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

  return {
    sent,
    failed,
    skipped: withoutToken.length,
    total_targeted: userIds.length,
  };
}

/**
 * Broadcast a notification to all users matching a set of roles,
 * optionally scoped to a single barangay.
 *
 * @param {string[]} roles
 * @param {string}   barangayId  - optional scope
 * @param {string}   title
 * @param {string}   body
 * @param {string}   type
 * @param {object}   data
 */
async function broadcastToRoles(
  roles,
  barangayId,
  { title, body, type = "GENERAL", data = {} }
) {
  const filter = { role: { $in: roles }, is_active: true };

  // Super admins are always included regardless of barangay scope
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

/**
 * Sends a push notification to a single patient by patient_id.
 * Convenience wrapper used by medication and sputum reminder jobs.
 *
 * @param {string} patientUserId   - the user_id linked to the patient record
 * @param {string} title
 * @param {string} body
 * @param {string} type
 * @param {object} data
 */
async function sendToPatient(patientUserId, { title, body, type, data = {} }) {
  return sendToUsers([patientUserId], { title, body, type, data });
}

/**
 * List notification logs for a user with optional filters.
 *
 * @param {string}  userId
 * @param {string}  type
 * @param {boolean} isRead
 * @param {number}  page
 * @param {number}  limit
 */
async function listNotifications({ user_id, type, is_read, page, limit }) {
  const filter = {};
  if (user_id) filter.user_id = user_id;
  if (type) filter.type = type;
  if (is_read !== undefined) filter.is_read = is_read;

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Notification.find(filter)
      .sort({ sent_at: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

/**
 * Returns the count of unread notifications for a user.
 * Used to power the notification badge on the mobile app.
 *
 * @param {string} userId
 */
async function getUnreadCount(userId) {
  const count = await Notification.countDocuments({
    user_id: userId,
    is_read: false,
  });
  return { user_id: userId, unread_count: count };
}

/**
 * Marks a list of notification_ids as read for the requesting user.
 * Scoped to the user's own notifications — prevents marking others' logs.
 *
 * @param {string}   userId
 * @param {string[]} notificationIds
 */
async function markAsRead(userId, notificationIds) {
  const result = await Notification.updateMany(
    {
      notification_id: { $in: notificationIds },
      user_id: userId,
      is_read: false,
    },
    {
      $set: { is_read: true, read_at: new Date() },
    }
  );

  return {
    matched: result.matchedCount,
    updated: result.modifiedCount,
  };
}

/**
 * Marks ALL unread notifications as read for a user.
 * Triggered when the user opens the notifications screen.
 *
 * @param {string} userId
 */
async function markAllAsRead(userId) {
  const result = await Notification.updateMany(
    { user_id: userId, is_read: false },
    { $set: { is_read: true, read_at: new Date() } }
  );

  return { updated: result.modifiedCount };
}

module.exports = {
  registerFcmToken,
  removeFcmToken,
  sendToUsers,
  sendToPatient,
  broadcastToRoles,
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};