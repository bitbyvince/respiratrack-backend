import * as service from './appointment.service.js';
import { success, error } from '../../utils/apiResponse.js';

export const createAppointment = async (req, res) => {
  try {
    const appointment = await service.createAppointment(req.body, req.user);
    return res.status(201).json(success('Appointment created.', { appointment }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const getAppointments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, purpose, from, to } = req.query;
    const result = await service.getAppointments(
      { status, purpose, from, to },
      { page, limit },
    );
    return res.status(200).json(success('Appointments retrieved.', result));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const getAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.getAppointment(appointmentId);
    return res.status(200).json(success('Appointment retrieved.', { appointment }));
  } catch (err) {
    return res.status(404).json(error(err.message));
  }
};

export const getPatientAppointments = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, purpose } = req.query;
    const appointments = await service.getPatientAppointments(patientId, { status, purpose });
    return res.status(200).json(success('Patient appointments retrieved.', { appointments }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const getBarangayAppointments = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const { status, purpose, date } = req.query;
    const appointments = await service.getBarangayAppointments(barangayId, { status, purpose, date });
    return res.status(200).json(success('Barangay appointments retrieved.', { appointments }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const confirmAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.confirmAppointment(appointmentId, req.user);
    return res.status(200).json(success('Appointment confirmed.', { appointment }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const completeAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.completeAppointment(appointmentId, req.user);
    return res.status(200).json(success('Appointment marked as completed.', { appointment }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.cancelAppointment(appointmentId, req.user);
    return res.status(200).json(success('Appointment cancelled.', { appointment }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const updateAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.updateAppointment(appointmentId, req.body, req.user);
    return res.status(200).json(success('Appointment updated.', { appointment }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};