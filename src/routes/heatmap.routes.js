import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// ─── Inline Models ────────────────────────────────────────────────────────────

const HeatmapZone =
  mongoose.models.HeatmapZone ||
  mongoose.model(
    "HeatmapZone",
    new mongoose.Schema(
      {
        barangay_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Barangay",
          required: true,
        },
        risk_level: {
          type: String,
          enum: ["Low", "Moderate", "High", "Critical"],
          required: true,
        },
        active_cases: {
          type: Number,
          min: 0,
          default: 0,
        },
        center: {
          type: {
            type: String,
            enum: ["Point"],
            required: true,
          },
          coordinates: {
            type: [Number], // [longitude, latitude]
            required: true,
          },
        },
        radius_km: {
          type: Number,
          min: 0,
        },
        updated_at: {
          type: Date,
          default: Date.now,
        },
      },
      {
        collection: "heatmap_zones",
      },
    ),
  );

const Patient =
  mongoose.models.Patient ||
  mongoose.model(
    "Patient",
    new mongoose.Schema(
      {
        barangay_id: { type: mongoose.Schema.Types.ObjectId, ref: "Barangay" },
        risk_level: {
          type: String,
          enum: ["Compliant", "At Risk", "Defaulter"],
        },
        phase: { type: String },
      },
      { collection: "patients" },
    ),
  );

const Barangay =
  mongoose.models.Barangay ||
  mongoose.model(
    "Barangay",
    new mongoose.Schema(
      {
        name: { type: String },
        municipality: { type: String },
        province: { type: String },
        location: {
          type: { type: String, enum: ["Point"] },
          coordinates: [Number],
        },
      },
      { collection: "barangays" },
    ),
  );

// ─── Helper: Derive risk level from patient counts ────────────────────────────

const deriveRiskLevel = (activeCases) => {
  if (activeCases === 0) return "Low";
  if (activeCases <= 5) return "Moderate";
  if (activeCases <= 15) return "High";
  return "Critical";
};

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/heatmap
 * Get all heatmap zones
 * Query params: risk_level, barangay_id
 * Used by Flutter app to render circles on OpenStreetMap
 */
