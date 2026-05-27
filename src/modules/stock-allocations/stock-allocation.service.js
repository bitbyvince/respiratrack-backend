import StockAllocation from "../../models/StockAllocation.model.js";
import Inventory from "../../models/Inventory.model.js";
import { generateAllocationId } from "../../utils/caseNumberGenerator.js";
import { ApiError } from "../../utils/apiResponse.js";

export const allocateStock = async (payload, allocatedBy) => {
  const {
    barangay_id,
    health_center_id,
    drug_name,
    strength,
    unit,
    quantity_allocated,
    allocation_date,
    notes,
  } = payload;

  const allocation_id = await generateAllocationId();

  const allocation = await StockAllocation.create({
    allocation_id,
    barangay_id,
    health_center_id,
    allocated_by: allocatedBy,
    drug_name,
    strength,
    unit,
    quantity_allocated,
    allocation_date: allocation_date ?? new Date(),
    notes: notes ?? "",
  });

  const inventoryDoc = await Inventory.findOneAndUpdate(
    { barangay_id, drug_name, strength },
    {
      $inc: {
        total_allocated: quantity_allocated,
        remaining_stock: quantity_allocated,
      },
      $set: { health_center_id, unit, last_updated_at: new Date() },
      $setOnInsert: {
        total_dispensed: 0,
        active_patients_on_this_drug: 0,
        stock_status: "OK",
      },
    },
    { upsert: true, new: true },
  );

  await recomputeStockStatus(inventoryDoc._id);
  return allocation;
};

export const getAllocations = async ({
  barangay_id,
  drug_name,
  from,
  to,
  page,
  limit,
}) => {
  const filter = {};
  if (barangay_id) filter.barangay_id = barangay_id;
  if (drug_name) filter.drug_name = drug_name;
  if (from || to) {
    filter.allocation_date = {};
    if (from) filter.allocation_date.$gte = new Date(from);
    if (to) filter.allocation_date.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;
  const total = await StockAllocation.countDocuments(filter);
  const data = await StockAllocation.find(filter)
    .sort({ allocation_date: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return { total, page, limit, data };
};

export const getAllocationById = async (allocation_id) => {
  const allocation = await StockAllocation.findOne({ allocation_id }).lean();
  if (!allocation) throw new ApiError(404, "Allocation not found");
  return allocation;
};

export const getAllocationSummaryByBarangay = async (barangay_id) => {
  return StockAllocation.aggregate([
    { $match: { barangay_id } },
    {
      $group: {
        _id: { drug_name: "$drug_name", strength: "$strength" },
        total_allocated: { $sum: "$quantity_allocated" },
        allocation_count: { $sum: 1 },
        last_allocated_at: { $max: "$allocation_date" },
      },
    },
    { $sort: { "_id.drug_name": 1 } },
  ]);
};

const recomputeStockStatus = async (inventoryId) => {
  const inv = await Inventory.findById(inventoryId);
  if (!inv) return;

  const dailyUsage = inv.active_patients_on_this_drug || 1;
  const daysLeft = Math.floor(inv.remaining_stock / dailyUsage);

  let stock_status;
  if (inv.remaining_stock <= 0 || daysLeft <= 6) stock_status = "Stockout";
  else if (daysLeft <= 14) stock_status = "Critical";
  else if (daysLeft <= 30) stock_status = "Low";
  else stock_status = "OK";

  await Inventory.findByIdAndUpdate(inventoryId, { $set: { stock_status } });
};
