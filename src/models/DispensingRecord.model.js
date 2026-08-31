import mongoose from 'mongoose';

// ============================================================
// DispensingRecord Model
// Tablet Module 5 — Dispense Medicine (nurse-facing)
// Each record = one drug dispensed to one patient in one visit
// Writing a record MUST also decrement medicine_inventory.remaining_stock
// (handled in dispensing.service.js via session/transaction)
// ============================================================

const dispensingRecordSchema = new mongoose.Schema(
  {
    dispense_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: DISP-XXXX
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

    // ── Staff Reference ─────────────────────────────────────
    dispensed_by: {
      type: String,
      required: true,
      trim: true,
      ref: 'User',
      // Must be role: nurse or barangay_admin
    },

    // ── Drug Details ────────────────────────────────────────
    drug_name: {
      type: String,
      required: true,
      trim: true,
      enum: ['Isoniazid', 'Rifampicin', 'Pyrazinamide', 'Ethambutol'],
    },

    strength: {
      type: String,
      required: true,
      trim: true,
      // e.g. "300mg", "600mg", "1500mg", "1200mg"
    },

    unit: {
      type: String,
      required: true,
      trim: true,
      default: 'tablet',
      enum: ['tablet', 'capsule', 'vial'],
    },

    quantity_dispensed: {
      type: Number,
      required: true,
      min: 1,
      // Decrements medicine_inventory.remaining_stock by this amount
    },

    days_supplied: {
      type: Number,
      required: true,
      min: 1,
      // How many days of medicine this visit covers —
      // used to compute the patient's next pickup due date
    },

    // ── Timing ──────────────────────────────────────────────
    dispense_date: {
      type: Date,
      required: true,
      // Date-only (strip time) — used for daily grouping
    },

    dispensed_at: {
      type: Date,
      required: true,
      default: Date.now,
      // Full timestamp — used for audit log
    },

    // ── Optional Notes ──────────────────────────────────────
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
      updatedAt: false, // Dispensing records are immutable
    },
    collection: 'dispensing_records',
  },
);

// ── Indexes ─────────────────────────────────────────────────
dispensingRecordSchema.index({ patient_id: 1 });
dispensingRecordSchema.index({ tb_case_number: 1 });
dispensingRecordSchema.index({ barangay_id: 1 });
dispensingRecordSchema.index({ dispense_date: -1 });
dispensingRecordSchema.index({ barangay_id: 1, drug_name: 1, dispense_date: -1 });

// ── Static: total dispensed per drug per barangay ───────────
dispensingRecordSchema.statics.getTotalDispensed = function (barangay_id, drug_name, strength) {
  return this.aggregate([
    { $match: { barangay_id, drug_name, strength } },
    { $group: { _id: null, total: { $sum: '$quantity_dispensed' } } },
  ]);
};

// ── Static: average daily dispensing rate (for stockout estimator) ──
dispensingRecordSchema.statics.getAvgDailyRate = function (
  barangay_id,
  drug_name,
  strength,
  days = 30,
) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return this.aggregate([
    { $match: { barangay_id, drug_name, strength, dispense_date: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$dispense_date' } },
        daily_total: { $sum: '$quantity_dispensed' },
      },
    },
    { $group: { _id: null, avg_per_day: { $avg: '$daily_total' } } },
  ]);
};

export default mongoose.model('DispensingRecord', dispensingRecordSchema);