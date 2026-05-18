import express from "express";
import { body, param, validationResult } from "express-validator";

import MedicineStock from "../models/MedicineStock.js";
import StockAllocation from "../models/StockAllocation.js";
import StockDispensing from "../models/StockDispensing.js";
import Patient from "../models/Patient.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import { sendLowStockAlert } from "../services/firebase.service.js";
import { getFcmToken } from "../services/firebase.service.js";

const router = express.Router();

// All inventory routes require authentication
router.use(verifyToken);

const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res
      .status(400)
      .json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
};

// Low stock threshold — trigger alert when remaining stock falls below this
const LOW_STOCK_THRESHOLD = 50;

// =============================================================================
// MEDICINE STOCK
// =============================================================================

/**
 * GET /api/inventory/stock
 * Super admin: get all barangay stocks
 * Barangay admin / nurse: get only their barangay's stock
 */
router.get(
  "/stock",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;

      let query = {};
      if (role === "barangay_admin" || role === "nurse") {
        query.barangay_id = barangay_id;
      }

      const stocks = await MedicineStock.find(query)
        .populate("barangay_id", "name municipality")
        .sort({ stock_status: 1 });

      res.json({ stocks });
    } catch (err) {
      console.error("Get stock error:", err);
      res.status(500).json({ message: "Server error fetching stock." });
    }
  },
);

/**
 * GET /api/inventory/stock/:barangay_id
 * Get stock details for a specific barangay
 */
router.get(
  "/stock/:barangay_id",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const stock = await MedicineStock.findOne({
        barangay_id: req.params.barangay_id,
      }).populate("barangay_id", "name municipality province");

      if (!stock) {
        return res
          .status(404)
          .json({ message: "No stock record found for this barangay." });
      }

      res.json({ stock });
    } catch (err) {
      console.error("Get barangay stock error:", err);
      res
        .status(500)
        .json({ message: "Server error fetching barangay stock." });
    }
  },
);

// =============================================================================
// STOCK ALLOCATION — Super Admin allocates medicine to a barangay
// =============================================================================

/**
 * GET /api/inventory/allocations
 * Super admin: get all allocations
 * Barangay admin: get allocations for their barangay only
 */
router.get(
  "/allocations",
  authorizeRoles("super_admin", "barangay_admin"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;

      let query = {};
      if (role === "barangay_admin") query.barangay_id = barangay_id;

      const allocations = await StockAllocation.find(query)
        .populate("barangay_id", "name municipality")
        .populate("allocated_by", "email")
        .sort({ allocation_date: -1 });

      res.json({ allocations });
    } catch (err) {
      console.error("Get allocations error:", err);
      res.status(500).json({ message: "Server error fetching allocations." });
    }
  },
);

/**
 * POST /api/inventory/allocations
 * Super admin allocates medicine quantity to a barangay.
 * Automatically updates the MedicineStock record for that barangay.
 */
router.post(
  "/allocations",
  authorizeRoles("super_admin"),
  [
    body("barangay_id").notEmpty().withMessage("Barangay ID is required"),
    body("quantity")
      .isInt({ min: 1 })
      .withMessage("Quantity must be a positive integer"),
    body("allocation_date")
      .optional()
      .isISO8601()
      .withMessage("Allocation date must be a valid date"),
    body("notes").optional().trim(),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { barangay_id, quantity, allocation_date, notes } = req.body;

    try {
      // Create the allocation record
      const allocation = await StockAllocation.create({
        barangay_id,
        allocated_by: req.user.id,
        quantity: parseInt(quantity),
        allocation_date: allocation_date
          ? new Date(allocation_date)
          : new Date(),
        notes: notes || null,
      });

      // Update or create the MedicineStock record for this barangay
      const stock = await MedicineStock.findOneAndUpdate(
        { barangay_id },
        {
          $inc: {
            total_allocated: parseInt(quantity),
            remaining_stock: parseInt(quantity),
          },
          last_updated: new Date(),
        },
        { upsert: true, new: true },
      );

      // Recalculate stock status after update
      stock.stock_status = getStockStatus(stock.remaining_stock);
      await stock.save();

      res.status(201).json({
        message: `Successfully allocated ${quantity} units to barangay.`,
        allocation,
        updated_stock: stock,
      });
    } catch (err) {
      console.error("Create allocation error:", err);
      res.status(500).json({ message: "Server error creating allocation." });
    }
  },
);

// =============================================================================
// STOCK DISPENSING — Nurse dispenses medicine to a patient
// =============================================================================

/**
 * GET /api/inventory/dispensings
 * Get dispensing records.
 * Nurse / barangay_admin: see only their barangay's records.
 * Super admin: see all.
 */
router.get(
  "/dispensings",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;

      let query = {};
      if (role === "barangay_admin" || role === "nurse") {
        query.barangay_id = barangay_id;
      }

      const dispensings = await StockDispensing.find(query)
        .populate("patient_id", "full_name zone")
        .populate("barangay_id", "name municipality")
        .sort({ dispensed_date: -1 });

      res.json({ dispensings });
    } catch (err) {
      console.error("Get dispensings error:", err);
      res.status(500).json({ message: "Server error fetching dispensings." });
    }
  },
);

/**
 * GET /api/inventory/dispensings/patient/:patient_id
 * Get all dispensing records for a specific patient
 */
