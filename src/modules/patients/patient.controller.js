import * as patientService from './patient.service.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

export const listPatients = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      ...(req.user.role !== 'super_admin' && {
        barangay_id: req.user.barangay_id,
      }),
    };
    const result = await patientService.listPatients(filters);
    return sendSuccess(res, 'Patients retrieved.', result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const getMyPatientProfile = async (req, res) => {
  try {
    const patient = await patientService.getPatientByUserId(req.user.user_id);
    return sendSuccess(res, 'Profile retrieved.', patient);
  } catch (err) {
    return sendError(res, err);
  }
};

export const getPatient = async (req, res) => {
  try {
    const patient = await patientService.getPatientById(req.params.patient_id, req.user);
    return sendSuccess(res, 'Patient retrieved.', patient);
  } catch (err) {
    return sendError(res, err);
  }
};

export const registerPatient = async (req, res) => {
  try {
    const { patient, defaultPin } = await patientService.registerPatient(req.body, req.user);
    return sendSuccess(res, 'Patient registered successfully.', { patient, defaultPin }, 201);
  } catch (err) {
    console.error('registerPatient full error:', err);
    return sendError(res, err);
  }
};

export const updatePatient = async (req, res) => {
  try {
    const updated = await patientService.updatePatient(req.params.patient_id, req.body, req.user);
    return sendSuccess(res, 'Patient updated successfully.', updated);
  } catch (err) {
    return sendError(res, err);
  }
};

export const updateTreatmentOutcome = async (req, res) => {
  try {
    const updated = await patientService.updateTreatmentOutcome(
      req.params.patient_id,
      req.body,
      req.user,
    );
    return sendSuccess(res, 'Treatment outcome updated.', updated);
  } catch (err) {
    return sendError(res, err);
  }
};

export const updateSputumSchedule = async (req, res) => {
  try {
    const updated = await patientService.updateSputumSchedule(
      req.params.patient_id,
      req.body,
      req.user,
    );
    return sendSuccess(res, 'Sputum test schedule updated.', updated);
  } catch (err) {
    return sendError(res, err);
  }
};

export const deactivatePatient = async (req, res) => {
  try {
    await patientService.setPatientActiveStatus(req.params.patient_id, false, req.user);
    return sendSuccess(res, 'Patient deactivated.');
  } catch (err) {
    return sendError(res, err);
  }
};

export const reactivatePatient = async (req, res) => {
  try {
    await patientService.setPatientActiveStatus(req.params.patient_id, true, req.user);
    return sendSuccess(res, 'Patient reactivated.');
  } catch (err) {
    return sendError(res, err);
  }
};

export const exportPatientsPdf = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      ...(req.user.role !== 'super_admin' && {
        barangay_id: req.user.barangay_id,
      }),
    };
    const pdfBuffer = await patientService.exportPatientsPdf(filters);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="patients_${Date.now()}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return sendError(res, err);
  }
};