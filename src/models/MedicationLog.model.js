import mongoose from 'mongoose';

// ============================================================
// MedicationLog Model
// Mobile Module 3 — Patient taps "Mark as Taken" per drug
// One document per day per patient
// overall_status is derived from individual medicine statuses
// Missed detection is handled by missedDose.job.js at midnight
// ============================================================

const medicineEntrySchema = new mongoose.Schema(
  {
    drug_name: {
      type: String,
      required: true,
      trim: true,
      enum: ['HRZE', 'HR', 'Isoniazid', 'Rifampicin', 'Pyrazinamide', 'Ethambutol'],
    },
    strength: {
      type: String,
      trim: true,
      default: '',
      // e.g. "300mg", "600mg", "1500mg", "1200mg"
      required: function () {
        return !['HRZE', 'HR'].includes(this.drug_name);
      },
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      default: 'tablet',
      enum: ['tablet', 'capsule', 'vial'],
    },
    number_to_be_taken: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      required: true,
      enum: ['Taken', 'Missed', 'Partial'],
      default: 'Missed',
    },
    taken_at: {
      type: Date,
      default: null,
      // null if status is Missed
    },
  },
  { _id: false },
);

const medicationLogSchema = new mongoose.Schema(
  {
    log_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: MED-LOG-XXXX
    },

    // ── Patient Reference ───────────────────────────────────
    patient_id: {
      type: String,
      required: true,
      trim: true,
      ref: 'Patient',
    },

    tb_case_number: {
      type: String,
      required: true,
      trim: true,
      // Denormalized — Format: PHNT-137-071-S26-XXXX
    },

    barangay_id: {
      type: String,
      required: true,
      trim: true,
      ref: 'Barangay',
    },

    // ── Log Details ──────────────────────────────────────────
    log_date: {
      type: Date,
      required: true,
      // Date-only — one log per patient per day
    },

    logged_at: {
      type: Date,
      required: true,
      default: Date.now,
      // Full timestamp of when the record was submitted
    },

    logged_by: {
      type: String,
      required: true,
      enum: ['patient', 'nurse'],
      default: 'patient',
      // 'nurse' when staff logs on behalf of patient
    },

    treatment_day: {
      type: Number,
      required: true,
      min: 1,
      // Day number in the treatment course (1–168 for 6-month regimen)
    },

    // ── Per-Drug Entries ─────────────────────────────────────
    medicines: {
      type: [medicineEntrySchema],
      required: true,
      validate: {
        validator: (v) => v.length > 0,
        message: 'At least one medicine entry is required.',
      },
    },

    // ── Derived Overall Status ───────────────────────────────
    overall_status: {
      type: String,
      required: true,
      enum: ['Taken', 'Partial', 'Missed'],
      // Taken   — all medicines status === 'Taken'
      // Partial — at least one 'Taken' and one 'Missed'
      // Missed  — all medicines status === 'Missed'
    },

    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false, // Logs are immutable once submitted
    },
    collection: 'medication_logs',
  },
);

// ── Indexes ──────────────────────────────────────────────────
medicationLogSchema.index({ patient_id: 1, log_date: 1 }, { unique: true });
medicationLogSchema.index({ patient_id: 1, log_date: -1 });
medicationLogSchema.index({ tb_case_number: 1 });
medicationLogSchema.index({ barangay_id: 1 });
medicationLogSchema.index({ overall_status: 1 });
medicationLogSchema.index({ log_date: -1 });

// ── Pre-save: derive overall_status from medicines array ─────
medicationLogSchema.pre('save', function () {
  if (this.isModified('medicines') || this.isNew) {
    const statuses = this.medicines.map((m) => m.status);
    const allTaken  = statuses.every((s) => s === 'Taken');
    const allMissed = statuses.every((s) => s === 'Missed');

    if (allTaken)       this.overall_status = 'Taken';
    else if (allMissed) this.overall_status = 'Missed';
    else                this.overall_status = 'Partial';
  }
});

// ── Static: get logs for a patient within a date range ───────
medicationLogSchema.statics.getRange = function (patient_id, startDate, endDate) {
  return this.find({
    patient_id,
    log_date: { $gte: startDate, $lte: endDate },
  }).sort({ log_date: 1 });
};

// ── Static: count consecutive missed days up to today ────────
medicationLogSchema.statics.getConsecutiveMissed = async function (patient_id) {
  const logs = await this.find({ patient_id })
    .sort({ log_date: -1 })
    .select('overall_status log_date');

  let count = 0;
  for (const log of logs) {
    if (log.overall_status === 'Missed') count++;
    else break;
  }
  return count;
};

export default mongoose.model('MedicationLog', medicationLogSchema);