router.get(
  "/dispensings/patient/:patient_id",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const dispensings = await StockDispensing.find({
        patient_id: req.params.patient_id,
      }).sort({ dispensed_date: -1 });

      res.json({ dispensings });
    } catch (err) {
      console.error("Get patient dispensings error:", err);
      res
        .status(500)
        .json({ message: "Server error fetching patient dispensings." });
    }
  },
);

/**
 * POST /api/inventory/dispensings
 * Nurse records medicine dispensed to a patient.
 * Automatically:
 *   - Deducts from MedicineStock.remaining_stock
 *   - Updates Patient.remaining_doses
 *   - Triggers low stock alert if stock falls below threshold
 */
router.post(
  "/dispensings",
  authorizeRoles("nurse", "barangay_admin"),
  [
    body("patient_id").notEmpty().withMessage("Patient ID is required"),
    body("quantity_dispensed")
      .isInt({ min: 1 })
      .withMessage("Quantity must be a positive integer"),
    body("dispensed_date")
      .optional()
      .isISO8601()
      .withMessage("Dispensed date must be a valid date"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { patient_id, quantity_dispensed, dispensed_date } = req.body;
    const { barangay_id } = req.user;

    try {
      // Verify patient exists and belongs to this barangay
      const patient = await Patient.findOne({ _id: patient_id, barangay_id });
      if (!patient) {
        return res
          .status(404)
          .json({ message: "Patient not found in your barangay." });
      }

      // Check if there is enough stock
      const stock = await MedicineStock.findOne({ barangay_id });
      if (!stock || stock.remaining_stock < quantity_dispensed) {
        return res.status(400).json({
          message:
            "Insufficient stock. Please request an allocation from the super admin.",
          remaining_stock: stock ? stock.remaining_stock : 0,
        });
      }

      // Create dispensing record
      const dispensing = await StockDispensing.create({
        patient_id,
        barangay_id,
        quantity_dispensed: parseInt(quantity_dispensed),
        dispensed_date: dispensed_date ? new Date(dispensed_date) : new Date(),
      });

      // Deduct from stock
      stock.total_dispensed += parseInt(quantity_dispensed);
      stock.remaining_stock -= parseInt(quantity_dispensed);
      stock.stock_status = getStockStatus(stock.remaining_stock);
      stock.last_updated = new Date();
      await stock.save();

      // Update patient's remaining doses
      patient.remaining_doses = Math.max(
        0,
        patient.remaining_doses - parseInt(quantity_dispensed),
      );
      await patient.save();

      // Trigger low stock alert if threshold crossed
      if (stock.remaining_stock <= LOW_STOCK_THRESHOLD) {
        try {
          const adminToken = await getFcmToken(String(req.user.id));
          if (adminToken) {
            await sendLowStockAlert(
              adminToken,
              "TB Medicine",
              stock.remaining_stock,
            );
          }
        } catch (alertErr) {
          console.error(
            "Low stock alert error (non-blocking):",
            alertErr.message,
          );
        }
      }

      res.status(201).json({
        message: `Successfully dispensed ${quantity_dispensed} units to ${patient.full_name}.`,
        dispensing,
        updated_stock: {
          remaining_stock: stock.remaining_stock,
          stock_status: stock.stock_status,
        },
      });
    } catch (err) {
      console.error("Create dispensing error:", err);
      res.status(500).json({ message: "Server error recording dispensing." });
    }
  },
);

// =============================================================================
// SUMMARY — Overview for dashboard
// =============================================================================

/**
 * GET /api/inventory/summary
 * Returns a stock summary for the dashboard.
 * Super admin: system-wide totals across all barangays.
 * Barangay admin / nurse: their barangay only.
 */
router.get(
  "/summary",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;

      if (role === "super_admin") {
        // System-wide summary
        const stocks = await MedicineStock.find({});
        const summary = {
          total_barangays: stocks.length,
          total_allocated: stocks.reduce(
            (sum, s) => sum + s.total_allocated,
            0,
          ),
          total_dispensed: stocks.reduce(
            (sum, s) => sum + s.total_dispensed,
            0,
          ),
          total_remaining: stocks.reduce(
            (sum, s) => sum + s.remaining_stock,
            0,
          ),
          by_status: {
            adequate: stocks.filter((s) => s.stock_status === "Adequate")
              .length,
            low: stocks.filter((s) => s.stock_status === "Low").length,
            critical: stocks.filter((s) => s.stock_status === "Critical")
              .length,
            out_of_stock: stocks.filter(
              (s) => s.stock_status === "Out of Stock",
            ).length,
          },
        };
        return res.json({ summary });
      }

      // Barangay-level summary
      const stock = await MedicineStock.findOne({ barangay_id });
      if (!stock) {
        return res.json({
          summary: {
            total_allocated: 0,
            total_dispensed: 0,
            remaining_stock: 0,
            stock_status: "Out of Stock",
          },
        });
      }

      res.json({
        summary: {
          total_allocated: stock.total_allocated,
          total_dispensed: stock.total_dispensed,
          remaining_stock: stock.remaining_stock,
          stock_status: stock.stock_status,
          last_updated: stock.last_updated,
        },
      });
    } catch (err) {
      console.error("Inventory summary error:", err);
      res
        .status(500)
        .json({ message: "Server error fetching inventory summary." });
    }
  },
);

// =============================================================================
// HELPER
// =============================================================================

const getStockStatus = (remaining) => {
  if (remaining <= 0) return "Out of Stock";
  if (remaining <= 20) return "Critical";
  if (remaining <= 50) return "Low";
  return "Adequate";
};

export default router;
