import * as service from "./medication-log.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export async function logMedication(req, res) {
  try {
    const log = await service.logMedication(req.body, req.user);
    return sendSuccess(res, "Medication log recorded.", { log }, 201);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getMyLogs(req, res) {
  try {
    const { page = 1, limit = 60, status, from, to, date } = req.query;
    const resolvedFrom = from ?? date;
    const resolvedTo = to ?? date;
    const result = await service.getPatientLogs(req.user.patient_id, {
      page, limit, status, from: resolvedFrom, to: resolvedTo,
    });
    return sendSuccess(res, "Medication logs retrieved.", result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getPatientLogs(req, res) {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 20, status, from, to } = req.query;
    const result = await service.getPatientLogs(patientId, { page, limit, status, from, to });
    return sendSuccess(res, "Medication logs retrieved.", result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getTodayLog(req, res) {
  try {
    const { patientId } = req.params;
    const log = await service.getTodayLog(patientId);
    return sendSuccess(res, "Today log retrieved.", { log });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getMissedDoses(req, res) {
  try {
    const { patientId } = req.params;
    const { from, to } = req.query;
    const logs = await service.getMissedDoses(patientId, { from, to });
    return sendSuccess(res, "Missed doses retrieved.", { logs });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getBarangayLogs(req, res) {
  try {
    const { barangayId } = req.params;
    const { date, status } = req.query;
    const logs = await service.getBarangayLogs(barangayId, { date, status });
    return sendSuccess(res, "Barangay logs retrieved.", { logs });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function updateLog(req, res) {
  try {
    const { logId } = req.params;
    const log = await service.updateLog(logId, req.body, req.user);
    return sendSuccess(res, "Medication log updated.", { log });
  } catch (err) {
    return sendError(res, err);
  }
}