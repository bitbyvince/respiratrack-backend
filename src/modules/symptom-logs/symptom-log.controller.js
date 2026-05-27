const service = require("./symptom-log.service");
const { success, error } = require("../../utils/apiResponse");

exports.logSymptom = async (req, res) => {
  try {
    const log = await service.logSymptom(req.body, req.user);
    return res.status(201).json(success("Symptom log recorded.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

exports.getPatientLogs = async (req, res) => {
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

exports.getLatestLog = async (req, res) => {
  try {
    const { patientId } = req.params;
    const log = await service.getLatestLog(patientId);
    return res
      .status(200)
      .json(success("Latest symptom log retrieved.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

exports.getBarangayLogs = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const { date, reviewed } = req.query;
    const logs = await service.getBarangayLogs(barangayId, { date, reviewed });
    return res
      .status(200)
      .json(success("Barangay symptom logs retrieved.", { logs }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

exports.reviewLog = async (req, res) => {
  try {
    const { logId } = req.params;
    const log = await service.reviewLog(logId, req.user);
    return res
      .status(200)
      .json(success("Symptom log marked as reviewed.", { log }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};
