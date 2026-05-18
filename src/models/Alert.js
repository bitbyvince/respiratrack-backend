import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    nurse_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Nurse",
      required: true,
    },

    alert_type: {
      type: String,
      enum: [
        "Missed Dose",
        "Defaulter Risk",
        "Low Stock",
        "Non-Compliance",
        "Other",
      ],
      required: true,
    },

    severity: {
      type: String,
      enum: ["Critical", "Warning", "Info"],
      required: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    is_read: {
      type: Boolean,
      default: false,
    },

    action_link: {
      type: String,
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
alertSchema.index({ nurse_id: 1, is_read: 1 });
alertSchema.index({ patient_id: 1 });
alertSchema.index({ severity: 1 });
alertSchema.index({ created_at: -1 });

const Alert = mongoose.model("Alert", alertSchema, "alerts");
export default Alert;
