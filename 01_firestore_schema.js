// ============================================================
// RESPIRATRACK — Firebase Firestore Schema Setup
// Run ONCE during initial project setup via Node.js
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
// Firebase Console → Project Settings → Service Accounts → Generate new private key
const serviceAccount = JSON.parse(
  readFileSync(new URL("./serviceAccountKey.json", import.meta.url)),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ============================================================
// TB CASE NUMBER FORMAT: PHNT-1304-071-S26-0001
//
//   PH   — Country code (Philippines)
//   NT   — National TB Program identifier
//   1304 — Province code (e.g. 1304 = Nueva Ecija)
//   071  — Municipality code (e.g. 071 = San Isidro)
//   S26  — Regimen prefix (S=Standard, DR=Drug-resistant) + 2-digit year
//   0001 — Sequential patient number (zero-padded, resets per municipality per year)
//
// Examples:
//   PHNT-1304-071-S26-0001   Standard regimen, Nueva Ecija, San Isidro, 2026, patient #1
//   PHNT-1304-071-DR26-0002  Drug-resistant regimen, same location, patient #2
//   PHNT-1300-001-S26-0001   Different municipality, resets to 0001
//
// Generation logic (runs on backend when nurse saves a new patient):
//   1. Determine province_code and municipality_code from barangay record
//   2. Determine regimen_prefix from patient_type (Drug-resistant → DR, else S)
//   3. Get current 2-digit year
//   4. Query MongoDB patients collection for the highest sequential number
//      matching that province + municipality + year, then increment by 1
//   5. Zero-pad to 4 digits
//   6. Concatenate: `PHNT-${province_code}-${municipality_code}-${regimen_prefix}${year}-${seq}`
// ============================================================

async function setupFirestore() {
  console.log("🔥 Setting up Firestore collections for RespiraTrack...\n");

  // ----------------------------------------------------------
  // 1. OTP_SESSIONS
  // ----------------------------------------------------------
  // Short-lived documents — auto-deleted via Cloud Function TTL
  // on expires_at field (5-minute window).
  //
  // Supports all three patient login identifiers:
  //   tb_case_number / phone_number / email → PIN reset or verification
  //
  // Document ID: {user_id}_{otp_type}_{timestamp_ms}
  //   e.g. "USR-0004_pin_reset_1704067200000"
  // ----------------------------------------------------------
  await db
    .collection("otp_sessions")
    .doc("_schema")
    .set({
      _is_schema: true,

      user_id: "", // MongoDB users.user_id  e.g. "USR-0004"
      patient_id: "", // MongoDB patients.patient_id  e.g. "PT-0001"
      tb_case_number: "", // e.g. "PHNT-1304-071-S26-0001"

      // Which identifier the patient used to request the OTP
      requested_via: "", // "tb_case_number" | "phone_number" | "email"
      phone_number: "", // E.164 format: +639XXXXXXXXX  (null if not used)
      email: "", // null if not used

      otp_code: "", // bcrypt-hashed 6-digit code — NEVER store plaintext
      otp_type: "", // "pin_reset" | "account_recovery" | "login_verification"

      is_used: false,
      attempts: 0, // increment on failed verify — invalidate at 3
      max_attempts: 3,

      created_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 5 * 60 * 1000), // +5 minutes
      ),
      verified_at: null,
    });
  console.log("✓ otp_sessions");

  // ----------------------------------------------------------
  // 2. FCM_TOKENS
  // ----------------------------------------------------------
  // One document per user. Devices stored as a sub-collection
  // so a single user (nurse with tablet + phone) can hold
  // multiple active tokens without array-append conflicts.
  //
  // Parent document: fcm_tokens/{user_id}
  // Sub-collection:  fcm_tokens/{user_id}/devices/{device_id}
  //
  // When sending a notification:
  //   1. Get fcm_tokens/{user_id}
  //   2. Iterate devices sub-collection where is_active = true
  //   3. Fire FCM to each token
  //   4. If FCM returns "invalid-registration-token", set is_active = false
  // ----------------------------------------------------------
  await db.collection("fcm_tokens").doc("_schema").set({
    _is_schema: true,
    user_id: "", // MongoDB users.user_id
    patient_id: "", // MongoDB patients.patient_id (null for staff)
    tb_case_number: "", // "PHNT-1304-071-S26-0001" (null for staff)
    role: "", // "patient" | "nurse" | "barangay_admin" | "super_admin"
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db
    .collection("fcm_tokens")
    .doc("_schema")
    .collection("devices")
    .doc("_schema")
    .set({
      _is_schema: true,
      device_id: "", // UUID generated on first app launch
      fcm_token: "", // token from Firebase SDK on device
      device_type: "", // "android" | "ios"
      device_label: "", // e.g. "Juan's Phone", "Nurse Tablet"
      app_type: "", // "patient_mobile" | "nurse_tablet" | "admin_web"
      is_active: true,
      registered_at: admin.firestore.FieldValue.serverTimestamp(),
      last_used_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  console.log("✓ fcm_tokens");

  // ----------------------------------------------------------
  // 3. NOTIFICATION_INBOX
  // ----------------------------------------------------------
  // Real-time notification inbox per user — powers mobile Module 6.
  // onSnapshot listener in the Flutter app keeps it live.
  //
  // Parent collection: notification_inbox/{user_id}
  // Sub-collection:    notification_inbox/{user_id}/messages/{notification_id}
  //
  // Notification types:
  //   medication_reminder   — daily dose reminder (scheduled via FCM)
  //   missed_dose           — dose not logged within cutoff window
  //   escalation_level_1    — Add 2: 2 consecutive missed → nurse notified
  //   escalation_level_2    — Add 2: 5 consecutive missed → barangay admin flagged
  //   escalation_level_3    — Add 2: 14 consecutive missed → super admin + Defaulter
  //   appointment_confirmed — booking confirmed by admin
  //   appointment_reminder  — 24h before scheduled appointment
  //   sputum_test_due       — approaching sputum test date (3 days before)
  //   stock_alert           — low/critical stock level (staff roles only)
  //   general               — system-level broadcast messages
  // ----------------------------------------------------------
  await db.collection("notification_inbox").doc("_schema").set({
    _is_schema: true,
    user_id: "",
    patient_id: "", // null for staff
    tb_case_number: "", // "PHNT-1304-071-S26-0001" — null for staff
    role: "",
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db
    .collection("notification_inbox")
    .doc("_schema")
    .collection("messages")
    .doc("_schema")
    .set({
      _is_schema: true,
      notification_id: "", // "NOTIF-{user_id}-{timestamp_ms}"
      user_id: "",
      patient_id: "",
      tb_case_number: "", // "PHNT-1304-071-S26-0001"

      type: "", // see notification types above
      title: "",
      body: "",

      // Deep link data — Flutter app reads this to navigate
      data: {
        deep_link: "", // e.g. "respiratrack://medication-log"
        patient_id: "",
        tb_case_number: "", // "PHNT-1304-071-S26-0001"
        log_date: "", // "YYYY-MM-DD" if medication-related
        escalation_id: "", // MongoDB escalation_logs ref (if escalation type)
        alert_id: "", // MongoDB alerts ref (if alert type)
      },

      is_read: false,
      is_pushed: false, // true once FCM delivery confirmed
      push_sent_at: null,
      read_at: null,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  console.log("✓ notification_inbox");

  // ----------------------------------------------------------
  // 4. ESCALATION_PUSH_EVENTS
  // ----------------------------------------------------------
  // Add 2 — Automated Defaulter Escalation Workflow
  //
  // Written by the backend the moment the on-login sweep detects
  // a new escalation level in MongoDB. A Firestore onSnapshot
  // listener on the admin web app reacts in real time.
  // A background worker processes push_status = "pending" docs,
  // fires FCM to target_user_ids, then marks push_status = "sent".
  //
  // Document ID: "ESC-PUSH-{escalation_id}-{timestamp_ms}"
  //   e.g. "ESC-PUSH-ESC-0001-1704067200000"
  //
  // Escalation tiers (mirrors MongoDB patients.escalation.level):
  //   Level 1 — consecutive_missed >= 2  → push to assigned nurse
  //   Level 2 — consecutive_missed >= 5  → push to barangay admin
  //   Level 3 — consecutive_missed >= 14 → push to super admin + barangay admin
  //                                        + classify patient as Defaulter in MongoDB
  // ----------------------------------------------------------
  await db.collection("escalation_push_events").doc("_schema").set({
    _is_schema: true,

    // MongoDB cross-references
    escalation_id: "", // MongoDB escalation_logs.escalation_id  e.g. "ESC-0001"
    patient_id: "", // MongoDB patients.patient_id
    tb_case_number: "", // "PHNT-1304-071-S26-0001"

    // Denormalized for fast display without a MongoDB round-trip
    patient_name: "", // "Juan Dela Cruz"
    barangay_id: "", // "BRG-001"
    barangay_name: "", // "Barangay Maliwanag"

    level: 0, // 1 | 2 | 3
    consecutive_missed: 0, // value at time of trigger

    target_user_ids: [], // resolved from MongoDB before writing here
    // e.g. ["USR-0003"] for level 1

    push_status: "", // "pending" | "sent" | "failed"
    push_sent_at: null,
    fcm_response: null, // FCM message ID on success, error code on failure

    created_at: admin.firestore.FieldValue.serverTimestamp(),
    processed_at: null,
  });
  console.log("✓ escalation_push_events");

  // ----------------------------------------------------------
  // 5. ACTIVE_SESSIONS
  // ----------------------------------------------------------
  // Tracks currently logged-in sessions per user.
  // Used for security auditing and real-time "admin is online"
  // awareness. Auto-deleted via Cloud Function TTL on expires_at.
  //
  // Document ID: {session_id}  e.g. "SESS-USR-0003-{timestamp_ms}"
  // ----------------------------------------------------------
  await db
    .collection("active_sessions")
    .doc("_schema")
    .set({
      _is_schema: true,

      session_id: "",
      user_id: "",
      patient_id: "", // null for staff
      tb_case_number: "", // "PHNT-1304-071-S26-0001" — null for staff
      role: "", // "patient" | "nurse" | "barangay_admin" | "super_admin"
      barangay_id: "",

      device_type: "", // "tablet" | "mobile" | "web"
      ip_address: "",

      login_at: admin.firestore.FieldValue.serverTimestamp(),
      last_active_at: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 12 * 60 * 60 * 1000), // +12 hours
      ),
      is_active: true,
    });
  console.log("✓ active_sessions");

  // ----------------------------------------------------------
  // 6. NOTIFICATION_PREFERENCES
  // ----------------------------------------------------------
  // Patient customizes their reminder settings (mobile Module 6).
  // Stored in Firebase so the Flutter app reads and writes directly
  // without a round trip to the MongoDB backend.
  //
  // Document ID: {user_id}  e.g. "USR-0004"
  // ----------------------------------------------------------
  await db
    .collection("notification_preferences")
    .doc("_schema")
    .set({
      _is_schema: true,
      user_id: "",
      patient_id: "",
      tb_case_number: "", // "PHNT-1304-071-S26-0001"

      medication_reminder: {
        enabled: true,
        time: "08:00", // HH:MM in patient's local timezone
        snooze_minutes: 15,
      },

      missed_dose_alert: {
        enabled: true,
        // Fires this many minutes after scheduled time if dose not logged
        delay_after_scheduled_minutes: 60,
      },

      appointment_reminder: {
        enabled: true,
        hours_before: 24,
      },

      sputum_test_reminder: {
        enabled: true,
        days_before: 3,
      },

      tone: "default", // "default" | "silent" | "vibrate"
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  console.log("✓ notification_preferences");

  // ----------------------------------------------------------
  // 7. GEOFENCE_ALERTS
  // ----------------------------------------------------------
  // Triggered when a user's GPS location enters a high-risk
  // barangay zone. Written by the backend after matching
  // user coordinates against MongoDB heatmap_snapshots zones.
  //
  // Document ID: auto-generated
  // Deduplication handled by dedup_tracker (see collection 8)
  // ----------------------------------------------------------
  await db.collection("geofence_alerts").doc("_schema").set({
    _is_schema: true,

    // MongoDB cross-references
    mongo_user_id: "", // MongoDB users.user_id
    mongo_zone_id: "", // MongoDB heatmap_snapshots.snapshot_id
    barangay_id: "", // "BRG-001"
    barangay_name: "", // "Barangay Maliwanag"

    zone_risk_level: "", // "moderate" | "high" | "critical"
    alert_message: "", // e.g. "You are near a high-risk TB area."

    // User's coordinates at time of trigger
    user_lat: 0.0,
    user_lng: 0.0,

    // Zone center from MongoDB heatmap_snapshots.coordinates
    zone_center_lat: 0.0,
    zone_center_lng: 0.0,
    radius_meters: 500, // geofence radius used for zone boundary

    is_sent: false, // updated to true after FCM delivery confirmed
    triggered_at: admin.firestore.FieldValue.serverTimestamp(),
    sent_at: null,
  });
  console.log("✓ geofence_alerts");

  // ----------------------------------------------------------
  // 8. DEDUP_TRACKER
  // ----------------------------------------------------------
  // Prevents sending duplicate geofence alerts to the same user
  // for the same zone within a 24-hour window.
  // Auto-deleted via Cloud Function TTL on expires_at.
  //
  // Document ID: "{user_id}_{barangay_id}"
  //   e.g. "USR-0004_BRG-001"
  // ----------------------------------------------------------
  await db
    .collection("dedup_tracker")
    .doc("_schema")
    .set({
      _is_schema: true,
      user_id: "", // MongoDB users.user_id
      barangay_id: "", // MongoDB barangays.barangay_id
      tb_case_number: "", // "PHNT-1304-071-S26-0001" — null for non-patients
      last_alerted: admin.firestore.FieldValue.serverTimestamp(),
      expires_at: admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 24 * 60 * 60 * 1000), // +24 hours
      ),
    });
  console.log("✓ dedup_tracker");

  // ----------------------------------------------------------
  // 9. NOTIFICATION_LOGS
  // ----------------------------------------------------------
  // Append-only audit log of every push notification and SMS sent.
  // Written by the backend after FCM/SMS delivery attempt.
  // Never deleted — permanent record for audit trails.
  //
  // Document ID: auto-generated
  // ----------------------------------------------------------
  await db.collection("notification_logs").doc("_schema").set({
    _is_schema: true,

    // MongoDB cross-references
    mongo_user_id: "", // MongoDB users.user_id
    patient_id: "", // null for non-patient notifications
    tb_case_number: "", // "PHNT-1304-071-S26-0001" — null for staff

    recipient_type: "", // "patient" | "nurse" | "barangay_admin" | "super_admin"
    channel: "", // "fcm_push" | "sms"

    notification_type: "",
    // "medication_reminder" | "missed_dose"   | "escalation_level_1"
    // "escalation_level_2"  | "escalation_level_3" | "appointment_confirmed"
    // "appointment_reminder"| "sputum_test_due" | "stock_alert"
    // "geofence_alert"      | "otp"            | "general"

    title: "",
    body: "",
    fcm_token: "", // token used for delivery attempt

    // Cross-references to other Firestore/MongoDB documents
    geofence_alert_id: "", // Firestore geofence_alerts doc id (if applicable)
    escalation_push_id: "", // Firestore escalation_push_events doc id (if applicable)
    mongo_escalation_id: "", // MongoDB escalation_logs.escalation_id (if applicable)
    mongo_alert_id: "", // MongoDB alerts.alert_id (if applicable)

    status: "", // "sent" | "failed" | "pending"
    error_message: null, // FCM/SMS error string if status = "failed"
    sent_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("✓ notification_logs");

  console.log("\n✅ Firestore schema setup complete.");
  console.log("\nNext steps:");
  console.log("  → Run 02_firestore_rules.js to deploy Security Rules");
  console.log("  → Run 03_mongo_schema.js to set up MongoDB collections");
  console.log("  → Set Firestore TTL policies:");
  console.log("     • otp_sessions    → expires_at  (5 min)");
  console.log("     • active_sessions → expires_at  (12 hr)");
  console.log("     • dedup_tracker   → expires_at  (24 hr)");

  process.exit(0);
}

setupFirestore().catch((err) => {
  console.error("❌ Firestore setup error:", err);
  process.exit(1);
});
