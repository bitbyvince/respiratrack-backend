import mongoose from "mongoose";

const stockDispensingSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    barangay_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Barangay",
      required: true,
    },

    quantity_dispensed: {
      type: Number,
      required: true,
      min: 1,
    },

    dispensed_date: {
      type: Date,
      required: true,
      default: Date.now,
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
stockDispensingSchema.index({ patient_id: 1 });
stockDispensingSchema.index({ barangay_id: 1 });
stockDispensingSchema.index({ dispensed_date: -1 });

const StockDispensing = mongoose.model(
  "StockDispensing",
  stockDispensingSchema,
  "stock_dispensings",
);
export default StockDispensing;
