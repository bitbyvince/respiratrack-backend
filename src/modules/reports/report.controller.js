import * as reportService from "./report.service.js";
import {
  generatePatientPDF,
  generateBarangayPDF,
  generateCityPDF,
  generateInventoryPDF,
  generateOutcomePDF,
} from "../../utils/pdfExporter.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { isSuperAdminLevel } from "../../constants/roles.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function streamPDF(res, buffer, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
  res.setHeader("Content-Length", buffer.length);
  return res.end(buffer);
}

function assertBarangayAccess(user, requestedBarangayId) {
  if (
    !isSuperAdminLevel(user.role) &&
    requestedBarangayId &&
    requestedBarangayId !== user.barangay_id
  ) {
    throw Object.assign(
      new Error("Access denied to this barangay's report"),
      { statusCode: 403 }
    );
  }
}

// ── Controllers ──────────────────────────────────────────────────────────────

export async function getPatientReport(req, res) {
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

    assertBarangayAccess(req.user, data.patient.barangay_id ?? null);

    if (format === "pdf") {
      const buffer = await generatePatientPDF(data.patient);
      return streamPDF(res, buffer, `patient-report-${data.patient.tb_case_number}`);
    }

    return sendSuccess(res, 200, "Patient report generated", data);
  } catch (err) {
    const status = err.statusCode ?? (err.message === "Patient not found" ? 404 : 500);
    return sendError(res, status, err.message);
  }
}

export async function getBarangayReport(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;

    assertBarangayAccess(req.user, barangayId);

    const data = await reportService.buildBarangayReport(barangayId, {
      from: req.query.from,
      to: req.query.to,
    });

    if (req.query.format === "pdf") {
      const buffer = await generateBarangayPDF(data.barangay, data.patients);
      return streamPDF(res, buffer, `barangay-report-${data.barangay.barangay_id}`);
    }

    return sendSuccess(res, 200, "Barangay report generated", data);
  } catch (err) {
    const status = err.statusCode ?? (err.message === "Barangay not found" ? 404 : 500);
    return sendError(res, status, err.message);
  }
}

export async function getCityReport(req, res) {
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

export async function getComplianceTrend(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;

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

export async function getInventoryReport(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;

    const data = await reportService.buildInventoryReport(barangayId);

    if (req.query.format === "pdf") {
      const buffer = await generateInventoryPDF(data);
      return streamPDF(res, buffer, `inventory-report-${barangayId ?? "all"}-${Date.now()}`);
    }

    return sendSuccess(res, 200, "Inventory report generated", data);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getTreatmentOutcomes(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = isSuperAdminLevel(role) ? req.query.barangay_id : userBarangay;
    const year = req.query.year ? Number(req.query.year) : undefined;

    const data = await reportService.buildTreatmentOutcomeReport(barangayId, year);

    if (req.query.format === "pdf") {
      const buffer = await generateOutcomePDF(data);
      return streamPDF(res, buffer, `outcome-report-${barangayId ?? "all"}-${year ?? "all"}`);
    }

    return sendSuccess(res, 200, "Treatment outcome report generated", data);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
}

export default {
  getPatientReport,
  getBarangayReport,
  getCityReport,
  getComplianceTrend,
  getInventoryReport,
  getTreatmentOutcomes,
};