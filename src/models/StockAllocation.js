import mongoose from "mongoose";

const stockAllocationSchema = new mongoose.Schema(
  {
    barangay_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      required: true,
    },

    // The super_admin who performed the allocation
    allocated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SuperAdmin",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    allocation_date: {
      type: Date,
      required: true,
      default: Date.now,
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
  },
  {
    timestamps: false,
  },
);

// Indexes matching the MongoDB setup script
stockAllocationSchema.index({ barangay_id: 1 });
stockAllocationSchema.index({ allocation_date: -1 });
stockAllocationSchema.index({ allocated_by: 1 });

const StockAllocation = mongoose.model(
  "StockAllocation",
  stockAllocationSchema,
  "stock_allocations",
);
export default StockAllocation;
