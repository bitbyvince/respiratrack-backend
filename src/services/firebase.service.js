// ============================================================
// firebase.service.js
// Handles all Firestore operations:
//   - OTP sessions
//   - FCM tokens
//   - Geofence alerts
//   - Notification logs
//   - Dedup tracker
// ============================================================

import { db, messaging } from "../config/firebase.js";
import admin from "../config/firebase.js";

// ─── OTP Sessions ─────────────────────────────────────────────────────────────

/**
 * Create or overwrite an OTP session for a user.
 * Document ID = contact_number (E.164 format e.g. +639171234567)
 * Auto-expires after 5 minutes (enforced by Cloud Function TTL or manual check)
 */

/**
 * Get an active OTP session by contact number.
 * Returns null if not found or already expired.
 */
export const getOtpSession = async (contactNumber) => {
  const doc = await db.collection("otp_sessions").doc(contactNumber).get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (data._is_schema) return null;

  // Check expiry
  const now = new Date();
  const expiresAt = data.expires_at?.toDate();
  if (expiresAt && now > expiresAt) {
    await deleteOtpSession(contactNumber);
    return null;
  }

  return data;
};

/**
 * Increment failed OTP attempt count.
 * Returns the updated attempt count.
 */
export const incrementOtpAttempts = async (contactNumber) => {
  const ref = db.collection("otp_sessions").doc(contactNumber);
  await ref.update({
    attempts: admin.firestore.FieldValue.increment(1),
  });
  const updated = await ref.get();
  return updated.data()?.attempts || 0;
};

/**
 * Mark OTP session as verified.
 */
export const markOtpVerified = async (contactNumber) => {
  await db.collection("otp_sessions").doc(contactNumber).update({
    verified: true,
  });
};

/**
 * Delete an OTP session after use or expiry.
 */
export const deleteOtpSession = async (contactNumber) => {
  await db.collection("otp_sessions").doc(contactNumber).delete();
};

// ─── FCM Tokens ───────────────────────────────────────────────────────────────

/**
 * Register or update a device FCM token for a user.
 * Stored at: fcm_tokens/{mongoUserId}/devices/{deviceId}
 */
export const registerFcmToken = async (
  mongoUserId,
  deviceId,
  fcmToken,
  deviceType,
  appType,
) => {
  await db
    .collection("fcm_tokens")
    .doc(mongoUserId)
    .collection("devices")
    .doc(deviceId)
    .set({
      mongo_user_id: mongoUserId,
      fcm_token: fcmToken,
      device_type: deviceType, // "android" | "ios"
      app_type: appType, // "public_mobile" | "nurse_mobile"
      last_updated: admin.firestore.FieldValue.serverTimestamp(),
    });
};

/**
 * Get all FCM tokens for a user (all devices).
 * Returns array of token strings.
 */
export const getUserFcmTokens = async (mongoUserId) => {
  const snapshot = await db
    .collection("fcm_tokens")
    .doc(mongoUserId)
    .collection("devices")
    .get();

  return snapshot.docs
    .filter((doc) => !doc.data()._is_schema)
    .map((doc) => doc.data().fcm_token)
    .filter(Boolean);
};

/**
 * Remove a specific device FCM token (on logout or token refresh).
 */
export const removeFcmToken = async (mongoUserId, deviceId) => {
  await db
    .collection("fcm_tokens")
    .doc(mongoUserId)
    .collection("devices")
    .doc(deviceId)
    .delete();
};

// ─── Geofence Alerts ──────────────────────────────────────────────────────────

/**
 * Create a geofence alert when a user enters a high-risk zone.
 * Returns the Firestore document ID.
 */
export const createGeofenceAlert = async ({
  mongoUserId,
  mongoZoneId,
  zoneRiskLevel,
  alertMessage,
  userLat,
  userLng,
  zoneCenterLat,
  zoneCenterLng,
  radiusMeters = 500,
}) => {
  const ref = await db.collection("geofence_alerts").add({
    mongo_user_id: mongoUserId,
    mongo_zone_id: mongoZoneId,
    zone_risk_level: zoneRiskLevel,
    alert_message: alertMessage,
    user_lat: userLat,
    user_lng: userLng,
    zone_center_lat: zoneCenterLat,
    zone_center_lng: zoneCenterLng,
    radius_meters: radiusMeters,
    is_sent: false,
    triggered_at: admin.firestore.FieldValue.serverTimestamp(),
    sent_at: null,
  });

  return ref.id;
};

/**
 * Mark a geofence alert as sent after FCM delivery.
 */
