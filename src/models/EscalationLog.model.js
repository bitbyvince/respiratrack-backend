const mongoose = require('mongoose');

// ============================================================
// EscalationLog Model
// Full audit trail of every auto-escalation event
// Triggered by escalation.job.js when consecutive missed
// doses cross a threshold:
//   Level 1 — consecutive_missed >= 2  → assigned nurse
//   Level 2 — consecutive_missed >= 5  → barangay admin
//   Level 3 — consecutive_missed >= 14 → super admin + Defaulter
// ============================================================

const notifiedUserSchema = new mongoose.Schema(
  {
    user_id:     { type: String, required: true, trim: true, ref: 'User' },
    role:        { type: String, required: true, enum: ['nurse', 'barangay_admin', 'super_admin'] },
    notified_at: { type: Date,   required: true, default: Date.now },
  },
  { _id: false }
);

const escalationLogSchema = new mongoose.Schema(
  {
    escalation_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: ESC-XXXX
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

    // ── Escalation Details ──────────────────────────────────
    level: {
      type: Number,
      required: true,
      enum: [1, 2, 3],
    },

    consecutive_missed_at_trigger: {
      type: Number,
      required: true,
      min: 1,
      // Snapshot of how many consecutive doses were missed
      // when this escalation was triggered
    },

    // ── Trigger ─────────────────────────────────────────────
    triggered_by: {
      type: String,
      required: true,
      default: 'system',
      // 'system' (cron job) or a user_id (manual escalation)
    },

    triggered_at: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // ── Notifications ────────────────────────────────────────
    notified_users: {
      type: [notifiedUserSchema],
      default: [],
    },

    // ── Acknowledgement ──────────────────────────────────────
    acknowledged_by: {
      type: String,
      trim: true,
      default: null,
      ref: 'User',
    },

    acknowledged_at: {
      type: Date,
      default: null,
    },

    acknowledgement_notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },

    // ── Resolution ───────────────────────────────────────────
    resolved: {
      type: Boolean,
      default: false,
    },

    resolved_at: {
      type: Date,
      default: null,
    },

    resolution_notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false, // Immutable log — use resolved/acknowledged fields for state
    },
    collection: 'escalation_logs',
  }
);

// ── Indexes ──────────────────────────────────────────────────
escalationLogSchema.index({ patient_id: 1, triggered_at: -1 });
escalationLogSchema.index({ tb_case_number: 1 });
escalationLogSchema.index({ barangay_id: 1 });
escalationLogSchema.index({ level: 1 });
escalationLogSchema.index({ resolved: 1 });

// ── Static: get all unresolved escalations for a barangay ───
escalationLogSchema.statics.getUnresolvedByBarangay = function (barangay_id) {
  return this.find({ barangay_id, resolved: false }).sort({ triggered_at: -1 });
};

// ── Static: get active escalation level for a patient ───────
escalationLogSchema.statics.getActiveForPatient = function (patient_id) {
  return this.findOne({ patient_id, resolved: false }).sort({ level: -1 });
};

// ── Method: acknowledge ──────────────────────────────────────
escalationLogSchema.methods.acknowledge = function (user_id, notes = '') {
  this.acknowledged_by = user_id;
  this.acknowledged_at = new Date();
  this.acknowledgement_notes = notes;
  return this.save();
};

// ── Method: resolve ──────────────────────────────────────────
escalationLogSchema.methods.resolve = function (notes = '') {
  this.resolved = true;
  this.resolved_at = new Date();
  this.resolution_notes = notes;
  return this.save();
};

module.exports = mongoose.model('EscalationLog', escalationLogSchema);