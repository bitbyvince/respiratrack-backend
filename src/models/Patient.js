import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    barangay_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      required: true,
    },

    added_by_nurse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Nurse",
      default: null,
    },

    added_by_admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BarangayAdmin",
      default: null,
    },

    full_name: {
      type: String,
      required: true,
      trim: true,
    },

    age: {
      type: Number,
      required: true,
      min: 0,
      max: 120,
    },

    sex: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: true,
    },

    zone: {
      type: String,
      required: true,
      trim: true,
    },

    street: {
      type: String,
      default: null,
      trim: true,
    },

    tb_status: {
      type: String,
      enum: [
        "New",
        "Relapse",
        "Treatment After Failure",
        "Treatment After Loss to Follow-up",
        "Other",
      ],
      required: true,
    },

    diagnosis_date: {
      type: Date,
      required: true,
    },

    phase: {
      type: String,
      enum: ["Intensive", "Continuation"],
      required: true,
    },

    adherence: {
      type: String,
      enum: ["Regular", "Irregular"],
      required: true,
    },

    risk_level: {
      type: String,
      enum: ["Compliant", "At Risk", "Defaulter"],
      default: "Compliant",
    },

    remaining_doses: {
      type: Number,
      min: 0,
      default: 0,
    },

    total_doses: {
      type: Number,
      min: 0,
      default: 0,
    },

    notes: {
      type: String,
      default: null,
      trim: true,
    },

    created_at: {
      type: Date,
      default: Date.now,
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

// Update updated_at automatically on every save
patientSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

// Indexes matching the MongoDB setup script
patientSchema.index({ barangay_id: 1 });
patientSchema.index({ full_name: "text" });
patientSchema.index({ risk_level: 1 });
patientSchema.index({ phase: 1 });
patientSchema.index({ barangay_id: 1, risk_level: 1 });
patientSchema.index({ added_by_nurse: 1 });

const Patient = mongoose.model("Patient", patientSchema, "patients");
export default Patient;
