import * as service from "./medication-log.service.js";
import { success, error } from "../../utils/apiResponse.js";

export async function logMedication(req, res) {
  try {
    const log = await service.logMedication(req.body, req.user);
    return res.status(201).json(success("Medication log recorded.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
}

export async function getPatientLogs(req, res) {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 20, status, from, to } = req.query;
    const result = await service.getPatientLogs(patientId, { page, limit, status, from, to });
    return res.status(200).json(success("Medication logs retrieved.", result));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
}

export async function getTodayLog(req, res) {
  try {
    const { patientId } = req.params;
    const log = await service.getTodayLog(patientId);
    return res.status(200).json(success("Today log retrieved.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
}

export async function getMissedDoses(req, res) {
  try {
    const { patientId } = req.params;
    const { from, to } = req.query;
    const logs = await service.getMissedDoses(patientId, { from, to });
    return res.status(200).json(success("Missed doses retrieved.", { logs }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
}

export async function getBarangayLogs(req, res) {
  try {
    const { barangayId } = req.params;
    const { date, status } = req.query;
    const logs = await service.getBarangayLogs(barangayId, { date, status });
    return res.status(200).json(success("Barangay logs retrieved.", { logs }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
}

export async function updateLog(req, res) {
  try {
    const { logId } = req.params;
    const log = await service.updateLog(logId, req.body, req.user);
    return res.status(200).json(success("Medication log updated.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
}