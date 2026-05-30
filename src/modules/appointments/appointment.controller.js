import * as service from "./appointment.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export const createAppointment = async (req, res) => {
  try {
    const appointment = await service.createAppointment(req.body, req.user);
    return sendSuccess(res, "Appointment created.", { appointment }, 201);
  } catch (err) {
    return sendError(res, err);
  }
};

export const getAppointments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, purpose, from, to } = req.query;
    const result = await service.getAppointments(
      { status, purpose, from, to },
      { page, limit },
    );
    return sendSuccess(res, "Appointments retrieved.", result);
  } catch (err) {
    return sendError(res, err);
  }
};

export const getAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.getAppointment(appointmentId);
    return sendSuccess(res, "Appointment retrieved.", { appointment });
  } catch (err) {
    return sendError(res, err);
  }
};

export const getAvailableSlots = async (req, res) => {
  try {
    const { barangay_id, date } = req.query;
    const slots = await service.getAvailableSlots(barangay_id, date);
    return sendSuccess(res, "Available slots retrieved.", { slots });
  } catch (err) {
    return sendError(res, err);
  }
};

export const getPatientAppointments = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status, purpose, upcoming } = req.query;
    const appointments = await service.getPatientAppointments(patientId, {
      status,
      purpose,
      upcoming,
    });
    return sendSuccess(res, "Patient appointments retrieved.", {
      appointments,
    });
  } catch (err) {
    return sendError(res, err);
  }
};

export const getBarangayAppointments = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const { status, purpose, date } = req.query;
    const appointments = await service.getBarangayAppointments(barangayId, {
      status,
      purpose,
      date,
    });
    return sendSuccess(res, "Barangay appointments retrieved.", {
      appointments,
    });
  } catch (err) {
    return sendError(res, err);
  }
};

export const confirmAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.confirmAppointment(
      appointmentId,
      req.user,
    );
    return sendSuccess(res, "Appointment confirmed.", { appointment });
  } catch (err) {
    return sendError(res, err);
  }
};

export const completeAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.completeAppointment(
      appointmentId,
      req.user,
    );
    return sendSuccess(res, "Appointment marked as completed.", {
      appointment,
    });
  } catch (err) {
    return sendError(res, err);
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.cancelAppointment(
      appointmentId,
      req.user,
    );
    return sendSuccess(res, "Appointment cancelled.", { appointment });
  } catch (err) {
    return sendError(res, err);
  }
};

export const updateAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await service.updateAppointment(
      appointmentId,
      req.body,
      req.user,
    );
    return sendSuccess(res, "Appointment updated.", { appointment });
  } catch (err) {
    return sendError(res, err);
  }
};
