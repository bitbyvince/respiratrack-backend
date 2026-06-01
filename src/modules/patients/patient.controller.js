import * as patientService from './patient.service.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

export const listPatients = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      ...(req.user.role !== 'super_admin' && { barangay_id: req.user.barangay_id }),
    };
    const result = await patientService.listPatients(filters);
    return sendSuccess(res, 200, 'Patients retrieved.', result);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const getMyPatientProfile = async (req, res) => {
  try {
    const patient = await patientService.getPatientByUserId(req.user.user_id);
    return sendSuccess(res, 200, 'Profile retrieved.', patient);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const getPatient = async (req, res) => {
  try {
    const patient = await patientService.getPatientById(req.params.patient_id, req.user);
    return sendSuccess(res, 200, 'Patient retrieved.', patient);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const registerPatient = async (req, res) => {
  try {
    const { patient, defaultPin } = await patientService.registerPatient(req.body, req.user);
    return sendSuccess(res, 201, 'Patient registered successfully.', {
      patient,
      defaultPin,
      patient_id: patient.patient_id,
      default_pin: defaultPin,
    });
  } catch (err) {
    console.error('registerPatient full error:', err);
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const updatePatient = async (req, res) => {
  try {
    const updated = await patientService.updatePatient(req.params.patient_id, req.body, req.user);
    return sendSuccess(res, 200, 'Patient updated successfully.', updated);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const updateTreatmentOutcome = async (req, res) => {
  try {
    const updated = await patientService.updateTreatmentOutcome(req.params.patient_id, req.body, req.user);
    return sendSuccess(res, 200, 'Treatment outcome updated.', updated);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const updateSputumSchedule = async (req, res) => {
  try {
    const updated = await patientService.updateSputumSchedule(req.params.patient_id, req.body, req.user);
    return sendSuccess(res, 200, 'Sputum test schedule updated.', updated);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const deactivatePatient = async (req, res) => {
  try {
    await patientService.setPatientActiveStatus(req.params.patient_id, false, req.user);
    return sendSuccess(res, 200, 'Patient deactivated.');
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const reactivatePatient = async (req, res) => {
  try {
    await patientService.setPatientActiveStatus(req.params.patient_id, true, req.user);
    return sendSuccess(res, 200, 'Patient reactivated.');
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const exportPatientsPdf = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      ...(req.user.role !== 'super_admin' && { barangay_id: req.user.barangay_id }),
    };
    const pdfBuffer = await patientService.exportPatientsPdf(filters);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="patients_${Date.now()}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const updatePatientStatus = async (req, res) => {
  try {
    const updated = await patientService.updatePatientStatus(req.params.patient_id, req.body.status, req.user);
    return sendSuccess(res, 200, 'Patient status updated.', updated);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};