import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^.+@.+\..+$/, "Please provide a valid email address"],
    },

    password_hash: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["super_admin"],
      default: "super_admin",
    },

    last_login: {
      type: Date,
      default: null,
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
superAdminSchema.index({ email: 1 }, { unique: true });

const SuperAdmin = mongoose.model(
  "SuperAdmin",
  superAdminSchema,
  "super_admins",
);
export default SuperAdmin;
