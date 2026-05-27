// ============================================================
// models/Barangay.js
// Covers: Web Super Admin — Barangay Page (Module 3)
//         Web Super Admin — Dashboard aggregated stats
//         Add 5 — Heatmap zone data per barangay
//
// The stats subdocument is recomputed on every on-login sweep
// and written back here so dashboards can read a single
// document instead of aggregating patients at runtime.
// ============================================================

import mongoose from "mongoose";

const { Schema, model } = mongoose;

// ── Sub-schemas ────────────────────────────────────────────

const HealthCenterSchema = new Schema(
  {
    health_center_id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    contact_number: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^(\+63|0)9\d{9}$/,
        "contact_number must be a valid PH mobile number.",
      ],
    },
  },
  { _id: false },
);

// GeoJSON Point — used for heatmap centroid marker
const PointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
      default: "Point",
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr) =>
          arr.length === 2 &&
          arr[0] >= -180 &&
          arr[0] <= 180 && // longitude
          arr[1] >= -90 &&
          arr[1] <= 90, // latitude
        message: "coordinates must be [longitude, latitude] with valid ranges.",
      },
      // [longitude, latitude] — GeoJSON order
      // e.g. [120.9842, 14.5995]
    },
  },
  { _id: false },
);

// GeoJSON Polygon — used for heatmap zone boundary
// Add 5: clicking the zone on the map queries this polygon
const PolygonSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["Polygon"],
      required: true,
      default: "Polygon",
    },
    // Array of linear rings; first ring = outer boundary
    // Each coordinate pair is [longitude, latitude]
    // First and last coordinate must be identical (closed ring)
    coordinates: {
      type: [[[Number]]],
      required: true,
    },
  },
  { _id: false },
);

// Aggregated stats sub-document
// Recomputed on every on-login sweep by the escalation service
// Also updated whenever a patient's compliance status changes
const StatsSchema = new Schema(
  {
    total_patients: {
      type: Number,
      default: 0,
      min: 0,
    },
    active_patients: {
      type: Number,
      default: 0,
      min: 0,
    },
    compliant_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    at_risk_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    defaulter_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    compliance_percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // Add 5: drives heatmap color intensity
    // Formula: 1 - (compliance_percentage / 100)
    // 0.0 = all compliant (cool), 1.0 = all defaulters (hot)
    heat_intensity: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },

    // Derived from compliance_percentage + defaulter_count
    risk_level: {
      type: String,
      enum: ["low", "moderate", "high", "critical"],
      default: "low",
      // low      — compliance >= 90%
      // moderate — compliance 75–89%
      // high     — compliance 60–74%
      // critical — compliance < 60% or any Level 3 escalation active
    },

    // Escalation breakdown — shown in Add 5 heatmap sidebar
    escalation_counts: {
      level_1: { type: Number, default: 0, min: 0 },
      level_2: { type: Number, default: 0, min: 0 },
      level_3: { type: Number, default: 0, min: 0 },
    },

    // Medicine stock status for the heatmap sidebar
    stock_status: {
      type: String,
      enum: ["OK", "Low", "Critical", "Stockout"],
      default: "OK",
    },

    // Timestamp of the last sweep that updated these stats
    last_computed: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

// ── Main schema ────────────────────────────────────────────

const BarangaySchema = new Schema(
  {
    // ── Identifiers ──────────────────────────────────────
    barangay_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: "BRG-{3-digit-seq}"  e.g. "BRG-001"
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      // e.g. "Barangay Maliwanag"
    },

    municipality: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      // e.g. "San Isidro"
    },

    province: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      // e.g. "Nueva Ecija"
    },

    // Province code used in TB case number generation
    // "PHNT-{province_code}-{municipality_code}-{regimen}{year}-{seq}"
    province_code: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{4}$/, "province_code must be a 4-digit string e.g. '1304'."],
      // e.g. "1304" for Nueva Ecija
    },

    // Municipality code used in TB case number generation
    municipality_code: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^\d{3}$/,
        "municipality_code must be a 3-digit string e.g. '071'.",
      ],
      // e.g. "071" for San Isidro
    },

    // ── Health center ─────────────────────────────────────
    health_center: {
      type: HealthCenterSchema,
      required: true,
    },

    // ── Geospatial data ───────────────────────────────────
    // Centroid point — used for proximity queries and map marker
    coordinates: {
      type: PointSchema,
      required: true,
    },

    // Zone boundary polygon — used for heatmap rendering
    // and Add 5 click-to-sidebar zone detection
    boundary_geojson: {
      type: PolygonSchema,
      required: true,
    },

    // ── Aggregated stats ──────────────────────────────────
    // Recomputed by the on-login sweep service
    // Do NOT update this manually — let the sweep service own it
    stats: {
      type: StatsSchema,
      default: () => ({}),
    },

    // ── Status ────────────────────────────────────────────
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    collection: "barangays",
  },
);

