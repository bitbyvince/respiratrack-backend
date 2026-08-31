import * as service from "./dispensing.service.js";
import { isSuperAdminLevel } from "../../constants/roles.js";

export async function createDispensingRecord(req, res) {
  try {
    const records = await service.createDispensingRecord(req.body, req.user);
    return res.status(201).json({
      success: true,
      message: "Dispensing record created.",
      records,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to create dispensing record.",
    });
  }
}

export async function getActivePatientsForDispensing(req, res) {
  try {
    const { role } = req.user;
    const barangayId = req.scopedBarangayId || req.query.barangay_id || req.user.barangay_id || null;

    if (!isSuperAdminLevel(role) && !barangayId) {
      return res.status(400).json({
        success: false,
        message: "barangay_id is required.",
      });
    }

    const patients = await service.getActivePatientsForDispensing(barangayId);

    return res.status(200).json({
      success: true,
      message: "Active patients retrieved.",
      patients,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to retrieve active patients.",
    });
  }
}

export async function getDispensingRecords(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      patient_id,
      drug_name,
      from_date,
      to_date,
    } = req.query;

    // Barangay admin/nurse: always scoped to their own barangay via enforceBarangayScope.
    // Super admin: falls back to an explicit ?barangay_id= if given, else shows all barangays.
    const barangay_id = req.scopedBarangayId || req.query.barangay_id;

    const result = await service.getDispensingRecords(
      { patient_id, barangay_id, drug_name, from_date, to_date },
      { page, limit }
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
}

export async function getDispensingRecord(req, res) {
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
}

export async function getPatientDispensingRecords(req, res) {
  try {
    const { patientId } = req.params;
    const { drug_name, from_date, to_date, page = 1, limit = 20 } = req.query;

    const records = await service.getPatientDispensingRecords(
      patientId,
      { drug_name, from_date, to_date },
      { page, limit }
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
}

export async function getBarangayDispensingRecords(req, res) {
  try {
    const { barangayId } = req.params;
    const { drug_name, from_date, to_date, page = 1, limit = 20 } = req.query;

    const records = await service.getBarangayDispensingRecords(
      barangayId,
      { drug_name, from_date, to_date },
      { page, limit }
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
}