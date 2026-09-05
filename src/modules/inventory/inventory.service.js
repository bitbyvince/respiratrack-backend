import Inventory from "../../models/Inventory.model.js";
import DispensingRecord from "../../models/DispensingRecord.model.js";
import Patient from "../../models/Patient.model.js";
import Alert from "../../models/Alert.model.js";
import { ALERT_TYPES } from "../../constants/alertTypes.js";
import { ROLES } from "../../constants/roles.js";
import { generateInventoryPDF } from "../../utils/pdfExporter.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveStockStatus(remainingStock, activePatientsOnDrug) {
  if (activePatientsOnDrug <= 0 || remainingStock <= 0) {
    return remainingStock <= 0 ? "Stockout" : "OK";
  }

  const daysRemaining = remainingStock / activePatientsOnDrug;

  if (daysRemaining >= 30) return "OK";
  if (daysRemaining >= 14) return "Low";
  if (daysRemaining >= 7) return "Critical";
  return "Stockout";
}

function estimateStockoutDate(inventoryDoc, avgDailyRate) {
  const rate =
    avgDailyRate > 0 ? avgDailyRate : inventoryDoc.active_patients_on_this_drug;

  if (!rate || rate <= 0) return null;

  const daysLeft = inventoryDoc.remaining_stock / rate;
  const stockoutDate = new Date();
  stockoutDate.setDate(stockoutDate.getDate() + Math.floor(daysLeft));
  return stockoutDate;
}

async function syncStockAlert(inventoryDoc, resolvedByUserId = null) {
  const isProblematic =
    inventoryDoc.stock_status === "Low" ||
    inventoryDoc.stock_status === "Critical" ||
    inventoryDoc.stock_status === "Stockout";

  if (!isProblematic) {
    await Alert.updateMany(
      {
        barangay_id: inventoryDoc.barangay_id,
        alert_type: ALERT_TYPES.LOW_STOCK,
        status: "Active",
        message: new RegExp(`${inventoryDoc.drug_name} ${inventoryDoc.strength}`, "i"),
      },
      {
        $set: {
          status: "Resolved",
          resolved_at: new Date(),
          resolved_by: resolvedByUserId,
        },
      }
    );
    return;
  }

  const severity =
    inventoryDoc.stock_status === "Stockout" ||
    inventoryDoc.stock_status === "Critical"
      ? "Critical"
      : "Warning";

  const message =
    `${inventoryDoc.drug_name} ${inventoryDoc.strength} at ` +
    `${inventoryDoc.health_center_id} is ${inventoryDoc.stock_status.toLowerCase()} ` +
    `(${inventoryDoc.remaining_stock} tablets remaining).`;

  await Alert.findOneAndUpdate(
    {
      barangay_id: inventoryDoc.barangay_id,
      alert_type: ALERT_TYPES.LOW_STOCK,
      status: "Active",
      message: new RegExp(`${inventoryDoc.drug_name} ${inventoryDoc.strength}`, "i"),
    },
    {
      $setOnInsert: {
        patient_id: null,
        tb_case_number: null,
        escalation_level: 0,
        created_at: new Date(),
      },
      $set: {
        barangay_id: inventoryDoc.barangay_id,
        alert_type: ALERT_TYPES.LOW_STOCK,
        severity,
        message,
        status: "Active",
        target_roles: [ROLES.BARANGAY_ADMIN, ROLES.SUPER_ADMIN],
        resolved_at: null,
        resolved_by: null,
      },
    },
    { upsert: true }
  );
}

