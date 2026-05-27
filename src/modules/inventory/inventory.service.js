const Inventory = require("../../models/Inventory.model");
const DispensingRecord = require("../../models/DispensingRecord.model");
const Alert = require("../../models/Alert.model");
const Barangay = require("../../models/Barangay.model");
const { STOCK_STATUS } = require("../../constants/stockStatus");
const { ALERT_TYPES } = require("../../constants/alertTypes");
const { ROLES } = require("../../constants/roles");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Derives stock status from remaining stock vs active patients on the drug.
 * Thresholds (days of supply):
 *   OK       → >= 30 days remaining
 *   Low      → >= 14 days and < 30 days
 *   Critical → >= 7  days and < 14 days
 *   Stockout → < 7  days or 0 remaining
 *
 * Daily consumption = active_patients_on_this_drug * 1 tablet/day
 */
function deriveStockStatus(remainingStock, activePatientsOnDrug) {
  if (activePatientsOnDrug <= 0 || remainingStock <= 0) {
    return remainingStock <= 0 ? STOCK_STATUS.STOCKOUT : STOCK_STATUS.OK;
  }

  const daysRemaining = remainingStock / activePatientsOnDrug;

  if (daysRemaining >= 30) return STOCK_STATUS.OK;
  if (daysRemaining >= 14) return STOCK_STATUS.LOW;
  if (daysRemaining >= 7) return STOCK_STATUS.CRITICAL;
  return STOCK_STATUS.STOCKOUT;
}

/**
 * Estimates the date when stock will run out based on average daily
 * dispensing rate over the past 30 days.
 * Falls back to active_patients_on_this_drug if no dispensing history.
 *
 * @param {object} inventoryDoc
 * @param {number} avgDailyRate  - pre-computed average dispensing per day
 * @returns {Date|null}
 */
function estimateStockoutDate(inventoryDoc, avgDailyRate) {
  const rate =
    avgDailyRate > 0 ? avgDailyRate : inventoryDoc.active_patients_on_this_drug;

  if (!rate || rate <= 0) return null;

  const daysLeft = inventoryDoc.remaining_stock / rate;
  const stockoutDate = new Date();
  stockoutDate.setDate(stockoutDate.getDate() + Math.floor(daysLeft));
  return stockoutDate;
}

/**
 * Creates or updates a Low Stock / Stockout alert for a given inventory doc.
 * Resolves any existing alert if stock status returns to OK.
 */
