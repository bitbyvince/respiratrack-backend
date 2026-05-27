import express from "express";
import { body, validationResult } from "express-validator";

import Patient from "../models/Patient.js";
import TreatmentCalendar from "../models/TreatmentCalendar.js";
import ComplianceRecord from "../models/ComplianceRecord.js";
import Alert from "../models/Alert.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { authorizeRoles } from "../middleware/role.middleware.js";
import {
  sendMissedDoseAlert,
  getFcmToken,
} from "../services/firebase.service.js";

const router = express.Router();

// All patient routes require authentication
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

// =============================================================================
// GET ALL PATIENTS
// =============================================================================

/**
 * GET /api/patients
 * Super admin: all patients across all barangays
 * Barangay admin / nurse: only patients in their barangay
 * Supports filters: ?risk_level=Defaulter&phase=Intensive&search=Juan
 */
router.get(
  "/",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;
      const { risk_level, phase, adherence, search } = req.query;

      let filter = {};

      // Scope to barangay unless super admin
      if (role !== "super_admin") {
        filter.barangay_id = barangay_id;
      }

      if (risk_level) filter.risk_level = risk_level;
      if (phase) filter.phase = phase;
      if (adherence) filter.adherence = adherence;

      // Full-text search on full_name (uses text index)
      if (search) {
        filter.$text = { $search: search };
      }

      const patients = await Patient.find(filter)
        .populate("barangay_id", "name municipality")
        .populate("added_by_nurse", "full_name")
        .populate("added_by_admin", "full_name")
        .sort({ created_at: -1 });

      res.json({ count: patients.length, patients });
    } catch (err) {
      console.error("Get patients error:", err);
      res.status(500).json({ message: "Server error fetching patients." });
    }
  },
);

// =============================================================================
// GET SINGLE PATIENT
// =============================================================================

/**
 * GET /api/patients/:id
 * Get full patient details including latest compliance record
 */
router.get(
  "/:id",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const { role, barangay_id } = req.user;

      let filter = { _id: req.params.id };
      if (role !== "super_admin") filter.barangay_id = barangay_id;

      const patient = await Patient.findOne(filter)
        .populate("barangay_id", "name municipality province")
        .populate("added_by_nurse", "full_name email")
        .populate("added_by_admin", "full_name email");

      if (!patient) {
        return res.status(404).json({ message: "Patient not found." });
      }

      // Get latest compliance record
      const latestCompliance = await ComplianceRecord.findOne({
        patient_id: patient._id,
      }).sort({ calculated_at: -1 });

      res.json({ patient, latest_compliance: latestCompliance });
    } catch (err) {
      console.error("Get patient error:", err);
      res.status(500).json({ message: "Server error fetching patient." });
    }
  },
);

// =============================================================================
// CREATE PATIENT
// =============================================================================

/**
 * POST /api/patients
 * Nurse or barangay admin adds a new TB patient.
 * Automatically generates the treatment calendar for the full treatment duration.
 */
