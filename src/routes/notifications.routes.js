// ============================================================
// notifications.routes.js
// Handles:
//   - FCM token registration / removal
//   - Geofence location check (triggers alerts if in danger zone)
//   - Notification log retrieval
//   - Manual push notifications (admin/nurse use)
// ============================================================

import express from "express";
import mongoose from "mongoose";
import {
  registerFcmToken,
  removeFcmToken,
  getUserNotificationLogs,
  sendPushToUser,
} from "../services/firebase.service.js";
import { checkGeofence } from "../services/geofence.service.js";

const router = express.Router();

// ─── Inline Model (PublicUser location update) ────────────────────────────────

const PublicUser =
  mongoose.models.PublicUser ||
  mongoose.model(
    "PublicUser",
    new mongoose.Schema(
      {
        last_location: {
          type: { type: String, enum: ["Point"] },
          coordinates: [Number],
        },
        otp_verified: { type: Boolean },
      },
      { collection: "public_users" },
    ),
  );

// ─── FCM Token Routes ─────────────────────────────────────────────────────────

/**
 * POST /api/notifications/fcm-token
 * Register or update a device FCM token for push notifications.
 * Called by the mobile app on login or when the token refreshes.
 * Body: { mongo_user_id, device_id, fcm_token, device_type, app_type }
 */
router.post("/fcm-token", async (req, res) => {
  try {
    const { mongo_user_id, device_id, fcm_token, device_type, app_type } =
      req.body;

    if (
      !mongo_user_id ||
      !device_id ||
      !fcm_token ||
      !device_type ||
      !app_type
    ) {
      return res.status(400).json({
        success: false,
        message:
          "mongo_user_id, device_id, fcm_token, device_type, and app_type are required",
      });
    }

    const validDeviceTypes = ["android", "ios"];
    const validAppTypes = ["public_mobile", "nurse_mobile"];

    if (!validDeviceTypes.includes(device_type)) {
      return res.status(400).json({
        success: false,
        message: `device_type must be one of: ${validDeviceTypes.join(", ")}`,
      });
    }

    if (!validAppTypes.includes(app_type)) {
      return res.status(400).json({
        success: false,
        message: `app_type must be one of: ${validAppTypes.join(", ")}`,
      });
    }

    await registerFcmToken(
      mongo_user_id,
      device_id,
      fcm_token,
      device_type,
      app_type,
    );

    res.json({ success: true, message: "FCM token registered" });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * DELETE /api/notifications/fcm-token
 * Remove a device FCM token on logout or token invalidation.
 * Body: { mongo_user_id, device_id }
 */
router.delete("/fcm-token", async (req, res) => {
  try {
    const { mongo_user_id, device_id } = req.body;

    if (!mongo_user_id || !device_id) {
      return res.status(400).json({
        success: false,
        message: "mongo_user_id and device_id are required",
      });
    }

    await removeFcmToken(mongo_user_id, device_id);

    res.json({ success: true, message: "FCM token removed" });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// ─── Geofence Check ───────────────────────────────────────────────────────────

/**
 * POST /api/notifications/location
 * Called by the public mobile app whenever the user's GPS updates.
 * Checks if the user is inside a High/Critical heatmap zone.
 * Sends an FCM push alert if triggered (with 24h dedup protection).
 * Also updates the user's last_location in MongoDB for batch jobs.
 * Body: { mongo_user_id, lat, lng }
 */
router.post("/location", async (req, res) => {
  try {
    const { mongo_user_id, lat, lng } = req.body;

    if (!mongo_user_id || lat === undefined || lng === undefined) {
      return res.status(400).json({
        success: false,
        message: "mongo_user_id, lat, and lng are required",
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res
        .status(400)
        .json({ success: false, message: "lat and lng must be valid numbers" });
    }

    if (!mongoose.Types.ObjectId.isValid(mongo_user_id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid mongo_user_id" });
    }

    // Update user's last known location in MongoDB
    await PublicUser.findByIdAndUpdate(mongo_user_id, {
      last_location: {
        type: "Point",
        coordinates: [longitude, latitude], // GeoJSON is [lng, lat]
      },
    });

    // Run geofence check
    const result = await checkGeofence(mongo_user_id, latitude, longitude);

    res.json({
      success: true,
      triggered: result.triggered,
      alerts: result.alerts,
      message: result.triggered
        ? `${result.alerts.length} geofence alert(s) triggered`
        : "No high-risk zones detected nearby",
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// ─── Notification Logs ────────────────────────────────────────────────────────

/**
 * GET /api/notifications/logs/:mongoUserId
 * Get notification history for a specific user.
 * Query params: limit (default 50)
 */
router.get("/logs/:mongoUserId", async (req, res) => {
  try {
    const { mongoUserId } = req.params;
    const { limit = 50 } = req.query;

    const logs = await getUserNotificationLogs(mongoUserId, parseInt(limit));

    res.json({ success: true, count: logs.length, data: logs });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// ─── Manual Push (Admin / Nurse) ──────────────────────────────────────────────

/**
 * POST /api/notifications/send
 * Manually send a push notification to a user.
 * Used by nurses or admins to send custom alerts.
 * Body: { mongo_user_id, recipient_type, notification_type, title, body, data? }
 */
router.post("/send", async (req, res) => {
  try {
    const {
      mongo_user_id,
      recipient_type,
      notification_type,
      title,
      body,
      data = {},
    } = req.body;

    if (
      !mongo_user_id ||
      !recipient_type ||
      !notification_type ||
      !title ||
      !body
    ) {
      return res.status(400).json({
        success: false,
        message:
          "mongo_user_id, recipient_type, notification_type, title, and body are required",
      });
    }

    const validRecipientTypes = ["public_user", "nurse"];
    const validNotificationTypes = [
      "geofence_alert",
      "missed_dose",
      "otp",
      "system",
    ];

    if (!validRecipientTypes.includes(recipient_type)) {
      return res.status(400).json({
        success: false,
        message: `recipient_type must be one of: ${validRecipientTypes.join(", ")}`,
      });
    }

    if (!validNotificationTypes.includes(notification_type)) {
      return res.status(400).json({
        success: false,
        message: `notification_type must be one of: ${validNotificationTypes.join(", ")}`,
      });
    }

    const result = await sendPushToUser(
      mongo_user_id,
      recipient_type,
      notification_type,
      title,
      body,
      data,
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "Push notification failed",
      });
    }

    res.json({
      success: true,
      message: `Notification sent to ${result.sent} device(s)`,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

export default router;
