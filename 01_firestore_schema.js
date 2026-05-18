// ============================================================
// TB MONITORING SYSTEM — Firebase Firestore Schema Setup
// Run this ONCE during initial project setup via Node.js
//
// Install deps first:
//   npm install firebase-admin dotenv
//
// Usage:
//   node 01_firestore_schema.js
// ============================================================

import admin from "firebase-admin";
import { readFileSync } from "fs";
import "dotenv/config";

// ---- Initialize Firebase Admin SDK ----
// Download your serviceAccountKey.json from:
// Firebase Console → Project Settings → Service Accounts → Generate new private key
const serviceAccount = JSON.parse(
  readFileSync(new URL("./serviceAccountKey.json", import.meta.url))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ============================================================
// FIRESTORE COLLECTION STRUCTURE
//
// Firebase is schema-less, but we enforce structure via
// Security Rules (see 02_firestore.rules) and these seed
// documents which act as schema contracts for your team.
//
// COLLECTIONS STORED IN FIREBASE (not MongoDB):
//
//   1. otp_sessions          — active OTP state per user (short-lived)
//   2. notification_logs     — record of every push/SMS notification sent
//   3. geofence_alerts       — triggered zone intersection events
//   4. fcm_tokens            — device tokens per user for FCM push delivery
//   5. push_queue            — queued notification jobs (optional, or use FCM directly)
// ============================================================

async function setupFirestore() {
  console.log("🔥 Setting up Firestore collections...\n");

  // ----------------------------------------------------------
  // 1. OTP_SESSIONS
  // ----------------------------------------------------------
  // Created automatically by Firebase Auth when using Phone Auth.
  // We store supplementary session state here for tracking.
  //
  // Document ID: user's contact_number (e.g. "+639171234567")
  // Auto-deleted after TTL via Cloud Functions (see 04_functions.js)
  // ----------------------------------------------------------
  await db.collection("otp_sessions").doc("_schema").set({
    // Schema reference document — do not delete
    _is_schema:      true,
    user_id:         "",          // MongoDB public_users _id (string)
    contact_number:  "",          // E.164 format: +639XXXXXXXXX
    attempts:        0,           // increment on failed verify (max 3)
    verified:        false,
    created_at:      admin.firestore.FieldValue.serverTimestamp(),
    expires_at:      admin.firestore.Timestamp.fromDate(
                       new Date(Date.now() + 5 * 60 * 1000)  // +5 minutes
                     ),
  });
  console.log("✓ otp_sessions");

  // ----------------------------------------------------------
  // 2. FCM_TOKENS
  // ----------------------------------------------------------
  // Stores device push tokens per user.
  // One user may have multiple devices (subcollection per device).
  //
  // Collection: fcm_tokens/{mongo_user_id}/devices/{device_id}
  // ----------------------------------------------------------
  await db
    .collection("fcm_tokens")
    .doc("_schema")
    .collection("devices")
    .doc("_schema")
    .set({
      _is_schema:    true,
      mongo_user_id: "",          // MongoDB public_users _id
      fcm_token:     "",          // token from Firebase SDK on device
      device_type:   "",          // "android" | "ios"
      app_type:      "",          // "public_mobile" | "nurse_mobile"
      last_updated:  admin.firestore.FieldValue.serverTimestamp(),
    });
  console.log("✓ fcm_tokens");

  // ----------------------------------------------------------
  // 3. GEOFENCE_ALERTS
  // ----------------------------------------------------------
  // Created when a public user's GPS enters a High-risk zone.
  // Written by backend after matching user location vs heatmap_zones in MongoDB.
  //
  // Document ID: auto-generated
  // ----------------------------------------------------------
  await db.collection("geofence_alerts").doc("_schema").set({
    _is_schema:       true,
    mongo_user_id:    "",         // MongoDB public_users _id
    mongo_zone_id:    "",         // MongoDB heatmap_zones _id
    zone_risk_level:  "",         // "High" | "Critical"
    alert_message:    "",         // e.g. "High-risk TB area detected nearby."
    user_lat:         0.0,        // user's lat at time of trigger
    user_lng:         0.0,        // user's lng at time of trigger
    zone_center_lat:  0.0,
    zone_center_lng:  0.0,
    radius_meters:    500,        // geofence radius used
    is_sent:          false,      // updated to true after FCM delivery
    triggered_at:     admin.firestore.FieldValue.serverTimestamp(),
    sent_at:          null,
  });
  console.log("✓ geofence_alerts");

  // ----------------------------------------------------------
  // 4. NOTIFICATION_LOGS
  // ----------------------------------------------------------
  // Append-only log of every notification delivered (push or SMS).
  // Written by the backend after FCM/SMS send is confirmed.
  //
  // Document ID: auto-generated
  // ----------------------------------------------------------
  await db.collection("notification_logs").doc("_schema").set({
    _is_schema:       true,
    mongo_user_id:    "",         // MongoDB public_users _id (or nurse _id)
    recipient_type:   "",         // "public_user" | "nurse"
    channel:          "",         // "fcm_push" | "sms"
    notification_type: "",        // "geofence_alert" | "missed_dose" | "otp" | "system"
    title:            "",         // push notification title
    body:             "",         // push notification body
    fcm_token:        "",         // token used for delivery
    geofence_alert_id: "",        // Firestore geofence_alerts doc id (if applicable)
    mongo_patient_id: "",         // MongoDB patients _id (if applicable)
    mongo_alert_id:   "",         // MongoDB alerts _id (if applicable)
    status:           "",         // "sent" | "failed" | "pending"
    error_message:    null,       // FCM/SMS error if status=failed
    sent_at:          admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("✓ notification_logs");

  // ----------------------------------------------------------
  // 5. DEDUP_TRACKER
  // ----------------------------------------------------------
  // Prevents sending duplicate geofence alerts to the same user
  // for the same zone within a 24-hour window.
  //
  // Document ID: {mongo_user_id}_{mongo_zone_id}
  // Deleted after 24hr via Cloud Function TTL cleanup
  // ----------------------------------------------------------
  await db.collection("dedup_tracker").doc("_schema").set({
    _is_schema:     true,
    mongo_user_id:  "",
    mongo_zone_id:  "",
    last_alerted:   admin.firestore.FieldValue.serverTimestamp(),
    expires_at:     admin.firestore.Timestamp.fromDate(
                      new Date(Date.now() + 24 * 60 * 60 * 1000) // +24 hours
                    ),
  });
  console.log("✓ dedup_tracker");

  console.log("\n✅ Firestore schema setup complete.");
  process.exit(0);
}

setupFirestore().catch((err) => {
  console.error("❌ Firestore setup error:", err);
  process.exit(1);
});
