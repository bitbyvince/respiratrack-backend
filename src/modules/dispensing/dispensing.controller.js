const service = require("./dispensing.service");

exports.createDispensingRecord = async (req, res) => {
  try {
    const record = await service.createDispensingRecord(req.body, req.user);
    return res.status(201).json({
      success: true,
      message: "Dispensing record created.",
      record,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to create dispensing record.",
    });
  }
};

exports.getDispensingRecords = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      patient_id,
      barangay_id,
      medication_name,
      from_date,
      to_date,
    } = req.query;
    const result = await service.getDispensingRecords(
      { patient_id, barangay_id, medication_name, from_date, to_date },
      { page, limit },
    );

    return res.status(200).json({
      success: true,
      message: "Dispensing records retrieved.",
      ...result,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to retrieve dispensing records.",
    });
  }
};

exports.getDispensingRecord = async (req, res) => {
  try {
    const { recordId } = req.params;
    const record = await service.getDispensingRecord(recordId);
    return res.status(200).json({
      success: true,
      message: "Dispensing record retrieved.",
      record,
    });
  } catch (err) {
    return res.status(404).json({
      success: false,
      message: err.message || "Dispensing record not found.",
    });
  }
};

exports.getPatientDispensingRecords = async (req, res) => {
  try {
    const { patientId } = req.params;
    const {
      medication_name,
      from_date,
      to_date,
      page = 1,
      limit = 20,
    } = req.query;
    const records = await service.getPatientDispensingRecords(
      patientId,
      { medication_name, from_date, to_date },
      { page, limit },
    );

    return res.status(200).json({
      success: true,
      message: "Patient dispensing records retrieved.",
      ...records,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to retrieve patient dispensing records.",
    });
  }
};

exports.getBarangayDispensingRecords = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const {
      medication_name,
      from_date,
      to_date,
      page = 1,
      limit = 20,
    } = req.query;
    const records = await service.getBarangayDispensingRecords(
      barangayId,
      { medication_name, from_date, to_date },
      { page, limit },
    );

    return res.status(200).json({
      success: true,
      message: "Barangay dispensing records retrieved.",
      ...records,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to retrieve barangay dispensing records.",
    });
  }
};
