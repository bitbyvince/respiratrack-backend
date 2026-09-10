import mongoose from 'mongoose';

// ============================================================
// HeatmapSnapshot Model
// Pre-computed per-barangay heatmap data
// Rebuilt nightly by heatmapSnapshot.job.js
// Clickable zone on dashboard → sidebar panel
// heat_intensity = 1 - (compliance_rate / 100)
// ============================================================

const escalationCountsSchema = new mongoose.Schema(
  {
    level_1: { type: Number, default: 0, min: 0 },
    level_2: { type: Number, default: 0, min: 0 },
    level_3: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const heatmapSnapshotSchema = new mongoose.Schema(
  {
    

    snapshot_date: {
      type: Date,
      required: true,
    },

    period: {
      type: String,
      required: true,
      enum: ['daily', 'monthly', 'all_time'],
      default: 'monthly',
    },

    // ── Barangay Reference ───────────────────────────────────
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
      // Denormalized for fast map rendering
    },

    // ── Health Center Reference ───────────────────────────────
    // A barangay can have more than one health center, so the snapshot
    // is scoped to ONE specific facility, not the whole barangay —
    // this is the field the unique index is built on.
    health_center_id: {
      type: String,
      required: true,
      trim: true,
    },

    health_center_name: {
      type: String,
      required: true,
      trim: true,
      // Denormalized — shown in sidebar panel on click
    },

    // ── Geospatial ───────────────────────────────────────────
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
    },

    boundary_geojson: {
      type: {
        type: String,
        enum: ['Polygon'],
        required: true,
        default: 'Polygon',
      },
      coordinates: {
        type: [[[Number]]], // GeoJSON Polygon ring
        required: true,
      },
    },

    // ── Case Metrics ─────────────────────────────────────────
    active_cases: {
      type: Number,
      required: true,
      min: 0,
    },

    compliance_rate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      // compliant_count / active_cases * 100
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

    escalation_counts: {
      type: escalationCountsSchema,
      default: () => ({ level_1: 0, level_2: 0, level_3: 0 }),
    },

    // ── Inventory Signal ─────────────────────────────────────
    stock_status: {
      type: String,
      required: true,
      enum: ['OK', 'Low', 'Critical', 'Stockout'],
      default: 'OK',
      // Worst stock_status across all drugs in this barangay
    },

    // ── Heatmap Values ───────────────────────────────────────
    heat_intensity: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
      // 1 - (compliance_rate / 100)
      // 0.0 = fully compliant (cool), 1.0 = no compliance (hot)
    },

    risk_level: {
      type: String,
      required: true,
      enum: ['low', 'moderate', 'high', 'critical'],
      // low      → compliance >= 90%
      // moderate → compliance >= 75%
      // high     → compliance >= 60%
      // critical → compliance <  60%
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false, // Snapshots are immutable
    },
    collection: 'heatmap_snapshots',
  },
);

// ── Indexes ──────────────────────────────────────────────────
heatmapSnapshotSchema.index({ barangay_id: 1, period: 1, snapshot_date: -1 });
heatmapSnapshotSchema.index({ snapshot_date: -1 });
heatmapSnapshotSchema.index({ coordinates: '2dsphere' });
heatmapSnapshotSchema.index({ period: 1, snapshot_date: -1 });
heatmapSnapshotSchema.index({ health_center_id: 1, period: 1, snapshot_date: 1 }, { unique: true });

// ── Static: latest snapshot per period for all health centers ─
heatmapSnapshotSchema.statics.getLatestAll = function (period = 'monthly') {
  return this.aggregate([
    { $match: { period } },
    { $sort: { snapshot_date: -1 } },
    { $group: { _id: '$health_center_id', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
  ]);
};

// ── Static: latest snapshot for one health center ────────────
heatmapSnapshotSchema.statics.getLatestByHealthCenter = function (health_center_id, period = 'monthly') {
  return this.findOne({ health_center_id, period }).sort({ snapshot_date: -1 });
};

export default mongoose.model('HeatmapSnapshot', heatmapSnapshotSchema);