import * as service from "./symptom-log.service.js";
import { success, error } from "../../utils/apiResponse.js";

export const logSymptom = async (req, res) => {
  try {
    const log = await service.logSymptom(req.body, req.user);
    return success(res, "Symptom log recorded.", { log }, 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const getMyHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, from, to, severity } = req.query;
    const result = await service.getPatientLogs(req.user.patient_id, {
      page, limit, from, to, severity,
    });
    return success(res, "Symptom logs retrieved.", result);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const getMyTodayLog = async (req, res) => {
  try {
    const log = await service.getTodayLog(req.user.patient_id);
    return success(res, "Today's symptom log retrieved.", log);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const listLogs = async (req, res) => {
  try {
    const { role, barangay_id: userBarangay, health_center_id: userHealthCenter } = req.user;
    const isCityWide = role === "super_admin" || role === "patc";
    const barangayId = isCityWide ? req.query.barangay_id : userBarangay;
    const healthCenterId = isCityWide ? req.query.health_center_id : userHealthCenter;

    const result = await service.listSymptomLogs({
      barangayId,
      healthCenterId,
      page: req.query.page,
      limit: req.query.limit,
      from: req.query.from,
      to: req.query.to,
      severity: req.query.severity,
      reviewed: req.query.reviewed,
    });
    return success(res, "Symptom logs retrieved.", result);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const exportPdf = async (req, res) => {
  try {
    const { role, barangay_id: userBarangay, health_center_id: userHealthCenter } = req.user;
    const isCityWide = role === "super_admin" || role === "patc";
    const barangayId = isCityWide ? req.query.barangay_id : userBarangay;
    const healthCenterId = isCityWide ? req.query.health_center_id : userHealthCenter;

    const pdfBuffer = await service.exportSymptomLogsPdf(
      {
        barangayId,
        healthCenterId,
        from: req.query.from,
        to: req.query.to,
        severity: req.query.severity,
        reviewed: req.query.reviewed,
      },
      role,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="symptom_logs_${Date.now()}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return error(res, err.message, err.statusCode || 400);
  }
};

export const getPatientLogs = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 20, from, to, severity } = req.query;
    const result = await service.getPatientLogs(patientId, {
      page,
      limit,
      from,
      to,
      severity,
    });
    return success(res, "Symptom logs retrieved.", result);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const getLatestLog = async (req, res) => {
  try {
    const log = await service.getLatestLog(req.params.patientId);
    return success(res, "Latest symptom log retrieved.", { log });
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const getBarangayLogs = async (req, res) => {
  try {
    const logs = await service.getBarangayLogs(
      req.params.barangayId,
      req.query,
    );
    return success(res, "Barangay symptom logs retrieved.", { logs });
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const reviewLog = async (req, res) => {
  try {
    const log = await service.reviewLog(req.params.logId, req.user);
    return success(res, "Symptom log marked as reviewed.", { log });
  } catch (err) {
    return error(res, err.message, 400);
  }
};
