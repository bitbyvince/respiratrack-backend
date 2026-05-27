import mongoose from "mongoose";

const nurseSchema = new mongoose.Schema(
  {
    barangay_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      required: true,
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

    license_number: {
      type: String,
      default: null,
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
nurseSchema.index({ email: 1 }, { unique: true });
nurseSchema.index({ barangay_id: 1 });

const Nurse = mongoose.model("Nurse", nurseSchema, "nurses");
export default Nurse;
