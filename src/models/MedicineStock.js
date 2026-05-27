import mongoose from "mongoose";

const medicineStockSchema = new mongoose.Schema(
  {
    barangay_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      required: true,
    },

    total_allocated: {
      type: Number,
      min: 0,
      default: 0,
    },

    total_dispensed: {
      type: Number,
      min: 0,
      default: 0,
    },

    remaining_stock: {
      type: Number,
      min: 0,
      default: 0,
    },

    stock_status: {
      type: String,
      enum: ["Adequate", "Low", "Critical", "Out of Stock"],
      default: "Adequate",
    },

    last_updated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

// Indexes matching the MongoDB setup script
medicineStockSchema.index({ barangay_id: 1 }, { unique: true });
medicineStockSchema.index({ stock_status: 1 });

const MedicineStock = mongoose.model(
  "MedicineStock",
  medicineStockSchema,
  "medicine_stocks",
);
export default MedicineStock;
