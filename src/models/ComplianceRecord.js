import mongoose from "mongoose";

const complianceRecordSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    compliance_percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    doses_taken: {
      type: Number,
      min: 0,
      default: 0,
    },

    doses_remaining: {
      type: Number,
      min: 0,
      default: 0,
    },

    risk_level: {
      type: String,
      enum: ["Compliant", "At Risk", "Defaulter"],
      required: true,
    },

    phase: {
      type: String,
      enum: ["Intensive", "Continuation"],
      required: true,
    },

    calculated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

// Indexes matching the MongoDB setup script
complianceRecordSchema.index({ patient_id: 1 });
complianceRecordSchema.index({ patient_id: 1, calculated_at: -1 });
complianceRecordSchema.index({ risk_level: 1, calculated_at: -1 });

const ComplianceRecord = mongoose.model(
  "ComplianceRecord",
  complianceRecordSchema,
  "compliance_records",
);
export default ComplianceRecord;
