const mongoose = require('mongoose');

// ============================================================
// Inventory Model
// Per-barangay medicine stock — one document per drug per barangay
// remaining_stock is decremented on each DispensingRecord write
// (handled in dispensing.service.js via session/transaction)
// stock_status is recomputed by stockoutPrediction.job.js nightly
// ============================================================

const inventorySchema = new mongoose.Schema(
  {
    inventory_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: INV-XXXX
    },

    // ── Location ─────────────────────────────────────────────
    barangay_id: {
      type: String,
      required: true,
      trim: true,
      ref: 'Barangay',
    },

    health_center_id: {
      type: String,
      required: true,
      trim: true,
      // Denormalized from Barangay
    },

    // ── Drug Identity ────────────────────────────────────────
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

    // ── Stock Counters ───────────────────────────────────────
    total_allocated: {
      type: Number,
      required: true,
      min: 0,
      // Cumulative total received from all StockAllocations
    },

    total_dispensed: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      // Cumulative total dispensed via DispensingRecords
    },

    remaining_stock: {
      type: Number,
      required: true,
      min: 0,
      // total_allocated - total_dispensed
      // Decremented atomically on each dispense
    },

    // ── Patient Load ─────────────────────────────────────────
    active_patients_on_this_drug: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      // Used by stockoutEstimator to calculate daily burn rate
    },

    // ── Expiry ───────────────────────────────────────────────
    expiry_date: {
      type: Date,
      required: true,
    },

    // ── Stock Status ─────────────────────────────────────────
    stock_status: {
      type: String,
      required: true,
      enum: ['OK', 'Low', 'Critical', 'Stockout'],
      default: 'OK',
      // Recomputed nightly by stockoutPrediction.job.js
      // OK       → remaining_stock > low_threshold
      // Low      → remaining_stock <= low_threshold (e.g. 30-day supply)
      // Critical → remaining_stock <= critical_threshold (e.g. 14-day supply)
      // Stockout → remaining_stock === 0
    },

    // ── Estimated Stockout ───────────────────────────────────
    estimated_stockout_date: {
      type: Date,
      default: null,
      // Computed by stockoutEstimator.js:
      // remaining_stock / avg_daily_dispensing_rate
    },

    // ── Timestamps ───────────────────────────────────────────
    last_dispensed_at: {
      type: Date,
      default: null,
    },

    last_updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    collection: 'medicine_inventory',
  }
);

// ── Indexes ──────────────────────────────────────────────────
// One document per drug per barangay — enforced
inventorySchema.index(
  { barangay_id: 1, drug_name: 1, strength: 1 },
  { unique: true }
);
inventorySchema.index({ barangay_id: 1 });
inventorySchema.index({ stock_status: 1 });
inventorySchema.index({ estimated_stockout_date: 1 });

// ── Pre-save: auto-compute stock_status ──────────────────────
inventorySchema.pre('save', function (next) {
  if (this.isModified('remaining_stock')) {
    const dailyRate = this.active_patients_on_this_drug || 1;

    if (this.remaining_stock === 0) {
      this.stock_status = 'Stockout';
    } else if (this.remaining_stock <= dailyRate * 14) {
      this.stock_status = 'Critical';
    } else if (this.remaining_stock <= dailyRate * 30) {
      this.stock_status = 'Low';
    } else {
      this.stock_status = 'OK';
    }

    this.last_updated_at = new Date();
  }
  next();
});

// ── Method: dispense ─────────────────────────────────────────
// Call from dispensing.service.js inside a Mongoose session
inventorySchema.methods.dispense = function (quantity) {
  if (quantity > this.remaining_stock) {
    throw new Error(
      `Insufficient stock: requested ${quantity}, available ${this.remaining_stock}`
    );
  }
  this.total_dispensed  += quantity;
  this.remaining_stock  -= quantity;
  this.last_dispensed_at = new Date();
  return this.save();
};

// ── Method: restock (called after StockAllocation) ───────────
inventorySchema.methods.restock = function (quantity) {
  this.total_allocated += quantity;
  this.remaining_stock += quantity;
  return this.save();
};

// ── Static: all critical/stockout items across system ────────
inventorySchema.statics.getCriticalItems = function () {
  return this.find({ stock_status: { $in: ['Critical', 'Stockout'] } }).sort({
    remaining_stock: 1,
  });
};

// ── Static: all items for a barangay ────────────────────────
inventorySchema.statics.getByBarangay = function (barangay_id) {
  return this.find({ barangay_id }).sort({ drug_name: 1 });
};

module.exports = mongoose.model('Inventory', inventorySchema);