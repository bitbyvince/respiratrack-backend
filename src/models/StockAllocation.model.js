import mongoose from 'mongoose';

const stockAllocationSchema = new mongoose.Schema(
  {
    allocation_id:    { type: String, required: true, unique: true },
    allocated_by:     { type: String, required: true }, // user_id of super_admin
    barangay_id:      { type: String, required: true },
    health_center_id: { type: String, required: true },

    drug_name: { type: String, required: true },
    strength:  { type: String, required: true },
    unit:      { type: String, required: true, default: 'tablet' },

    quantity_allocated: { type: Number, required: true, min: 1 },
    expiry_date:        { type: Date,   required: true },

    notes:        { type: String, default: '' },
    allocated_at: { type: Date,   required: true, default: Date.now },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

stockAllocationSchema.index({ barangay_id: 1, allocated_at: -1 });
stockAllocationSchema.index({ allocated_by: 1 });
stockAllocationSchema.index({ drug_name: 1 });

export default mongoose.model('StockAllocation', stockAllocationSchema);