const reportService = require("./report.service");
const {
  generatePatientPDF,
  generateBarangayPDF,
  generateCityPDF,
  generateInventoryPDF,
  generateOutcomePDF,
} = require("../../utils/pdfExporter");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Streams a PDF buffer as a file download response.
 */
function streamPDF(res, buffer, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}.pdf"`
  );
  res.setHeader("Content-Length", buffer.length);
  return res.end(buffer);
}

/**
 * Enforces barangay scope for non-super-admin users.
 * Throws a 403-friendly error if the requested barangay doesn't match.
 */
function assertBarangayAccess(user, requestedBarangayId) {
  if (
    user.role !== "super_admin" &&
    requestedBarangayId &&
    requestedBarangayId !== user.barangay_id
  ) {
    throw Object.assign(
      new Error("Access denied to this barangay's report"),
      { statusCode: 403 }
    );
  }
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /reports/patient
 * Full individual patient report — JSON or PDF.
 * Nurse/barangay_admin scoped to their own barangay's patients.
 *
 * Query: patient_id, include_* flags, from?, to?, format?
 * Role:  super_admin, barangay_admin, nurse
 */
async function getPatientReport(req, res) {
  try {
    const {
      patient_id,
      include_medication_logs,
      include_symptom_logs,
      include_sputum_tests,
      include_appointments,
      include_dispensing,
      from,
      to,
      format,
    } = req.query;

    const data = await reportService.buildPatientReport(patient_id, {
      include_medication_logs: include_medication_logs !== "false",
      include_symptom_logs: include_symptom_logs !== "false",
      include_sputum_tests: include_sputum_tests !== "false",
      include_appointments: include_appointments !== "false",
      include_dispensing: include_dispensing !== "false",
      from,
      to,
    });

    // Enforce barangay scope after fetching (patient carries barangay_id)
    assertBarangayAccess(req.user, data.patient.barangay_id ?? null);

    if (format === "pdf") {
      const buffer = await generatePatientPDF(data);
      return streamPDF(
        res,
        buffer,
        `patient-report-${data.patient.tb_case_number}`
      );
    }

    return sendSuccess(res, 200, "Patient report generated", data);
  } catch (err) {
    const status = err.statusCode ?? (err.message === "Patient not found" ? 404 : 500);
    return sendError(res, status, err.message);
  }
}

/**
 * GET /reports/barangay
 * Barangay-level aggregate report — JSON or PDF.
 * Barangay admin scoped to own barangay; super admin can query any.
 *
 * Query: barangay_id, from?, to?, format?
 * Role:  super_admin, barangay_admin
 */
async function getBarangayReport(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin"
        ? req.query.barangay_id
        : userBarangay;

    assertBarangayAccess(req.user, barangayId);

    const data = await reportService.buildBarangayReport(barangayId, {
      from: req.query.from,
      to: req.query.to,
    });

    if (req.query.format === "pdf") {
      const buffer = await generateBarangayPDF(data);
      return streamPDF(
        res,
        buffer,
        `barangay-report-${data.barangay.barangay_id}`
      );
    }

    return sendSuccess(res, 200, "Barangay report generated", data);
  } catch (err) {
    const status = err.statusCode ?? (err.message === "Barangay not found" ? 404 : 500);
    return sendError(res, status, err.message);
  }
}

/**
 * GET /reports/city
 * City-wide aggregate report across all barangays — JSON or PDF.
 * Used for NTP quarterly/annual submission.
 *
 * Query: from?, to?, format?
 * Role:  super_admin only
 */
async function getCityReport(req, res) {
  try {
    const data = await reportService.buildCityReport({
      from: req.query.from,
      to: req.query.to,
    });

    if (req.query.format === "pdf") {
      const buffer = await generateCityPDF(data);
      return streamPDF(res, buffer, `city-report-pasig-${Date.now()}`);
    }

    return sendSuccess(res, 200, "City report generated", data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /reports/compliance-trend
 * Time-series compliance trend data for charts.
 * Scoped to a single barangay or city-wide.
 *
 * Query: barangay_id?, period?, from?, to?, limit?
 * Role:  super_admin, barangay_admin, nurse
 */
async function getComplianceTrend(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin"
        ? req.query.barangay_id
        : userBarangay;

    const data = await reportService.getComplianceTrend(
      barangayId,
      req.query.period,
      req.query.from,
      req.query.to,
      req.query.limit ? Number(req.query.limit) : undefined
    );

    return sendSuccess(res, 200, "Compliance trend fetched", data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /reports/inventory
 * Inventory report — current stock levels across all or one barangay.
 *
 * Query: barangay_id?, format?
 * Role:  super_admin, barangay_admin, nurse
 */
async function getInventoryReport(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin"
        ? req.query.barangay_id
        : userBarangay;

    const data = await reportService.buildInventoryReport(barangayId);

    if (req.query.format === "pdf") {
      const buffer = await generateInventoryPDF(data);
      return streamPDF(
        res,
        buffer,
        `inventory-report-${barangayId ?? "all"}-${Date.now()}`
      );
    }

    return sendSuccess(res, 200, "Inventory report generated", data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /reports/treatment-outcomes
 * Treatment outcome report grouped by status.
 * Mirrors NTP quarterly outcome reporting format.
 *
 * Query: barangay_id?, year?, format?
 * Role:  super_admin, barangay_admin
 */
async function getTreatmentOutcomes(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin"
        ? req.query.barangay_id
        : userBarangay;

    const year = req.query.year ? Number(req.query.year) : undefined;

    const data = await reportService.buildTreatmentOutcomeReport(
      barangayId,
      year
    );

    if (req.query.format === "pdf") {
      const buffer = await generateOutcomePDF(data);
      return streamPDF(
        res,
        buffer,
        `outcome-report-${barangayId ?? "all"}-${year ?? "all"}`
      );
    }

    return sendSuccess(res, 200, "Treatment outcome report generated", data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

module.exports = {
  getPatientReport,
  getBarangayReport,
  getCityReport,
  getComplianceTrend,
  getInventoryReport,
  getTreatmentOutcomes,
};