router.post(
  "/",
  authorizeRoles("nurse", "barangay_admin"),
  [
    body("full_name").trim().notEmpty().withMessage("Full name is required"),
    body("age")
      .isInt({ min: 0, max: 120 })
      .withMessage("Age must be between 0 and 120"),
    body("sex")
      .isIn(["Male", "Female", "Other"])
      .withMessage("Sex must be Male, Female, or Other"),
    body("zone").trim().notEmpty().withMessage("Zone is required"),
    body("tb_status")
      .isIn([
        "New",
        "Relapse",
        "Treatment After Failure",
        "Treatment After Loss to Follow-up",
        "Other",
      ])
      .withMessage("Invalid TB status"),
    body("diagnosis_date")
      .isISO8601()
      .withMessage("Diagnosis date must be a valid date"),
    body("phase")
      .isIn(["Intensive", "Continuation"])
      .withMessage("Phase must be Intensive or Continuation"),
    body("adherence")
      .isIn(["Regular", "Irregular"])
      .withMessage("Adherence must be Regular or Irregular"),
    body("total_doses")
      .isInt({ min: 1 })
      .withMessage("Total doses must be a positive integer"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { role, id: userId, barangay_id } = req.user;
    const {
      full_name,
      age,
      sex,
      zone,
      street,
      tb_status,
      diagnosis_date,
      phase,
      adherence,
      total_doses,
      notes,
    } = req.body;

    try {
      const patient = await Patient.create({
        barangay_id,
        added_by_nurse: role === "nurse" ? userId : null,
        added_by_admin: role === "barangay_admin" ? userId : null,
        full_name,
        age: parseInt(age),
        sex,
        zone,
        street: street || null,
        tb_status,
        diagnosis_date: new Date(diagnosis_date),
        phase,
        adherence,
        total_doses: parseInt(total_doses),
        remaining_doses: parseInt(total_doses),
        risk_level: "Compliant",
        notes: notes || null,
      });

      // Auto-generate one TreatmentCalendar entry per dose day
      const calendarEntries = generateCalendarEntries(
        patient._id,
        new Date(diagnosis_date),
        parseInt(total_doses),
      );

      if (calendarEntries.length > 0) {
        await TreatmentCalendar.insertMany(calendarEntries);
      }

      res.status(201).json({
        message: `Patient ${full_name} added successfully.`,
        patient,
        calendar_entries_created: calendarEntries.length,
      });
    } catch (err) {
      console.error("Create patient error:", err);
      res.status(500).json({ message: "Server error creating patient." });
    }
  },
);

// =============================================================================
// UPDATE PATIENT
// =============================================================================

/**
 * PUT /api/patients/:id
 * Update patient details.
 * Nurse and barangay admin can only update their barangay's patients.
 */
router.put(
  "/:id",
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  [
    body("age").optional().isInt({ min: 0, max: 120 }),
    body("sex").optional().isIn(["Male", "Female", "Other"]),
    body("phase").optional().isIn(["Intensive", "Continuation"]),
    body("adherence").optional().isIn(["Regular", "Irregular"]),
    body("risk_level").optional().isIn(["Compliant", "At Risk", "Defaulter"]),
    body("tb_status")
      .optional()
      .isIn([
        "New",
        "Relapse",
        "Treatment After Failure",
        "Treatment After Loss to Follow-up",
        "Other",
      ]),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const { role, barangay_id } = req.user;

      let filter = { _id: req.params.id };
      if (role !== "super_admin") filter.barangay_id = barangay_id;

      const allowedFields = [
        "full_name",
        "age",
        "sex",
        "zone",
        "street",
        "tb_status",
        "phase",
        "adherence",
        "risk_level",
        "remaining_doses",
        "notes",
      ];

      const updates = {};
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      });
      updates.updated_at = new Date();

      const patient = await Patient.findOneAndUpdate(
        filter,
        { $set: updates },
        { new: true },
      ).populate("barangay_id", "name municipality");

      if (!patient) {
        return res.status(404).json({ message: "Patient not found." });
      }

      res.json({ message: "Patient updated successfully.", patient });
    } catch (err) {
      console.error("Update patient error:", err);
      res.status(500).json({ message: "Server error updating patient." });
    }
  },
);

// =============================================================================
// DELETE PATIENT
// =============================================================================

/**
 * DELETE /api/patients/:id
 * Super admin only. Also removes all related records.
 */
router.delete("/:id", authorizeRoles("super_admin"), async (req, res) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found." });
    }

    // Clean up all related records
    await TreatmentCalendar.deleteMany({ patient_id: req.params.id });
    await ComplianceRecord.deleteMany({ patient_id: req.params.id });
    await Alert.deleteMany({ patient_id: req.params.id });

    res.json({
      message: `Patient ${patient.full_name} and all related records deleted.`,
    });
  } catch (err) {
    console.error("Delete patient error:", err);
    res.status(500).json({ message: "Server error deleting patient." });
  }
});

// =============================================================================
// TREATMENT CALENDAR
// =============================================================================

/**
 * GET /api/patients/:id/calendar
 * Get treatment calendar for a patient.
 * Optional filter: ?month=2026-05
 */
router.get(
  "/:id/calendar",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const { month } = req.query;

      let filter = { patient_id: req.params.id };

      if (month) {
        const start = new Date(`${month}-01`);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        filter.dose_date = { $gte: start, $lte: end };
      }

      const calendar = await TreatmentCalendar.find(filter).sort({
        dose_date: 1,
      });

      res.json({ count: calendar.length, calendar });
    } catch (err) {
      console.error("Get calendar error:", err);
      res.status(500).json({ message: "Server error fetching calendar." });
    }
  },
);

/**
 * PATCH /api/patients/:id/calendar/:date
 * Nurse marks a dose as taken or missed for a specific date (YYYY-MM-DD).
 * Automatically recalculates compliance and creates an alert if dose is missed.
 */
