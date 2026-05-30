// src/modules/medication-logs/medication-log.controller.js

import * as service from "./medication-log.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export async function logMedication(req, res) {
  try {
    const log = await service.logMedication(req.body, req.user);
    return sendSuccess(res, 201, "Medication log recorded.", { log });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getPatientLogs(req, res) {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 20, status, from, to } = req.query;
    const result = await service.getPatientLogs(patientId, {
      page,
      limit,
      status,
      from,
      to,
    });
    return sendSuccess(res, 200, "Medication logs retrieved.", result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getTodayLog(req, res) {
  try {
    const { patientId } = req.params;
    const log = await service.getTodayLog(patientId);
    return sendSuccess(res, 200, "Today log retrieved.", { log });
  } catch (err) {
    return sendError(res, err);
  }
}

// ── NEW: patient self-view by date (/medication-logs/my?date=YYYY-MM-DD) ──
export async function getMyLogByDate(req, res) {
  try {
    const patientId = req.user.patient_id;
    if (!patientId) {
      const e = new Error("Patient ID not in token.");
      e.statusCode = 400;
      return sendError(res, e);
    }
    const { date } = req.query;
    if (date) {
      // Single day lookup
      const start = new Date(date);
      const end = new Date(start.getTime() + 86400000);
      const MedicationLog = (
        await import("../../models/MedicationLog.model.js")
      ).default;
      const log = await MedicationLog.findOne({
        patient_id: patientId,
        log_date: { $gte: start, $lt: end },
      });
      return sendSuccess(res, 200, "Log retrieved.", log ?? null);
    }
    // No date param — return paginated history
    const { page = 1, limit = 30, status, from, to } = req.query;
    const result = await service.getPatientLogs(patientId, {
      page,
      limit,
      status,
      from,
      to,
    });
    return sendSuccess(res, 200, "Medication logs retrieved.", result);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getMissedDoses(req, res) {
  try {
    const { patientId } = req.params;
    const { from, to } = req.query;
    const logs = await service.getMissedDoses(patientId, { from, to });
    return sendSuccess(res, 200, "Missed doses retrieved.", { logs });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getBarangayLogs(req, res) {
  try {
    const { barangayId } = req.params;
    const { date, status } = req.query;
    const logs = await service.getBarangayLogs(barangayId, { date, status });
    return sendSuccess(res, 200, "Barangay logs retrieved.", { logs });
  } catch (err) {
    return sendError(res, err);
  }
}

export async function updateLog(req, res) {
  try {
    const { logId } = req.params;
    const log = await service.updateLog(logId, req.body, req.user);
    return sendSuccess(res, 200, "Medication log updated.", { log });
  } catch (err) {
    return sendError(res, err);
  }
}
