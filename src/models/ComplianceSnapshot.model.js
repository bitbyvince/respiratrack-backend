const mongoose = require('mongoose');

// ============================================================
// ComplianceSnapshot Model
// Daily barangay-level snapshot — powers trend graphs
// Generated nightly by complianceSnapshot.job.js
// ============================================================

const complianceSnapshotSchema = new mongoose.Schema(
  {
    snapshot_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: SNAP-XXXX
    },

    snapshot_date: {
      type: Date,
      required: true,
    },

    barangay_id: {
      type: String,
      required: true,
      trim: true,
      ref: 'Barangay',
    },

    barangay_name: {
      type: String,
      required: true,
      trim: true,
      // Denormalized for fast read — avoid joins on trend graphs
    },

    // ── Patient Counts ──────────────────────────────────────
    total_patients: {
      type: Number,
      required: true,
      min: 0,
    },

    compliant_count: {
      type: Number,
      required: true,
      min: 0,
    },

    at_risk_count: {
      type: Number,
      required: true,
      min: 0,
    },

    defaulter_count: {
      type: Number,
      required: true,
      min: 0,
    },

    // ── Computed Metrics ────────────────────────────────────
    compliance_percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      // compliant_count / total_patients * 100
    },

    average_risk_score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      // Average of all patient risk_score.score in this barangay
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false, // Snapshots are immutable once created
    },
    collection: 'compliance_snapshots',
  }
);

// ── Indexes ─────────────────────────────────────────────────
complianceSnapshotSchema.index({ barangay_id: 1, snapshot_date: -1 });
complianceSnapshotSchema.index({ snapshot_date: -1 });
complianceSnapshotSchema.index(
  { barangay_id: 1, snapshot_date: 1 },
  { unique: true }
);

// ── Virtual: risk_level ──────────────────────────────────────
complianceSnapshotSchema.virtual('risk_level').get(function () {
  if (this.compliance_percentage >= 90) return 'low';
  if (this.compliance_percentage >= 75) return 'moderate';
  if (this.compliance_percentage >= 60) return 'high';
  return 'critical';
});

// ── Static: latest snapshot per barangay ────────────────────
complianceSnapshotSchema.statics.getLatestByBarangay = function (barangay_id) {
  return this.findOne({ barangay_id }).sort({ snapshot_date: -1 });
};

// ── Static: date range query for trend graphs ────────────────
complianceSnapshotSchema.statics.getRange = function (barangay_id, startDate, endDate) {
  return this.find({
    barangay_id,
    snapshot_date: { $gte: startDate, $lte: endDate },
  }).sort({ snapshot_date: 1 });
};

module.exports = mongoose.model('ComplianceSnapshot', complianceSnapshotSchema);