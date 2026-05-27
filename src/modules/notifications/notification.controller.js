const notificationService = require("./notification.service");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

/**
 * POST /notifications/token
 * Registers or refreshes the FCM token for the authenticated user.
 * Called by the mobile app on login and on Firebase token refresh.
 *
 * Body: { fcm_token }
 * Role: all authenticated users
 */
async function registerToken(req, res) {
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

/**
 * DELETE /notifications/token
 * Removes the FCM token on logout to stop push notifications.
 *
 * Role: all authenticated users
 */
async function removeToken(req, res) {
  try {
    await notificationService.removeFcmToken(req.user.user_id);
    return sendSuccess(res, 200, "FCM token removed");
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * POST /notifications/send
 * Sends a push notification to a specific list of user_ids.
 * Used for targeted alerts (e.g. escalation to specific nurse).
 *
 * Body: { user_ids, title, body, type?, data? }
 * Role: super_admin, barangay_admin
 */
async function sendNotification(req, res) {
  try {
    const { user_ids, title, body, type, data } = req.body;

    const result = await notificationService.sendToUsers(user_ids, {
      title,
      body,
      type,
      data,
    });

    return sendSuccess(res, 200, "Notifications sent", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * POST /notifications/broadcast
 * Broadcasts a notification to all users matching given roles,
 * optionally scoped to a single barangay.
 *
 * Body: { roles, barangay_id?, title, body, type?, data? }
 * Role: super_admin, barangay_admin
 */
async function broadcastNotification(req, res) {
  try {
    const { roles, barangay_id, title, body, type, data } = req.body;

    // Barangay admins may only broadcast within their own barangay
    const { role, barangay_id: userBarangay } = req.user;
    const scopedBarangayId =
      role === "super_admin" ? barangay_id : userBarangay;

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

/**
 * GET /notifications
 * Lists notification logs for the authenticated user.
 * Super admin can query any user via ?user_id= param.
 *
 * Query: type?, is_read?, page?, limit?
 * Role:  all authenticated users
 */
async function listNotifications(req, res) {
  try {
    const { role, user_id: authUserId } = req.user;

    // Super admin can view any user's notifications;
    // all others are scoped to their own
    const userId =
      role === "super_admin" && req.query.user_id
        ? req.query.user_id
        : authUserId;

    const result = await notificationService.listNotifications({
      user_id: userId,
      type: req.query.type,
      is_read:
        req.query.is_read !== undefined
          ? req.query.is_read === "true"
          : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });

    return sendSuccess(res, 200, "Notifications fetched", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /notifications/unread-count
 * Returns the unread notification count for the authenticated user.
 * Powers the badge indicator on the mobile app.
 *
 * Role: all authenticated users
 */
async function getUnreadCount(req, res) {
  try {
    const result = await notificationService.getUnreadCount(req.user.user_id);
    return sendSuccess(res, 200, "Unread count fetched", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * PATCH /notifications/mark-read
 * Marks a specific list of notifications as read.
 *
 * Body: { notification_ids }
 * Role: all authenticated users (own notifications only)
 */
async function markRead(req, res) {
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

/**
 * PATCH /notifications/mark-all-read
 * Marks all unread notifications as read for the authenticated user.
 * Triggered when the user opens the full notifications screen.
 *
 * Role: all authenticated users
 */
async function markAllRead(req, res) {
  try {
    const result = await notificationService.markAllAsRead(req.user.user_id);
    return sendSuccess(res, 200, "All notifications marked as read", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

module.exports = {
  registerToken,
  removeToken,
  sendNotification,
  broadcastNotification,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};