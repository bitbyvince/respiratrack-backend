import * as service from "./symptom-log.service.js";
import { success, error } from "../../utils/apiResponse.js";

export const logSymptom = async (req, res) => {
  try {
    const log = await service.logSymptom(req.body, req.user);
    return res.status(201).json(success("Symptom log recorded.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
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
    return res.status(200).json(success("Symptom logs retrieved.", result));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const getLatestLog = async (req, res) => {
  try {
    const log = await service.getLatestLog(req.params.patientId);
    return res
      .status(200)
      .json(success("Latest symptom log retrieved.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const getBarangayLogs = async (req, res) => {
  try {
    const logs = await service.getBarangayLogs(
      req.params.barangayId,
      req.query,
    );
    return res
      .status(200)
      .json(success("Barangay symptom logs retrieved.", { logs }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const reviewLog = async (req, res) => {
  try {
    const log = await service.reviewLog(req.params.logId, req.user);
    return res
      .status(200)
      .json(success("Symptom log marked as reviewed.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};