export const markGeofenceAlertSent = async (alertDocId) => {
  await db.collection("geofence_alerts").doc(alertDocId).update({
    is_sent: true,
    sent_at: admin.firestore.FieldValue.serverTimestamp(),
  });
};

/**
 * Get unsent geofence alerts (for retry jobs).
 */
export const getUnsentGeofenceAlerts = async () => {
  const snapshot = await db
    .collection("geofence_alerts")
    .where("is_sent", "==", false)
    .where("_is_schema", "==", false)
    .orderBy("triggered_at", "asc")
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

// ─── Notification Logs ────────────────────────────────────────────────────────

/**
 * Append a notification log entry after every send attempt.
 */
export const logNotification = async ({
  mongoUserId,
  recipientType,
  channel,
  notificationType,
  title,
  body,
  fcmToken = "",
  geofenceAlertId = "",
  mongoPatientId = "",
  mongoAlertId = "",
  status,
  errorMessage = null,
}) => {
  await db.collection("notification_logs").add({
    mongo_user_id: mongoUserId,
    recipient_type: recipientType, // "public_user" | "nurse"
    channel, // "fcm_push" | "sms"
    notification_type: notificationType, // "geofence_alert" | "missed_dose" | "otp" | "system"
    title,
    body,
    fcm_token: fcmToken,
    geofence_alert_id: geofenceAlertId,
    mongo_patient_id: mongoPatientId,
    mongo_alert_id: mongoAlertId,
    status, // "sent" | "failed" | "pending"
    error_message: errorMessage,
    sent_at: admin.firestore.FieldValue.serverTimestamp(),
  });
};

export const sendMissedDoseAlert = async (nurseFcmToken, patientName) => {
  return sendPushNotification(
    nurseFcmToken,
    "⚠️ Missed Dose Alert",
    `${patientName} has not confirmed their medication today. Please follow up.`,
    { type: "missed_dose_alert", patientName },
  );
};

export const sendMedicationReminder = async (
  fcmToken,
  patientName,
  timeSlot,
) => {
  return sendPushNotification(
    fcmToken,
    "💊 Medication Reminder",
    `Hi ${patientName}, it's time to take your TB medication (${timeSlot}). Stay consistent!`,
    { type: "medication_reminder", timeSlot },
  );
};

export const sendMulticastNotification = async (
  fcmTokens,
  title,
  body,
  data = {},
) => {
  if (!fcmTokens || fcmTokens.length === 0)
    return { success: false, error: "No tokens provided" };
  try {
    const message = {
      tokens: fcmTokens,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: "high",
        notification: { sound: "default", channelId: "respiratrack_alerts" },
      },
    };
    const response = await messaging.sendEachForMulticast(message);
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err) {
    console.error("Multicast notification error:", err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Get notification logs for a specific user.
 */
export const getUserNotificationLogs = async (mongoUserId, limitCount = 50) => {
  const snapshot = await db
    .collection("notification_logs")
    .where("mongo_user_id", "==", mongoUserId)
    .orderBy("sent_at", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs
    .filter((doc) => !doc.data()._is_schema)
    .map((doc) => ({ id: doc.id, ...doc.data() }));
};

// ─── Dedup Tracker ────────────────────────────────────────────────────────────

/**
 * Check if a geofence alert was already sent to a user for the same zone
 * within the last 24 hours. Returns true if duplicate (should skip).
 */
export const isDuplicateGeofenceAlert = async (mongoUserId, mongoZoneId) => {
  const docId = `${mongoUserId}_${mongoZoneId}`;
  const doc = await db.collection("dedup_tracker").doc(docId).get();

  if (!doc.exists || doc.data()._is_schema) return false;

  const data = doc.data();
  const expiresAt = data.expires_at?.toDate();
  if (!expiresAt || new Date() > expiresAt) {
    // Entry expired — delete it and allow re-alert
    await db.collection("dedup_tracker").doc(docId).delete();
    return false;
  }

  return true; // still within 24hr window — skip
};

/**
 * Record that a geofence alert was sent to prevent duplicates for 24 hours.
 */
export const recordGeofenceAlertSent = async (mongoUserId, mongoZoneId) => {
  const docId = `${mongoUserId}_${mongoZoneId}`;
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 24 * 60 * 60 * 1000), // +24 hours
  );

  await db.collection("dedup_tracker").doc(docId).set({
    mongo_user_id: mongoUserId,
    mongo_zone_id: mongoZoneId,
    last_alerted: admin.firestore.FieldValue.serverTimestamp(),
    expires_at: expiresAt,
  });
};

export const sendLowStockAlert = async (
  adminFcmToken,
  medicineName,
  remainingStock,
) => {
  return sendPushNotification(
    adminFcmToken,
    "🏥 Low Medicine Stock",
    `${medicineName} is running low — only ${remainingStock} units remaining. Please reorder.`,
    {
      type: "low_stock_alert",
      medicineName,
      remainingStock: String(remainingStock),
    },
  );
};

// ─── FCM Push Sender ──────────────────────────────────────────────────────────

/**
 * Send a push notification to a single FCM token.
 * Logs the result to Firestore notification_logs.
 */
export const sendPushNotification = async ({
  mongoUserId,
  recipientType,
  notificationType,
  fcmToken,
  title,
  body,
  data = {},
  geofenceAlertId = "",
  mongoPatientId = "",
  mongoAlertId = "",
}) => {
  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data,
      android: {
        priority: "high",
        notification: { sound: "default" },
      },
    });

    await logNotification({
      mongoUserId,
      recipientType,
      channel: "fcm_push",
      notificationType,
      title,
      body,
      fcmToken,
      geofenceAlertId,
      mongoPatientId,
      mongoAlertId,
      status: "sent",
    });

    return { success: true };
  } catch (err) {
    await logNotification({
      mongoUserId,
      recipientType,
      channel: "fcm_push",
      notificationType,
      title,
      body,
      fcmToken,
      geofenceAlertId,
      mongoPatientId,
      mongoAlertId,
      status: "failed",
      errorMessage: err.message,
    });

    return { success: false, error: err.message };
  }
};

