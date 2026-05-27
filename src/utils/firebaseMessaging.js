import admin from "../config/firebase.js";
import logger from "./logger.js";

export const sendToDevice = async ({ fcmToken, title, body, data = {} }) => {
  const message = {
    token: fcmToken,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)]),
    ),
    android: { priority: "high", notification: { sound: "default" } },
    apns: { payload: { aps: { sound: "default" } } },
  };

  try {
    const messageId = await admin.messaging().send(message);
    logger.info(`[FCM] Message sent to device. ID: ${messageId}`);
    return messageId;
  } catch (err) {
    logger.error(`[FCM] Failed to send to device: ${err.message}`);
    throw err;
  }
};

export const sendToMultipleDevices = async ({
  fcmTokens,
  title,
  body,
  data = {},
}) => {
  if (!fcmTokens || fcmTokens.length === 0) {
    logger.warn("[FCM] sendToMultipleDevices called with no tokens.");
    return { successCount: 0, failureCount: 0 };
  }

  const message = {
    tokens: fcmTokens,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)]),
    ),
    android: { priority: "high", notification: { sound: "default" } },
    apns: { payload: { aps: { sound: "default" } } },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info(
      `[FCM] Multicast result — Success: ${response.successCount}, Failed: ${response.failureCount}`,
    );
    response.responses.forEach((res, idx) => {
      if (!res.success)
        logger.warn(`[FCM] Token [${idx}] failed: ${res.error?.message}`);
    });
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err) {
    logger.error(`[FCM] Multicast send failed: ${err.message}`);
    throw err;
  }
};

export const sendToTopic = async ({ topic, title, body, data = {} }) => {
  const message = {
    topic,
    notification: { title, body },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)]),
    ),
  };

  try {
    const messageId = await admin.messaging().send(message);
    logger.info(`[FCM] Topic message sent to "${topic}". ID: ${messageId}`);
    return messageId;
  } catch (err) {
    logger.error(`[FCM] Failed to send to topic "${topic}": ${err.message}`);
    throw err;
  }
};