router.get("/", async (req, res) => {
  try {
    const { risk_level, barangay_id } = req.query;
    const filter = {};

    if (risk_level) filter.risk_level = risk_level;
    if (barangay_id && mongoose.Types.ObjectId.isValid(barangay_id)) {
      filter.barangay_id = barangay_id;
    }

    const zones = await HeatmapZone.find(filter)
      .populate("barangay_id", "name municipality province")
      .sort({ active_cases: -1 });

    res.json({ success: true, count: zones.length, data: zones });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * GET /api/heatmap/geojson
 * Get all heatmap zones as a GeoJSON FeatureCollection
 * Ready to use directly with OpenStreetMap / Leaflet / flutter_map
 */
router.get("/geojson", async (req, res) => {
  try {
    const zones = await HeatmapZone.find().populate(
      "barangay_id",
      "name municipality",
    );

    const featureCollection = {
      type: "FeatureCollection",
      features: zones.map((zone) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: zone.center.coordinates, // [lng, lat]
        },
        properties: {
          _id: zone._id,
          barangay_id: zone.barangay_id?._id,
          barangay_name: zone.barangay_id?.name,
          municipality: zone.barangay_id?.municipality,
          risk_level: zone.risk_level,
          active_cases: zone.active_cases,
          radius_km: zone.radius_km,
          updated_at: zone.updated_at,
        },
      })),
    };

    res.json({ success: true, data: featureCollection });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * GET /api/heatmap/nearby
 * Get heatmap zones near a given coordinate (geospatial query)
 * Query params: lng, lat, maxDistance (meters, default 5000)
 * Used by mobile app to show zones near user's current location
 */
router.get("/nearby", async (req, res) => {
  try {
    const { lng, lat, maxDistance = 5000 } = req.query;

    if (!lng || !lat) {
      return res.status(400).json({
        success: false,
        message: "lng and lat query params are required",
      });
    }

    const longitude = parseFloat(lng);
    const latitude = parseFloat(lat);

    if (isNaN(longitude) || isNaN(latitude)) {
      return res
        .status(400)
        .json({ success: false, message: "lng and lat must be valid numbers" });
    }

    const zones = await HeatmapZone.find({
      center: {
        $near: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: parseInt(maxDistance),
        },
      },
    }).populate("barangay_id", "name municipality");

    res.json({ success: true, count: zones.length, data: zones });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * GET /api/heatmap/:id
 * Get a single heatmap zone by ID
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid zone ID" });
    }

    const zone = await HeatmapZone.findById(id).populate(
      "barangay_id",
      "name municipality province location",
    );

    if (!zone) {
      return res
        .status(404)
        .json({ success: false, message: "Heatmap zone not found" });
    }

    res.json({ success: true, data: zone });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * POST /api/heatmap
 * Manually create a heatmap zone (admin only)
 * Body: { barangay_id, risk_level, active_cases, center: { coordinates: [lng, lat] }, radius_km }
 */
router.post("/", async (req, res) => {
  try {
    const { barangay_id, risk_level, active_cases, center, radius_km } =
      req.body;

    if (!barangay_id || !risk_level || !center?.coordinates) {
      return res.status(400).json({
        success: false,
        message: "barangay_id, risk_level, and center.coordinates are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(barangay_id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid barangay_id" });
    }

    const zone = await HeatmapZone.create({
      barangay_id,
      risk_level,
      active_cases: active_cases || 0,
      center: { type: "Point", coordinates: center.coordinates },
      radius_km: radius_km || 0.5,
      updated_at: new Date(),
    });

    res
      .status(201)
      .json({ success: true, message: "Heatmap zone created", data: zone });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * PUT /api/heatmap/:id
 * Update a heatmap zone manually (admin only)
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid zone ID" });
    }

    const { risk_level, active_cases, center, radius_km } = req.body;
    const updates = { updated_at: new Date() };

    if (risk_level) updates.risk_level = risk_level;
    if (active_cases !== undefined) updates.active_cases = active_cases;
    if (radius_km !== undefined) updates.radius_km = radius_km;
    if (center?.coordinates) {
      updates.center = { type: "Point", coordinates: center.coordinates };
    }

    const updated = await HeatmapZone.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Heatmap zone not found" });
    }

    res.json({ success: true, message: "Heatmap zone updated", data: updated });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * POST /api/heatmap/recalculate
 * Recalculate all heatmap zones based on current patient risk levels per barangay
 * Pulls active patient counts from the patients collection and updates zones
 * Trigger this after compliance batch recalculation or on a schedule
 */
router.post("/recalculate", async (req, res) => {
  try {
    // Aggregate patient counts by barangay and risk level
    const patientCounts = await Patient.aggregate([
      {
        $group: {
          _id: "$barangay_id",
          active_cases: { $sum: 1 },
          defaulters: {
            $sum: { $cond: [{ $eq: ["$risk_level", "Defaulter"] }, 1, 0] },
          },
          at_risk: {
            $sum: { $cond: [{ $eq: ["$risk_level", "At Risk"] }, 1, 0] },
          },
        },
      },
    ]);

    const results = [];

    for (const entry of patientCounts) {
      if (!entry._id) continue;

      const barangay = await Barangay.findById(entry._id);
      if (!barangay || !barangay.location?.coordinates) continue;

      const risk_level = deriveRiskLevel(entry.active_cases);

      const zone = await HeatmapZone.findOneAndUpdate(
        { barangay_id: entry._id },
        {
          barangay_id: entry._id,
          risk_level,
          active_cases: entry.active_cases,
          center: {
            type: "Point",
            coordinates: barangay.location.coordinates,
          },
          radius_km: Math.max(0.3, entry.active_cases * 0.05), // scale radius by case count
          updated_at: new Date(),
        },
        { upsert: true, new: true },
      );

      results.push({
        barangay_id: entry._id,
        barangay_name: barangay.name,
        active_cases: entry.active_cases,
        risk_level,
      });
    }

    res.json({
      success: true,
      message: `Heatmap recalculated for ${results.length} barangays`,
      data: results,
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * DELETE /api/heatmap/:id
 * Delete a heatmap zone (admin only)
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid zone ID" });
    }

    const deleted = await HeatmapZone.findByIdAndDelete(id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Heatmap zone not found" });
    }

    res.json({ success: true, message: "Heatmap zone deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

export default router;
