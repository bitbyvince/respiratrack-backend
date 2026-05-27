const patientService = require("./patient.service");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

// ── LIST & SEARCH ────────────────────────────────────────
const listPatients = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      // Scope non-super-admins to their own barangay
      ...(req.user.role !== "super_admin" && {
        barangay_id: req.user.barangay_id,
      }),
    };
    const result = await patientService.listPatients(filters);
    return sendSuccess(res, 200, "Patients retrieved.", result);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

// ── PATIENT SELF-VIEW ────────────────────────────────────
const getMyPatientProfile = async (req, res) => {
  try {
    const patient = await patientService.getPatientByUserId(req.user.user_id);
    return sendSuccess(res, 200, "Profile retrieved.", patient);
  } catch (err) {
    return sendError(res, err.statusCode || 404, err.message);
  }
};

// ── GET SINGLE PATIENT ───────────────────────────────────
const getPatient = async (req, res) => {
  try {
    const patient = await patientService.getPatientById(
      req.params.patient_id,
      req.user,
    );
    return sendSuccess(res, 200, "Patient retrieved.", patient);
  } catch (err) {
    return sendError(res, err.statusCode || 404, err.message);
  }
};

// ── REGISTER PATIENT ─────────────────────────────────────
const registerPatient = async (req, res) => {
  try {
    const patient = await patientService.registerPatient(req.body, req.user);
    return sendSuccess(res, 201, "Patient registered successfully.", patient);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── UPDATE PATIENT ───────────────────────────────────────
const updatePatient = async (req, res) => {
  try {
    const updated = await patientService.updatePatient(
      req.params.patient_id,
      req.body,
      req.user,
    );
    return sendSuccess(res, 200, "Patient updated successfully.", updated);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── UPDATE TREATMENT OUTCOME ─────────────────────────────
const updateTreatmentOutcome = async (req, res) => {
  try {
    const updated = await patientService.updateTreatmentOutcome(
      req.params.patient_id,
      req.body,
      req.user,
    );
    return sendSuccess(res, 200, "Treatment outcome updated.", updated);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── UPDATE SPUTUM SCHEDULE ───────────────────────────────
const updateSputumSchedule = async (req, res) => {
  try {
    const updated = await patientService.updateSputumSchedule(
      req.params.patient_id,
      req.body,
      req.user,
    );
    return sendSuccess(res, 200, "Sputum test schedule updated.", updated);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── DEACTIVATE ───────────────────────────────────────────
const deactivatePatient = async (req, res) => {
  try {
    await patientService.setPatientActiveStatus(
      req.params.patient_id,
      false,
      req.user,
    );
    return sendSuccess(res, 200, "Patient deactivated.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── REACTIVATE ───────────────────────────────────────────
const reactivatePatient = async (req, res) => {
  try {
    await patientService.setPatientActiveStatus(
      req.params.patient_id,
      true,
      req.user,
    );
    return sendSuccess(res, 200, "Patient reactivated.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── EXPORT PDF ───────────────────────────────────────────
const exportPatientsPdf = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      ...(req.user.role !== "super_admin" && {
        barangay_id: req.user.barangay_id,
      }),
    };
    const pdfBuffer = await patientService.exportPatientsPdf(filters);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="patients_${Date.now()}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

module.exports = {
  listPatients,
  getMyPatientProfile,
  getPatient,
  registerPatient,
  updatePatient,
  updateTreatmentOutcome,
  updateSputumSchedule,
  deactivatePatient,
  reactivatePatient,
  exportPatientsPdf,
};
