// ============================================================
// utils/notifyPatient.js
//
// Single entry point for anything that wants to notify a patient.
// Writes to the Firestore inbox (notification_inbox/{user_id}/messages)
// — the source of truth the mobile app's Notifications screen and
// unread badge actually read from — and best-effort sends an FCM
// push for an OS-level banner when the app isn't in the foreground.
//
// Existing jobs that called admin.messaging() directly (sputum
// reminders) only fired an OS push with nothing to show if the
// patient missed it — this fixes that by always writing the inbox
// entry first.
// ============================================================

import { db, messaging } from "../config/firebase.js";
import logger from "./logger.js";

export const notifyPatient = async ({
  userId,
  fcmToken,
  title,
  body,
  type,
  data = {},
}) => {
  try {
    await db
      .collection("notification_inbox")
      .doc(userId)
      .collection("messages")
      .add({
        type,
        title,
        body,
        is_read: false,
        created_at: new Date(),
        data,
      });
  } catch (err) {
    logger.warn(
      `[notifyPatient] Firestore inbox write failed for ${userId}: ${err.message}`,
    );
  }

  if (!fcmToken) return;

  try {
    await messaging.send({
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
      android: { priority: "high" },
      apns: { payload: { aps: {} } },
    });
  } catch (err) {
    logger.warn(
      `[notifyPatient] FCM push failed for ${userId}: ${err.message}`,
    );
  }
};
