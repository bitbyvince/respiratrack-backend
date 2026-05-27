const mongoose = require('mongoose');

// ============================================================
// SputumTest Model
// Tracks scheduled and completed sputum tests per patient
// Standard schedule for 6-month regimen: Month 2, 5, 6
// Reminders pushed by sputumReminder.job.js (3 days before due)
// Results entered by nurse on tablet
// ============================================================

const sputumTestSchema = new mongoose.Schema(
  {
    test_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: SPT-XXXX
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

    // ── Schedule ─────────────────────────────────────────────
    month_in_treatment: {
      type: Number,
      required: true,
      enum: [2, 5, 6],
      // Corresponds to sputum_test_schedule entries on Patient
    },

    due_date: {
      type: Date,
      required: true,
    },

    // ── Status ───────────────────────────────────────────────
    status: {
      type: String,
      required: true,
      enum: ['Pending', 'Completed', 'Missed', 'Rescheduled'],
      default: 'Pending',
    },

    rescheduled_date: {
      type: Date,
      default: null,
      // Populated only when status === 'Rescheduled'
    },

    // ── Result ───────────────────────────────────────────────
    result: {
      type: String,
      enum: ['Negative', 'Positive', 'Indeterminate', null],
      default: null,
      // null until test is completed and result is entered
    },

    result_entered_by: {
      type: String,
      trim: true,
      default: null,
      ref: 'User',
      // user_id of nurse who recorded the result
    },

    result_entered_at: {
      type: Date,
      default: null,
    },

    // ── Lab Details ──────────────────────────────────────────
    lab_name: {
      type: String,
      trim: true,
      default: null,
      // e.g. "Pasig City General Hospital Lab"
    },

    specimen_type: {
      type: String,
      trim: true,
      enum: ['Sputum', 'Smear', 'GeneXpert', null],
      default: 'Sputum',
    },

    // ── Reminder Tracking ────────────────────────────────────
    reminder_sent: {
      type: Boolean,
      default: false,
      // Set to true by sputumReminder.job.js when push is sent
    },

    reminder_sent_at: {
      type: Date,
      default: null,
    },

    // ── Notes ────────────────────────────────────────────────
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
      updatedAt: 'updated_at',
    },
    collection: 'sputum_tests',
  }
);

// ── Indexes ──────────────────────────────────────────────────
// One test per patient per treatment month — enforced
sputumTestSchema.index(
  { patient_id: 1, month_in_treatment: 1 },
  { unique: true }
);
sputumTestSchema.index({ patient_id: 1 });
sputumTestSchema.index({ tb_case_number: 1 });
sputumTestSchema.index({ barangay_id: 1 });
sputumTestSchema.index({ due_date: 1 });
sputumTestSchema.index({ status: 1 });
sputumTestSchema.index({ result: 1 });

// Reminder job query — due in 3 days and reminder not yet sent
sputumTestSchema.index({ status: 1, reminder_sent: 1, due_date: 1 });

// ── Static: get upcoming tests due within N days ─────────────
sputumTestSchema.statics.getUpcomingReminders = function (withinDays = 3) {
  const now  = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + withinDays);

  return this.find({
    status: 'Pending',
    reminder_sent: false,
    due_date: { $gte: now, $lte: soon },
  });
};

// ── Static: get all pending tests for a patient ───────────────
sputumTestSchema.statics.getPendingForPatient = function (patient_id) {
  return this.find({ patient_id, status: 'Pending' }).sort({ due_date: 1 });
};

// ── Method: record result ────────────────────────────────────
sputumTestSchema.methods.recordResult = function (result, entered_by, lab_name = null) {
  this.result            = result;
  this.result_entered_by = entered_by;
  this.result_entered_at = new Date();
  this.status            = 'Completed';
  if (lab_name) this.lab_name = lab_name;
  return this.save();
};

// ── Method: mark reminder sent ───────────────────────────────
sputumTestSchema.methods.markReminderSent = function () {
  this.reminder_sent    = true;
  this.reminder_sent_at = new Date();
  return this.save();
};

module.exports = mongoose.model('SputumTest', sputumTestSchema);