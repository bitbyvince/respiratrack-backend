// ============================================================
// scripts/backfillHealthCenterCoordinates.js
//
// Replaces the placeholder grid coordinates from seedPasigHealthCenters.js
// with real geocoded locations (via OpenStreetMap Nominatim), one per
// health center. Also recomputes each barangay's own centroid/boundary
// from the average of its facilities' real coordinates, so the
// boundary square on the map lines up with where the facilities
// actually are instead of an arbitrary grid slot.
//
// Coordinates below were geocoded from the addresses in the seed data
// (street-level where Nominatim found a match, barangay-level centroid
// as a fallback where the specific street wasn't in OSM — see the
// GEOCODE_PRECISION map). Re-run scripts/backfillHealthCenterCoordinates.js
// again if you get more precise real-world coordinates later.
//
// Run with: node src/scripts/backfillHealthCenterCoordinates.js
// ============================================================

import mongoose from "mongoose";
import "dotenv/config";
import Barangay from "../models/Barangay.model.js";

const { MONGODB_URI } = process.env;

// [longitude, latitude] per health_center_id, from Nominatim (OpenStreetMap).
const COORDS = {
  "HC-001": [121.0689998, 14.5652541], // barangay-level (street not found)
  "HC-002": [121.075193, 14.5585973],
  "HC-003": [121.0786529, 14.5547802], // barangay-level
  "HC-004": [121.0677406, 14.5547846], // barangay-level
  "HC-005": [121.0791085, 14.5720146],
  "HC-006": [121.0867251, 14.5514813], // barangay-level
  "HC-007": [121.0741743, 14.5644986], // barangay-level
  "HC-008": [121.0604419, 14.5728394],
  "HC-009": [121.0833011, 14.5589613],
  "HC-010": [121.0648873, 14.5744287],
  "HC-011": [121.0842608, 14.5614713],
  "HC-012": [121.0849187, 14.5630633],
  "HC-013": [121.0595795, 14.5665813], // barangay-level
  "HC-014": [121.0801699, 14.5653736],
  "HC-015": [121.0614139, 14.5791457],
  "HC-016": [121.0757124, 14.5522262], // barangay-level
  "HC-017": [121.0750361, 14.5607603],
  "HC-018": [121.0833901, 14.5579889],
  "HC-019": [121.078921, 14.5635706], // barangay-level
  "HC-020": [121.0733605, 14.5591972],
  "HC-021": [121.0766278, 14.560954],
  "HC-022": [121.0740842, 14.5582196],
  "HC-023": [121.0732458, 14.5841307],
  "HC-024": [121.0958171, 14.6132482],
  "HC-025": [121.0912254, 14.5985609],
  "HC-026": [121.0794112, 14.5752525],
  "HC-027": [121.0932701, 14.5545862],
  "HC-028": [121.0909923, 14.5572974], // barangay-level
  "HC-029": [121.0895216, 14.5902199],
  "HC-030": [121.0995376, 14.5740476],
  "HC-031": [121.1013028, 14.5842641], // barangay-level
  "HC-032": [121.0923077, 14.6079999],
  "HC-033": [121.0694478, 14.5631246],
  "HC-034": [121.1013028, 14.5842641], // barangay-level (same as HC-031 — see geoJitter for map separation)
};

const buildSquareBoundary = (lng, lat, delta = 0.003) => ({
  type: "Polygon",
  coordinates: [[
    [lng - delta, lat - delta],
    [lng + delta, lat - delta],
    [lng + delta, lat + delta],
    [lng - delta, lat + delta],
    [lng - delta, lat - delta],
  ]],
});

async function run() {
  await mongoose.connect(MONGODB_URI);

  const barangays = await Barangay.find({});
  let updatedCenters = 0;
  let missing = [];

  for (const barangay of barangays) {
    const realCoords = [];

    for (const hc of barangay.health_centers) {
      const coord = COORDS[hc.health_center_id];
      if (!coord) {
        missing.push(hc.health_center_id);
        continue;
      }
      hc.coordinates = { type: "Point", coordinates: coord };
      realCoords.push(coord);
      updatedCenters++;
    }

    if (realCoords.length > 0) {
      const avgLng = realCoords.reduce((s, c) => s + c[0], 0) / realCoords.length;
      const avgLat = realCoords.reduce((s, c) => s + c[1], 0) / realCoords.length;
      barangay.coordinates = { type: "Point", coordinates: [avgLng, avgLat] };
      barangay.boundary_geojson = buildSquareBoundary(avgLng, avgLat);
    }

    barangay.markModified("health_centers");
    await barangay.save();
  }

  console.log(`✅ Backfilled real coordinates for ${updatedCenters} health centers across ${barangays.length} barangays.`);
  if (missing.length) console.log(`⚠️  Missing coordinates for: ${missing.join(", ")}`);

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