export const saveFcmToken = async (userId, role, fcmToken) => {
  try {
    await db.collection("fcm_tokens").doc(userId).set(
      {
        userId,
        role,
        fcmToken,
        updatedAt: new Date(),
      },
      { merge: true },
    );
    return { success: true };
  } catch (err) {
    console.error("Save FCM token error:", err.message);
    return { success: false, error: err.message };
  }
};

export const getFcmToken = async (userId) => {
  try {
    const doc = await db.collection("fcm_tokens").doc(userId).get();
    if (!doc.exists) return null;
    return doc.data().fcmToken;
  } catch (err) {
    console.error("Get FCM token error:", err.message);
    return null;
  }
};

export const getFcmTokensByRole = async (role, barangayId = null) => {
  try {
    let query = db.collection("fcm_tokens").where("role", "==", role);
    if (barangayId) query = query.where("barangayId", "==", barangayId);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data().fcmToken).filter(Boolean);
  } catch (err) {
    console.error("Get FCM tokens by role error:", err.message);
    return [];
  }
};

export const createOtpSession = async (phone, sessionId) => {
  try {
    await db
      .collection("otp_sessions")
      .doc(sessionId)
      .set({
        phone,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        verified: false,
      });
    return { success: true };
  } catch (err) {
    console.error("OTP session create error:", err.message);
    return { success: false, error: err.message };
  }
};

export const verifyOtpSession = async (sessionId) => {
  try {
    const doc = await db.collection("otp_sessions").doc(sessionId).get();
    if (!doc.exists) return { success: false, error: "Session not found" };

    const session = doc.data();
    if (session.expiresAt.toDate() < new Date()) {
      await db.collection("otp_sessions").doc(sessionId).delete();
      return { success: false, error: "OTP session expired" };
    }

    await db.collection("otp_sessions").doc(sessionId).delete();
    return { success: true, phone: session.phone };
  } catch (err) {
    console.error("OTP verify error:", err.message);
    return { success: false, error: err.message };
  }
};

export const verifyFirebaseToken = async (idToken) => {
  try {
    const decoded = await auth.verifyIdToken(idToken);
    return { success: true, uid: decoded.uid, phone: decoded.phone_number };
  } catch (err) {
    console.error("Firebase token verify error:", err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Send a push notification to ALL devices of a user.
 */
export const sendPushToUser = async (
  mongoUserId,
  recipientType,
  notificationType,
  title,
  body,
  data = {},
) => {
  const tokens = await getUserFcmTokens(mongoUserId);
  if (!tokens.length)
    return { success: false, error: "No FCM tokens found for user" };

  const results = await Promise.all(
    tokens.map((fcmToken) =>
      sendPushNotification({
        mongoUserId,
        recipientType,
        notificationType,
        fcmToken,
        title,
        body,
        data,
      }),
    ),
  );

  return {
    success: results.some((r) => r.success),
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
  };
};
