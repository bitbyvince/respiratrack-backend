import * as service from './appointment.service.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

export const createAppointment = async (req, res) => {
  try {
    const data = {
      ...req.body,
      patient_id: req.body.patient_id || req.user.patient_id,
    };
    const appointment = await service.createAppointment(data, req.user);
    return sendSuccess(res, 201, 'Appointment created.', { appointment });
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const getMyAppointments = async (req, res) => {
  try {
    const { status, upcoming } = req.query;
    const appointments = await service.getPatientAppointments(
      req.user.patient_id,
      { status, upcoming },
    );
    return sendSuccess(res, 200, 'My appointments retrieved.', { appointments });
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const getAvailableSlots = async (req, res) => {
  try {
    const result = await service.getAvailableSlots(req.user.patient_id, req.query.date);
    return sendSuccess(res, 200, 'Available slots retrieved.', result);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const getAppointments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, purpose, from, to } = req.query;
    const result = await service.getAppointments({ status, purpose, from, to }, { page, limit });
    return sendSuccess(res, 200, 'Appointments retrieved.', result);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const getAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.getAppointment(appointmentId);
    return sendSuccess(res, 200, 'Appointment retrieved.', { appointment });
  } catch (err) {
    return sendError(res, err.statusCode || 404, err.message);
  }
};

export const getPatientAppointments = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, purpose } = req.query;
    const appointments = await service.getPatientAppointments(patientId, { status, purpose });
    return sendSuccess(res, 200, 'Patient appointments retrieved.', { appointments });
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const getBarangayAppointments = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const { status, purpose, date } = req.query;
    const appointments = await service.getBarangayAppointments(barangayId, { status, purpose, date });
    return sendSuccess(res, 200, 'Barangay appointments retrieved.', { appointments });
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const confirmAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.confirmAppointment(appointmentId, req.user);
    return sendSuccess(res, 200, 'Appointment confirmed.', { appointment });
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const completeAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.completeAppointment(appointmentId, req.user);
    return sendSuccess(res, 200, 'Appointment marked as completed.', { appointment });
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.cancelAppointment(appointmentId, req.user);
    return sendSuccess(res, 200, 'Appointment cancelled.', { appointment });
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

export const updateAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.updateAppointment(appointmentId, req.body, req.user);
    return sendSuccess(res, 200, 'Appointment updated.', { appointment });
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};