import mongoose from "mongoose";

const publicUserSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      default: null,
      trim: true,
    },

    contact_number: {
      type: String,
      required: true,
      trim: true,
      // e.g. +639XXXXXXXXX
    },

    email: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },

    password_hash: {
      type: String,
      required: true,
    },

    // GeoJSON Point — last known position for geofence matching
    last_location: {
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

    otp_verified: {
      type: Boolean,
      default: false,
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
publicUserSchema.index({ contact_number: 1 }, { unique: true });
publicUserSchema.index({ email: 1 }, { sparse: true }); // sparse because email is optional
publicUserSchema.index({ last_location: "2dsphere" });

const PublicUser = mongoose.model(
  "PublicUser",
  publicUserSchema,
  "public_users",
);
export default PublicUser;
