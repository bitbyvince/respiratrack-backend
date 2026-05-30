import * as service from "./symptom-log.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export const logSymptom = async (req, res) => {
  try {
    const log = await service.logSymptom(req.body, req.user);
    return sendSuccess(res, "Symptom log recorded.", { log }, 201);
  } catch (err) {
    return sendError(res, err);
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
    return sendSuccess(res, "Symptom logs retrieved.", result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const getLatestLog = async (req, res) => {
  try {
    const log = await service.getLatestLog(req.params.patientId);
    return sendSuccess(res, "Latest symptom log retrieved.", { log });
  } catch (err) {
    return sendError(res, err);
  }
};

export const getBarangayLogs = async (req, res) => {
  try {
    const logs = await service.getBarangayLogs(
      req.params.barangayId,
      req.query,
    );
    return sendSuccess(res, "Barangay symptom logs retrieved.", { logs });
  } catch (err) {
    return sendError(res, err);
  }
};

export const reviewLog = async (req, res) => {
  try {
    const log = await service.reviewLog(req.params.logId, req.user);
    return sendSuccess(res, "Symptom log marked as reviewed.", { log });
  } catch (err) {
    return sendError(res, err);
  }
};
