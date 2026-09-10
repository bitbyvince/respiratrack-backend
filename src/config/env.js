// config/env.js
import "dotenv/config";

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const optional = (key, defaultValue = null) => process.env[key] ?? defaultValue;

const env = {
  // ── Server ──────────────────────────────────────────────
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: parseInt(optional("PORT", "3000"), 10),

  // ── MongoDB ─────────────────────────────────────────────
  MONGODB_URI: required("MONGODB_URI"),
  MONGODB_DB_NAME: optional("MONGODB_DB_NAME", "respiratrack"),

  // ── Firebase / FCM ──────────────────────────────────────
  FIREBASE_SERVICE_ACCOUNT_PATH: optional(
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    "./serviceAccountKey.json",
  ),

  // ── JWT ─────────────────────────────────────────────────
  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_EXPIRES_IN: optional("JWT_EXPIRES_IN", "12h"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_REFRESH_EXPIRES_IN: optional("JWT_REFRESH_EXPIRES_IN", "7d"),

  // ── OTP ─────────────────────────────────────────────────
  OTP_EXPIRES_MINUTES: parseInt(optional("OTP_EXPIRES_MINUTES", "5"), 10),
  OTP_MAX_ATTEMPTS: parseInt(optional("OTP_MAX_ATTEMPTS", "3"), 10),
  BCRYPT_SALT_ROUNDS: parseInt(optional("BCRYPT_SALT_ROUNDS", "10"), 10),

  // ── SMS (for OTP delivery) ───────────────────────────────
  SMS_PROVIDER: optional("SMS_PROVIDER", "semaphore"), // "semaphore" | "twilio" | "twilio_verify"
  SMS_API_KEY: optional("SMS_API_KEY"),
  SMS_SENDER_NAME: optional("SMS_SENDER_NAME", "RespiraTrack"),
  TWILIO_ACCOUNT_SID: optional("TWILIO_ACCOUNT_SID"),
  TWILIO_AUTH_TOKEN: optional("TWILIO_AUTH_TOKEN"),
  TWILIO_VERIFY_SERVICE_SID: optional("TWILIO_VERIFY_SERVICE_SID"), // required when SMS_PROVIDER=twilio_verify
  TWILIO_PHONE_NUMBER: optional("TWILIO_PHONE_NUMBER"), // E.164 format, e.g. +15551234567

  // ── Case Number Generation ───────────────────────────────
  DEFAULT_PROVINCE_CODE: optional("DEFAULT_PROVINCE_CODE", "1304"),
  DEFAULT_MUNICIPALITY_CODE: optional("DEFAULT_MUNICIPALITY_CODE", "071"),

  // ── Cron Jobs ────────────────────────────────────────────
  CRON_MISSED_DOSE: optional("CRON_MISSED_DOSE", "0 0 * * *"), // daily midnight
  CRON_ESCALATION: optional("CRON_ESCALATION", "0 1 * * *"), // 1 AM
  CRON_COMPLIANCE_SNAPSHOT: optional("CRON_COMPLIANCE_SNAPSHOT", "0 2 * * *"), // 2 AM
  CRON_HEATMAP_SNAPSHOT: optional("CRON_HEATMAP_SNAPSHOT", "0 3 * * *"), // 3 AM
  CRON_STOCKOUT_PREDICTION: optional("CRON_STOCKOUT_PREDICTION", "0 4 * * *"), // 4 AM
  CRON_SPUTUM_REMINDER: optional("CRON_SPUTUM_REMINDER", "0 8 * * *"), // 8 AM

  // ── Escalation Thresholds ────────────────────────────────
  ESCALATION_LEVEL_1_DAYS: parseInt(
    optional("ESCALATION_LEVEL_1_DAYS", "2"),
    10,
  ),
  ESCALATION_LEVEL_2_DAYS: parseInt(
    optional("ESCALATION_LEVEL_2_DAYS", "5"),
    10,
  ),
  ESCALATION_LEVEL_3_DAYS: parseInt(
    optional("ESCALATION_LEVEL_3_DAYS", "14"),
    10,
  ),

  // ── Geofence ─────────────────────────────────────────────
  GEOFENCE_RADIUS_METERS: parseInt(
    optional("GEOFENCE_RADIUS_METERS", "500"),
    10,
  ),
  GEOFENCE_DEDUP_HOURS: parseInt(optional("GEOFENCE_DEDUP_HOURS", "24"), 10),

  // ── Stock / Inventory ────────────────────────────────────
  STOCK_LOW_THRESHOLD: parseInt(optional("STOCK_LOW_THRESHOLD", "30"), 10),
  STOCK_CRITICAL_THRESHOLD: parseInt(
    optional("STOCK_CRITICAL_THRESHOLD", "10"),
    10,
  ),

  // ── PDF Export ───────────────────────────────────────────
  PDF_OUTPUT_DIR: optional("PDF_OUTPUT_DIR", "./exports/pdf"),

  // ── Logging ──────────────────────────────────────────────
  LOG_LEVEL: optional("LOG_LEVEL", "info"), // "debug" | "info" | "warn" | "error"
  LOG_FORMAT: optional("LOG_FORMAT", "combined"), // "combined" | "json"
};

// ── Validate & freeze ────────────────────────────────────────
try {
  // Trigger all required() calls at startup
  Object.values(env);
} catch (err) {
  console.error(`[env] ❌ ${err.message}`);
  process.exit(1);
}

export default Object.freeze(env);