router.patch(
  "/:id/calendar/:date",
  authorizeRoles("nurse", "barangay_admin"),
  [
    body("dose_taken")
      .isBoolean()
      .withMessage("dose_taken must be true or false"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { id: patient_id, date } = req.params;
    const { dose_taken } = req.body;
    const { role, id: userId } = req.user;

    try {
      const doseDate = new Date(date);

      // Mark dose in calendar
      const entry = await TreatmentCalendar.findOneAndUpdate(
        { patient_id, dose_date: doseDate },
        {
          dose_taken,
          recorded_by: role,
          recorded_at: new Date(),
        },
        { new: true, upsert: true },
      );

      // Recalculate compliance
      const compliance = await recalculateCompliance(patient_id);

      // Create alert and push notification if dose was missed
      if (!dose_taken) {
        const patient = await Patient.findById(patient_id);

        await Alert.create({
          patient_id,
          nurse_id: userId,
          alert_type: "Missed Dose",
          severity:
            compliance.risk_level === "Defaulter" ? "Critical" : "Warning",
          message: `${patient?.full_name || "Patient"} missed their dose on ${date}.`,
          is_read: false,
        });

        const nurseToken = await getFcmToken(String(userId));
        if (nurseToken) {
          await sendMissedDoseAlert(
            nurseToken,
            patient?.full_name || "Patient",
          );
        }
      }

      res.json({
        message: `Dose for ${date} marked as ${dose_taken ? "taken ✓" : "missed ✗"}.`,
        entry,
        updated_compliance: compliance,
      });
    } catch (err) {
      console.error("Mark dose error:", err);
      res.status(500).json({ message: "Server error marking dose." });
    }
  },
);

// =============================================================================
// COMPLIANCE
// =============================================================================

/**
 * GET /api/patients/:id/compliance
 * Get compliance history for a patient, newest first
 */
router.get(
  "/:id/compliance",
  authorizeRoles("super_admin", "barangay_admin", "nurse"),
  async (req, res) => {
    try {
      const records = await ComplianceRecord.find({ patient_id: req.params.id })
        .sort({ calculated_at: -1 })
        .limit(30);

      res.json({ records });
    } catch (err) {
      console.error("Get compliance error:", err);
      res.status(500).json({ message: "Server error fetching compliance." });
    }
  },
);

/**
 * POST /api/patients/:id/compliance/recalculate
 * Manually trigger compliance recalculation for a patient
 */
router.post(
  "/:id/compliance/recalculate",
  authorizeRoles("nurse", "barangay_admin", "super_admin"),
  async (req, res) => {
    try {
      const compliance = await recalculateCompliance(req.params.id);
      res.json({ message: "Compliance recalculated.", compliance });
    } catch (err) {
      console.error("Recalculate compliance error:", err);
      res
        .status(500)
        .json({ message: "Server error recalculating compliance." });
    }
  },
);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate one TreatmentCalendar entry per day starting from diagnosis date
 */
const generateCalendarEntries = (patientId, startDate, totalDoses) => {
  const entries = [];
  for (let i = 0; i < totalDoses; i++) {
    const doseDate = new Date(startDate);
    doseDate.setDate(doseDate.getDate() + i);
    entries.push({
      patient_id: patientId,
      dose_date: doseDate,
      dose_taken: false,
      recorded_by: "system",
      recorded_at: null,
    });
  }
  return entries;
};

/**
 * Recalculate compliance percentage and risk level for a patient.
 * Saves a ComplianceRecord and updates Patient.risk_level.
 */
const recalculateCompliance = async (patientId) => {
  const patient = await Patient.findById(patientId);
  if (!patient) throw new Error("Patient not found");

  const today = new Date();

  // Only count scheduled doses up to today
  const entries = await TreatmentCalendar.find({
    patient_id: patientId,
    dose_date: { $lte: today },
  });

  const dosesTaken = entries.filter((e) => e.dose_taken).length;
  const totalScheduled = entries.length;
  const dosesRemaining = Math.max(0, patient.total_doses - dosesTaken);

  const percentage =
    totalScheduled > 0 ? Math.round((dosesTaken / totalScheduled) * 100) : 100;

  // Risk level thresholds
  let risk_level;
  if (percentage >= 80) risk_level = "Compliant";
  else if (percentage >= 50) risk_level = "At Risk";
  else risk_level = "Defaulter";

  // Save compliance snapshot
  const record = await ComplianceRecord.create({
    patient_id: patientId,
    compliance_percentage: percentage,
    doses_taken: dosesTaken,
    doses_remaining: dosesRemaining,
    risk_level,
    phase: patient.phase,
    calculated_at: new Date(),
  });

  // Update patient's risk level and remaining doses
  await Patient.findByIdAndUpdate(patientId, {
    risk_level,
    remaining_doses: dosesRemaining,
    updated_at: new Date(),
  });

  return record;
};

export default router;