async function syncStockAlert(inventoryDoc, resolvedByUserId = null) {
  const isProblematic =
    inventoryDoc.stock_status === STOCK_STATUS.LOW ||
    inventoryDoc.stock_status === STOCK_STATUS.CRITICAL ||
    inventoryDoc.stock_status === STOCK_STATUS.STOCKOUT;

  // Resolve existing active stock alert if status is back to OK
  if (!isProblematic) {
    await Alert.updateMany(
      {
        barangay_id: inventoryDoc.barangay_id,
        alert_type: ALERT_TYPES.LOW_STOCK,
        status: "Active",
        message: new RegExp(
          `${inventoryDoc.drug_name} ${inventoryDoc.strength}`,
          "i",
        ),
      },
      {
        $set: {
          status: "Resolved",
          resolved_at: new Date(),
          resolved_by: resolvedByUserId,
        },
      },
    );
    return;
  }

  const severity =
    inventoryDoc.stock_status === STOCK_STATUS.STOCKOUT ||
    inventoryDoc.stock_status === STOCK_STATUS.CRITICAL
      ? "Critical"
      : "Warning";

  const message =
    `${inventoryDoc.drug_name} ${inventoryDoc.strength} at ` +
    `${inventoryDoc.health_center_id} is ${inventoryDoc.stock_status.toLowerCase()} ` +
    `(${inventoryDoc.remaining_stock} tablets remaining).`;

  // Upsert: avoid duplicate active alerts for the same drug/barangay
  await Alert.findOneAndUpdate(
    {
      barangay_id: inventoryDoc.barangay_id,
      alert_type: ALERT_TYPES.LOW_STOCK,
      status: "Active",
      message: new RegExp(
        `${inventoryDoc.drug_name} ${inventoryDoc.strength}`,
        "i",
      ),
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
    { upsert: true },
  );
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * List inventory records with optional filters.
 * Super admin sees all barangays; others scoped to their own.
 */
async function listInventory({
  barangay_id,
  stock_status,
  drug_name,
  page,
  limit,
}) {
  const filter = {};
  if (barangay_id) filter.barangay_id = barangay_id;
  if (stock_status) filter.stock_status = stock_status;
  if (drug_name) filter.drug_name = new RegExp(drug_name, "i");

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    Inventory.find(filter)
      .sort({ barangay_id: 1, drug_name: 1 })
      .skip(skip)
      .limit(limit),
    Inventory.countDocuments(filter),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

/**
 * Fetch a single inventory record by inventory_id.
 */
async function getInventoryById(inventoryId) {
  const item = await Inventory.findOne({ inventory_id: inventoryId });
  if (!item) throw new Error("Inventory record not found");
  return item;
}

/**
 * Fetch full inventory grouped by barangay.
 * Used by super admin dashboard overview.
 */
async function getInventoryGroupedByBarangay(barangayId) {
  const filter = {};
  if (barangayId) filter.barangay_id = barangayId;

  const records = await Inventory.find(filter).sort({
    barangay_id: 1,
    drug_name: 1,
  });

  // Group into { barangay_id: [records] }
  const grouped = records.reduce((acc, rec) => {
    if (!acc[rec.barangay_id]) acc[rec.barangay_id] = [];
    acc[rec.barangay_id].push(rec);
    return acc;
  }, {});

  return grouped;
}

/**
 * Returns all inventory records where stock_status is not OK.
 * Optionally includes OK records when include_ok is true.
 */
async function getLowStockItems(barangayId, includeOk = false) {
  const filter = {};
  if (barangayId) filter.barangay_id = barangayId;
  if (!includeOk) {
    filter.stock_status = {
      $in: [STOCK_STATUS.LOW, STOCK_STATUS.CRITICAL, STOCK_STATUS.STOCKOUT],
    };
  }

  const items = await Inventory.find(filter).sort({ stock_status: -1 });
  return items;
}

/**
 * Recomputes stock_status for a given inventory doc and persists it.
 * Called internally after any stock-modifying operation.
 *
 * @param {string}  inventoryId
 * @param {string}  resolvedByUserId  - for alert resolution attribution
 * @returns {object} updated inventory doc
 */
async function recomputeStockStatus(inventoryId, resolvedByUserId = null) {
  const item = await Inventory.findOne({ inventory_id: inventoryId });
  if (!item) throw new Error("Inventory record not found");

  const newStatus = deriveStockStatus(
    item.remaining_stock,
    item.active_patients_on_this_drug,
  );

  item.stock_status = newStatus;
  item.last_updated_at = new Date();
  await item.save();

  // Sync alert state based on new status
  await syncStockAlert(item, resolvedByUserId);

  return item;
}

/**
 * Manual stock adjustment — positive to add, negative to deduct.
 * Used for corrections: damaged, expired, recount, returned stock.
 *
 * @param {string} inventoryId
 * @param {number} adjustment   - signed integer
 * @param {string} reason
 * @param {string} notes
 * @param {string} adjustedByUserId
 */
async function adjustStock(
  inventoryId,
  adjustment,
  reason,
  notes = "",
  adjustedByUserId,
) {
  const item = await Inventory.findOne({ inventory_id: inventoryId });
  if (!item) throw new Error("Inventory record not found");

  const newRemaining = item.remaining_stock + adjustment;
  if (newRemaining < 0) {
    throw new Error(
      `Adjustment would result in negative stock (current: ${item.remaining_stock}, adjustment: ${adjustment})`,
    );
  }

  item.remaining_stock = newRemaining;
  item.last_updated_at = new Date();
  await item.save();

  // Recompute and sync status + alerts
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

/**
 * Stockout prediction — estimates how many days until each drug runs out
 * based on average daily dispensing rate over the last 30 days.
 *
 * @param {string} barangayId       - optional filter
 * @param {number} daysThreshold    - only return items running out within N days
 */
async function getStockoutPredictions(barangayId, daysThreshold = 30) {
  const filter = {};
  if (barangayId) filter.barangay_id = barangayId;

  const items = await Inventory.find(filter);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const predictions = await Promise.all(
    items.map(async (item) => {
      // Sum dispensing quantity for this drug/barangay over last 30 days
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
    }),
  );

  // Filter to only items within the threshold and sort soonest first
  return predictions
    .filter(
      (p) =>
        p.days_until_stockout !== null &&
        p.days_until_stockout <= daysThreshold,
    )
    .sort((a, b) => a.days_until_stockout - b.days_until_stockout);
}

module.exports = {
  listInventory,
  getInventoryById,
  getInventoryGroupedByBarangay,
  getLowStockItems,
  recomputeStockStatus,
  adjustStock,
  getStockoutPredictions,
  deriveStockStatus, // exported for use in dispensing.service.js
  syncStockAlert, // exported for use in dispensing.service.js
};
