import mongoose from "mongoose";

const barangayAdminSchema = new mongoose.Schema(
  {
    barangay_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      required: true,
    },

    barangay_name: {
      type: String,
      required: true,
      trim: true,
    },

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

    full_name: {
      type: String,
      required: true,
      trim: true,
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
barangayAdminSchema.index({ email: 1 }, { unique: true });
barangayAdminSchema.index({ barangay_id: 1 });

const BarangayAdmin = mongoose.model(
  "BarangayAdmin",
  barangayAdminSchema,
  "barangay_admins",
);
export default BarangayAdmin;
