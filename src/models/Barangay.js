import mongoose from "mongoose";

const barangaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    municipality: {
      type: String,
      required: true,
      trim: true,
    },

    province: {
      type: String,
      required: true,
      trim: true,
    },

    // GeoJSON Point for geospatial queries (used by heatmap)
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
    },

    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

// Indexes matching the MongoDB setup script
barangaySchema.index({ name: 1, municipality: 1 }, { unique: true });
barangaySchema.index({ location: "2dsphere" });

const Barangay = mongoose.model("Barangay", barangaySchema, "barangays");
export default Barangay;
