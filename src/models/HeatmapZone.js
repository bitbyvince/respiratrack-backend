import mongoose from "mongoose";

const heatmapZoneSchema = new mongoose.Schema(
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

    // GeoJSON Point for the center of the zone
    center: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },

    radius_km: {
      type: Number,
      min: 0,
      default: 0.5,
    },

    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

// Indexes matching the MongoDB setup script
heatmapZoneSchema.index({ center: "2dsphere" });
heatmapZoneSchema.index({ barangay_id: 1 });
heatmapZoneSchema.index({ risk_level: 1 });

const HeatmapZone = mongoose.model(
  "HeatmapZone",
  heatmapZoneSchema,
  "heatmap_zones",
);
export default HeatmapZone;