// ── Indexes ────────────────────────────────────────────────
// 2dsphere index on centroid for proximity queries and heatmap
BarangaySchema.index({ coordinates: "2dsphere" });

// Risk level filter — super admin barangay page
BarangaySchema.index({ "stats.risk_level": 1 });

// Compliance sort — barangay comparison reports
BarangaySchema.index({ "stats.compliance_percentage": -1 });

// Province + municipality lookup for TB case number generation
BarangaySchema.index({ province_code: 1, municipality_code: 1 });

// Active barangay listing
BarangaySchema.index({ is_active: 1 });

// ── Pre-save hook ──────────────────────────────────────────
// Auto-derive heat_intensity and risk_level from
// compliance_percentage whenever stats are updated
BarangaySchema.pre("save", function (next) {
  if (this.isModified("stats.compliance_percentage")) {
    const pct = this.stats.compliance_percentage ?? 0;

    // heat_intensity: inverse of compliance (0.0 = fully compliant)
    this.stats.heat_intensity = parseFloat((1 - pct / 100).toFixed(4));

    // risk_level thresholds
    if (pct >= 90) {
      this.stats.risk_level = "low";
    } else if (pct >= 75) {
      this.stats.risk_level = "moderate";
    } else if (pct >= 60) {
      this.stats.risk_level = "high";
    } else {
      this.stats.risk_level = "critical";
    }
  }
  next();
});

// ── Virtuals ───────────────────────────────────────────────
// Full location string for display
BarangaySchema.virtual("full_location").get(function () {
  return `${this.name}, ${this.municipality}, ${this.province}`;
});

// True if this barangay has any Level 3 escalations active
BarangaySchema.virtual("has_critical_escalation").get(function () {
  return (this.stats?.escalation_counts?.level_3 ?? 0) > 0;
});

// ── Static methods ─────────────────────────────────────────
// Fetch all active barangays sorted by risk for the super admin
// barangay page and heatmap
BarangaySchema.statics.getAllByRisk = function () {
  return this.find({ is_active: true }).sort({
    "stats.compliance_percentage": 1, // lowest compliance first (highest risk)
  });
};

// Fetch a single barangay's heatmap sidebar data (Add 5)
// Returns only the fields the sidebar panel needs
BarangaySchema.statics.getHeatmapSidebarData = function (barangayId) {
  return this.findOne(
    { barangay_id: barangayId, is_active: true },
    {
      barangay_id: 1,
      name: 1,
      municipality: 1,
      "health_center.name": 1,
      "health_center.contact_number": 1,
      "stats.active_patients": 1,
      "stats.compliance_percentage": 1,
      "stats.at_risk_count": 1,
      "stats.defaulter_count": 1,
      "stats.escalation_counts": 1,
      "stats.stock_status": 1,
      "stats.risk_level": 1,
      "stats.heat_intensity": 1,
      coordinates: 1,
    },
  ).lean();
};

// Generate the next TB case number for a new patient
// registered in this barangay
// Format: "PHNT-{province_code}-{municipality_code}-{prefix}{year}-{seq}"
BarangaySchema.statics.generateTBCaseNumber = async function (
  barangayId,
  isDrugResistant = false,
) {
  const barangay = await this.findOne(
    { barangay_id: barangayId },
    { province_code: 1, municipality_code: 1 },
  ).lean();

  if (!barangay) {
    throw new Error(`Barangay not found: ${barangayId}`);
  }

  const year = new Date().getFullYear().toString().slice(-2); // "26"
  const prefix = isDrugResistant ? "DR" : "S"; // "S" or "DR"
  const { province_code, municipality_code } = barangay;

  // Import Patient model here to avoid circular dependency
  const Patient = (await import("./Patient.js")).default;

  // Find the highest sequential number for this
  // province + municipality + year combination
  const pattern = new RegExp(
    `^PHNT-${province_code}-${municipality_code}-${prefix}${year}-\\d{4}$`,
  );

  const latest = await Patient.findOne(
    { tb_case_number: { $regex: pattern } },
    { tb_case_number: 1 },
  )
    .sort({ tb_case_number: -1 })
    .lean();

  let nextSeq = 1;
  if (latest?.tb_case_number) {
    const parts = latest.tb_case_number.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    nextSeq = lastSeq + 1;
  }

  const paddedSeq = String(nextSeq).padStart(4, "0");
  return `PHNT-${province_code}-${municipality_code}-${prefix}${year}-${paddedSeq}`;
};

// ── toJSON cleanup ─────────────────────────────────────────
BarangaySchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.id;
    return ret;
  },
});

const Barangay = model("Barangay", BarangaySchema);

export default Barangay;
