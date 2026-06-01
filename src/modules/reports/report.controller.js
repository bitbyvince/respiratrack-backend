import * as reportService from "./report.service.js";
import {
  generatePatientPDF,
  generateBarangayPDF,
  generateCityPDF,
  generateInventoryPDF,
  generateOutcomePDF,
} from "../../utils/pdfExporter.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function streamPDF(res, buffer, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`);
  res.setHeader("Content-Length", buffer.length);
  return res.end(buffer);
}

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
      const buffer = await generatePatientPDF(data);
      return streamPDF(res, buffer, `patient-report-${data.patient.tb_case_number}`);
    }

    return sendSuccess(res, "Patient report generated", data, 200);
  } catch (err) {
    const status = err.statusCode ?? (err.message === "Patient not found" ? 404 : 500);
    return sendError(res, err);
  }
}

export async function getBarangayReport(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;

    assertBarangayAccess(req.user, barangayId);

    const data = await reportService.buildBarangayReport(barangayId, {
      from: req.query.from,
      to: req.query.to,
    });

    if (req.query.format === "pdf") {
      const buffer = await generateBarangayPDF(data);
      return streamPDF(res, buffer, `barangay-report-${data.barangay.barangay_id}`);
    }

    return sendSuccess(res, "Barangay report generated", data, 200);
  } catch (err) {
    const status = err.statusCode ?? (err.message === "Barangay not found" ? 404 : 500);
    return sendError(res, err);
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

    return sendSuccess(res, "City report generated", data, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getComplianceTrend(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;

    const data = await reportService.getComplianceTrend(
      barangayId,
      req.query.period,
      req.query.from,
      req.query.to,
      req.query.limit ? Number(req.query.limit) : undefined
    );

    return sendSuccess(res, "Compliance trend fetched", data, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getInventoryReport(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;

    const data = await reportService.buildInventoryReport(barangayId);

    if (req.query.format === "pdf") {
      const buffer = await generateInventoryPDF(data);
      return streamPDF(res, buffer, `inventory-report-${barangayId ?? "all"}-${Date.now()}`);
    }

    return sendSuccess(res, "Inventory report generated", data, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getTreatmentOutcomes(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const barangayId = role === "super_admin" ? req.query.barangay_id : userBarangay;
    const year = req.query.year ? Number(req.query.year) : undefined;

    const data = await reportService.buildTreatmentOutcomeReport(barangayId, year);

    if (req.query.format === "pdf") {
      const buffer = await generateOutcomePDF(data);
      return streamPDF(res, buffer, `outcome-report-${barangayId ?? "all"}-${year ?? "all"}`);
    }

    return sendSuccess(res, "Treatment outcome report generated", data, 200);
  } catch (err) {
    return sendError(res, err);
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