// ✅ New — live count of "On Treatment" patients per barangay+drug,
// keyed as "<barangay_id>::<drug_name>" so it works whether we're
// scoped to one barangay (barangay_admin) or all of them (super_admin).
async function computeActivePatientCounts(barangayId) {
  const match = { "treatment_outcome.status": "On Treatment" };
  if (barangayId) match.barangay_id = barangayId;

  const patients = await Patient.find(match).select("barangay_id drug_regimen.drug_name");

  const counts = {};
  for (const patient of patients) {
    const drugNames = new Set((patient.drug_regimen || []).map((entry) => entry.drug_name));
    for (const drugName of drugNames) {
      const key = `${patient.barangay_id}::${drugName}`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function listInventory({ barangay_id, stock_status, drug_name, page, limit }) {
  const filter = {};
  if (barangay_id) filter.barangay_id = barangay_id;
  if (stock_status) filter.stock_status = stock_status;
  if (drug_name) filter.drug_name = new RegExp(drug_name, "i");

  const skip = (page - 1) * limit;
  const [rawData, total] = await Promise.all([
    Inventory.find(filter).sort({ barangay_id: 1, drug_name: 1 }).skip(skip).limit(limit),
    Inventory.countDocuments(filter),
  ]);

  const activePatientCounts = await computeActivePatientCounts(barangay_id);

  const data = rawData.map((item) => {
    const obj = item.toObject();
    const key = `${item.barangay_id}::${item.drug_name}`;
    obj.active_patients_on_this_drug = activePatientCounts[key] || 0;
    return obj;
  });

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getInventoryById(inventoryId) {
  const item = await Inventory.findOne({ inventory_id: inventoryId });
  if (!item) throw new Error("Inventory record not found");
  return item;
}

export async function getInventoryGroupedByBarangay(barangayId) {
  const filter = {};
  if (barangayId) filter.barangay_id = barangayId;

  const records = await Inventory.find(filter).sort({ barangay_id: 1, drug_name: 1 });

  return records.reduce((acc, rec) => {
    if (!acc[rec.barangay_id]) acc[rec.barangay_id] = [];
    acc[rec.barangay_id].push(rec);
    return acc;
  }, {});
}

export async function getLowStockItems(barangayId, includeOk = false) {
  const filter = {};
  if (barangayId) filter.barangay_id = barangayId;
  if (!includeOk) {
    filter.stock_status = {
      $in: ["Low", "Critical", "Stockout"],
    };
  }

  return Inventory.find(filter).sort({ stock_status: -1 });
}

export async function recomputeStockStatus(inventoryId, resolvedByUserId = null) {
  const item = await Inventory.findOne({ inventory_id: inventoryId });
  if (!item) throw new Error("Inventory record not found");

  item.stock_status = deriveStockStatus(item.remaining_stock, item.active_patients_on_this_drug);
  item.last_updated_at = new Date();
  await item.save();

  await syncStockAlert(item, resolvedByUserId);

  return item;
}

export async function adjustStock(inventoryId, adjustment, reason, notes = "", adjustedByUserId) {
  const item = await Inventory.findOne({ inventory_id: inventoryId });
  if (!item) throw new Error("Inventory record not found");

  const newRemaining = item.remaining_stock + adjustment;
  if (newRemaining < 0) {
    throw new Error(
      `Adjustment would result in negative stock (current: ${item.remaining_stock}, adjustment: ${adjustment})`
    );
  }

  item.remaining_stock = newRemaining;
  item.last_updated_at = new Date();
  await item.save();

  const updated = await recomputeStockStatus(inventoryId, adjustedByUserId);

  return {
    inventory: updated,
    adjustment,
    reason,
    notes,
    adjusted_by: adjustedByUserId,
    adjusted_at: new Date(),
  };
}

export async function restockInventoryItem(inventoryId, quantityAdded, notes, restockedByUserId) {
  const item = await Inventory.findOne({ inventory_id: inventoryId });
  if (!item) throw new Error("Inventory record not found");

  item.total_allocated += quantityAdded;
  item.remaining_stock += quantityAdded;
  item.last_updated_at = new Date();

  await item.save(); // pre('save') hook recomputes stock_status

  await syncStockAlert(item, restockedByUserId);

  return {
    inventory: item,
    quantity_added: quantityAdded,
    notes: notes || "",
    restocked_by: restockedByUserId,
    restocked_at: new Date(),
  };
}

export async function getStockoutPredictions(barangayId, daysThreshold = 30) {
  const filter = {};
  if (barangayId) filter.barangay_id = barangayId;

  const items = await Inventory.find(filter);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const predictions = await Promise.all(
    items.map(async (item) => {
      const dispensingAgg = await DispensingRecord.aggregate([
        {
          $match: {
            barangay_id: item.barangay_id,
            drug_name: item.drug_name,
            strength: item.strength,
            dispense_date: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: null,
            total_dispensed: { $sum: "$quantity_dispensed" },
          },
        },
      ]);

      const totalDispensed30d = dispensingAgg[0]?.total_dispensed ?? 0;
      const avgDailyRate = totalDispensed30d / 30;
      const stockoutDate = estimateStockoutDate(item, avgDailyRate);
      const daysUntilStockout = stockoutDate
        ? Math.floor((stockoutDate - new Date()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        inventory_id: item.inventory_id,
        barangay_id: item.barangay_id,
        health_center_id: item.health_center_id,
        drug_name: item.drug_name,
        strength: item.strength,
        remaining_stock: item.remaining_stock,
        stock_status: item.stock_status,
        avg_daily_dispensing_rate: parseFloat(avgDailyRate.toFixed(2)),
        estimated_stockout_date: stockoutDate,
        days_until_stockout: daysUntilStockout,
      };
    })
  );

  return predictions
    .filter((p) => p.days_until_stockout !== null && p.days_until_stockout <= daysThreshold)
    .sort((a, b) => a.days_until_stockout - b.days_until_stockout);
}

export async function exportInventoryPdf(barangayId = null) {
  const grouped = await getInventoryGroupedByBarangay(barangayId);

  const groupedByBarangay = Object.entries(grouped).map(([barangay_id, drugs]) => ({
    barangay_id,
    drugs,
  }));

  return generateInventoryPDF({ grouped_by_barangay: groupedByBarangay });
}

// Named exports for use in dispensing.service.js
export { deriveStockStatus, syncStockAlert };