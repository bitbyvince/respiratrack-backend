// ============================================================
// geofence.service.js
// Matches a user's GPS coordinates against MongoDB heatmap_zones.
// If inside a High/Critical zone:
//   1. Checks Firestore dedup_tracker (skip if alerted within 24h)
//   2. Creates a Firestore geofence_alert
//   3. Sends FCM push notification to the user
//   4. Records in dedup_tracker to prevent repeat alerts
// ============================================================

import mongoose from "mongoose";
import {
  isDuplicateGeofenceAlert,
  createGeofenceAlert,
  markGeofenceAlertSent,
  recordGeofenceAlertSent,
  sendPushToUser,
} from "./firebase.service.js";

// ─── Inline Model ─────────────────────────────────────────────────────────────

const HeatmapZone =
  mongoose.models.HeatmapZone ||
  mongoose.model(
    "HeatmapZone",
    new mongoose.Schema(
      {
        barangay_id: { type: mongoose.Schema.Types.ObjectId, ref: "Barangay" },
        risk_level: {
          type: String,
          enum: ["Low", "Moderate", "High", "Critical"],
        },
        active_cases: { type: Number, default: 0 },
        center: {
          type: { type: String, enum: ["Point"] },
          coordinates: [Number], // [lng, lat]
        },
        radius_km: { type: Number },
        updated_at: { type: Date },
      },
      { collection: "heatmap_zones" },
    ),
  );

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calculate distance in meters between two lat/lng points
 * using the Haversine formula.
 */
const haversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Build a human-readable alert message based on zone risk level.
 */
const buildAlertMessage = (riskLevel, activeCases) => {
  const base = `⚠️ You are near a ${riskLevel}-risk TB zone`;
  const caseInfo = activeCases ? ` with ${activeCases} active case(s)` : "";
  const action =
    riskLevel === "Critical"
      ? " Please take precautions and consult your health worker immediately."
      : " Please wear a mask and maintain proper ventilation.";
  return `${base}${caseInfo}.${action}`;
};

// ─── Core Geofence Check ──────────────────────────────────────────────────────

/**
 * checkGeofence
 * Call this whenever a public user reports their location.
 *
 * @param {string} mongoUserId - MongoDB public_users _id
 * @param {number} userLat     - User's current latitude
 * @param {number} userLng     - User's current longitude
 *
 * @returns {object} result - { triggered: boolean, alerts: [] }
 */
export const checkGeofence = async (mongoUserId, userLat, userLng) => {
  // Only check High and Critical zones — Low/Moderate don't trigger alerts
  const dangerZones = await HeatmapZone.find({
    risk_level: { $in: ["High", "Critical"] },
  });

  const triggeredAlerts = [];

  for (const zone of dangerZones) {
    const [zoneLng, zoneLat] = zone.center.coordinates;
    const radiusMeters = (zone.radius_km || 0.5) * 1000;

    const distanceMeters = haversineDistanceMeters(
      userLat,
      userLng,
      zoneLat,
      zoneLng,
    );

    if (distanceMeters > radiusMeters) continue; // user is outside this zone

    const zoneId = zone._id.toString();

    // Check dedup — skip if already alerted within 24 hours
    const isDuplicate = await isDuplicateGeofenceAlert(mongoUserId, zoneId);
    if (isDuplicate) continue;

    const alertMessage = buildAlertMessage(zone.risk_level, zone.active_cases);

    // Write geofence alert to Firestore
    const alertDocId = await createGeofenceAlert({
      mongoUserId,
      mongoZoneId: zoneId,
      zoneRiskLevel: zone.risk_level,
      alertMessage,
      userLat,
      userLng,
      zoneCenterLat: zoneLat,
      zoneCenterLng: zoneLng,
      radiusMeters,
    });

    // Send push notification to user
    const pushResult = await sendPushToUser(
      mongoUserId,
      "public_user",
      "geofence_alert",
      `${zone.risk_level} TB Risk Area Nearby`,
      alertMessage,
      {
        zone_id: zoneId,
        risk_level: zone.risk_level,
        alert_id: alertDocId,
      },
    );

    // Mark alert as sent if push succeeded
    if (pushResult.success) {
      await markGeofenceAlertSent(alertDocId);
    }

    // Record in dedup tracker to prevent repeat alerts for 24h
    await recordGeofenceAlertSent(mongoUserId, zoneId);

    triggeredAlerts.push({
      zone_id: zoneId,
      risk_level: zone.risk_level,
      alert_doc_id: alertDocId,
      distance_meters: Math.round(distanceMeters),
      push_sent: pushResult.success,
    });
  }

  return {
    triggered: triggeredAlerts.length > 0,
    alerts: triggeredAlerts,
  };
};

/**
 * checkGeofenceForAllActiveUsers
 * Batch job to re-check geofence for all users with a known last location.
 * Call this from a scheduled job or admin endpoint.
 * Requires public_users to have a last_location field in MongoDB.
 */
export const checkGeofenceForAllActiveUsers = async () => {
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
        },
        { collection: "public_users" },
      ),
    );

  const users = await PublicUser.find(
    {
      "last_location.coordinates": { $exists: true },
    },
    "_id last_location",
  );

  const results = [];

  for (const user of users) {
    const [lng, lat] = user.last_location.coordinates;
    const result = await checkGeofence(user._id.toString(), lat, lng);
    if (result.triggered) {
      results.push({ user_id: user._id, ...result });
    }
  }

  return { checked: users.length, triggered: results.length, results };
};
