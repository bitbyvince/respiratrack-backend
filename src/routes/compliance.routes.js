import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// ─── Inline Models ────────────────────────────────────────────────────────────

const ComplianceRecord =
  mongoose.models.ComplianceRecord ||
  mongoose.model(
    "ComplianceRecord",
    new mongoose.Schema(
      {
        patient_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Patient",
          required: true,
        },
        compliance_percentage: {
          type: Number,
          min: 0,
          max: 100,
          required: true,
        },
        doses_taken: { type: Number, min: 0 },
        doses_remaining: { type: Number, min: 0 },
        risk_level: {
          type: String,
          enum: ["Compliant", "At Risk", "Defaulter"],
          required: true,
        },
        phase: {
          type: String,
          enum: ["Intensive", "Continuation"],
          required: true,
        },
        calculated_at: { type: Date, default: Date.now },
      },
      { collection: "compliance_records" },
    ),
  );

const TreatmentCalendar =
  mongoose.models.TreatmentCalendar ||
  mongoose.model(
    "TreatmentCalendar",
    new mongoose.Schema(
      {
        patient_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Patient",
          required: true,
        },
        dose_date: { type: Date, required: true },
        dose_taken: { type: Boolean, required: true },
        recorded_by: { type: String },
        recorded_at: { type: Date },
      },
      { collection: "treatment_calendars" },
    ),
  );

const Patient =
  mongoose.models.Patient ||
  mongoose.model(
    "Patient",
    new mongoose.Schema(
      {
        barangay_id: { type: mongoose.Schema.Types.ObjectId, ref: "Barangay" },
        full_name: { type: String },
        phase: { type: String, enum: ["Intensive", "Continuation"] },
        adherence: { type: String, enum: ["Regular", "Irregular"] },
        risk_level: {
          type: String,
          enum: ["Compliant", "At Risk", "Defaulter"],
        },
        remaining_doses: { type: Number },
        total_doses: { type: Number },
      },
      { collection: "patients" },
    ),
  );

// ─── Helper: Calculate compliance from treatment calendar ─────────────────────

const calculateCompliance = async (patientId) => {
  const records = await TreatmentCalendar.find({ patient_id: patientId });
  const total = records.length;
  if (total === 0) return { percentage: 0, taken: 0, remaining: 0 };

  const taken = records.filter((r) => r.dose_taken).length;
  const remaining = total - taken;
  const percentage = parseFloat(((taken / total) * 100).toFixed(2));
  return { percentage, taken, remaining };
};

const getRiskLevel = (percentage) => {
  if (percentage >= 80) return "Compliant";
  if (percentage >= 50) return "At Risk";
  return "Defaulter";
};

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/compliance
 * Get all compliance records (optionally filter by risk_level or phase)
 * Query params: risk_level, phase, limit, page
 */
router.get("/", async (req, res) => {
  try {
    const { risk_level, phase, limit = 20, page = 1 } = req.query;
    const filter = {};
    if (risk_level) filter.risk_level = risk_level;
    if (phase) filter.phase = phase;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [records, total] = await Promise.all([
      ComplianceRecord.find(filter)
        .populate("patient_id", "full_name barangay_id phase")
        .sort({ calculated_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ComplianceRecord.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: records,
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * GET /api/compliance/patient/:patientId
 * Get all compliance records for a specific patient (history)
 */
router.get("/patient/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid patient ID" });
    }

    const records = await ComplianceRecord.find({ patient_id: patientId }).sort(
      { calculated_at: -1 },
    );

    res.json({ success: true, count: records.length, data: records });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * GET /api/compliance/patient/:patientId/latest
 * Get the most recent compliance record for a patient
 */
router.get("/patient/:patientId/latest", async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid patient ID" });
    }

    const record = await ComplianceRecord.findOne({ patient_id: patientId })
      .sort({ calculated_at: -1 })
      .populate(
        "patient_id",
        "full_name phase adherence remaining_doses total_doses",
      );

    if (!record) {
      return res
        .status(404)
        .json({
          success: false,
          message: "No compliance record found for this patient",
        });
    }

    res.json({ success: true, data: record });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * POST /api/compliance/calculate/:patientId
 * Recalculate and save a new compliance record for a patient
 * based on their treatment_calendars entries
 */
router.post("/calculate/:patientId", async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(patientId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid patient ID" });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    const { percentage, taken, remaining } =
      await calculateCompliance(patientId);
    const risk_level = getRiskLevel(percentage);

    const record = await ComplianceRecord.create({
      patient_id: patientId,
      compliance_percentage: percentage,
      doses_taken: taken,
      doses_remaining: remaining,
      risk_level,
      phase: patient.phase,
      calculated_at: new Date(),
    });

    // Also update the patient's risk_level and adherence
    await Patient.findByIdAndUpdate(patientId, {
      risk_level,
      adherence: percentage >= 80 ? "Regular" : "Irregular",
      remaining_doses: remaining,
    });

    res.status(201).json({
      success: true,
      message: "Compliance calculated and saved",
      data: record,
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * POST /api/compliance/calculate-all
 * Recalculate compliance for ALL patients (batch job)
 * Useful for a scheduled daily cron or manual admin trigger
 */
router.post("/calculate-all", async (req, res) => {
  try {
    const patients = await Patient.find({}, "_id phase");
    const results = [];

    for (const patient of patients) {
      const { percentage, taken, remaining } = await calculateCompliance(
        patient._id,
      );
      const risk_level = getRiskLevel(percentage);

      const record = await ComplianceRecord.create({
        patient_id: patient._id,
        compliance_percentage: percentage,
        doses_taken: taken,
        doses_remaining: remaining,
        risk_level,
        phase: patient.phase,
        calculated_at: new Date(),
      });

      await Patient.findByIdAndUpdate(patient._id, {
        risk_level,
        adherence: percentage >= 80 ? "Regular" : "Irregular",
        remaining_doses: remaining,
      });

      results.push({
        patient_id: patient._id,
        risk_level,
        compliance_percentage: percentage,
      });
    }

    res.json({
      success: true,
      message: `Compliance recalculated for ${results.length} patients`,
      data: results,
    });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * GET /api/compliance/summary/barangay/:barangayId
 * Get compliance summary stats for a barangay
 * Returns count of Compliant / At Risk / Defaulter patients
 */
router.get("/summary/barangay/:barangayId", async (req, res) => {
  try {
    const { barangayId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(barangayId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid barangay ID" });
    }

    // Get the latest compliance record per patient in this barangay
    const patients = await Patient.find(
      { barangay_id: barangayId },
      "_id risk_level phase",
    );

    const summary = {
      total: patients.length,
      compliant: 0,
      at_risk: 0,
      defaulter: 0,
      by_phase: { Intensive: 0, Continuation: 0 },
    };

    for (const p of patients) {
      if (p.risk_level === "Compliant") summary.compliant++;
      else if (p.risk_level === "At Risk") summary.at_risk++;
      else if (p.risk_level === "Defaulter") summary.defaulter++;
      if (p.phase)
        summary.by_phase[p.phase] = (summary.by_phase[p.phase] || 0) + 1;
    }

    res.json({ success: true, barangay_id: barangayId, data: summary });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

/**
 * DELETE /api/compliance/:recordId
 * Delete a specific compliance record (admin use only)
 */
router.delete("/:recordId", async (req, res) => {
  try {
    const { recordId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(recordId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid record ID" });
    }

    const deleted = await ComplianceRecord.findByIdAndDelete(recordId);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });
    }

    res.json({ success: true, message: "Compliance record deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

export default router;
