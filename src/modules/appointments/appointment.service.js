import Appointment from '../../models/Appointment.model.js';
import Patient from '../../models/Patient.model.js';

const VALID_PURPOSES = ['Follow-up', 'Sputum Test', 'Emergency', 'Routine'];
const VALID_STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

const generateAppointmentId = async () => {
  const count = await Appointment.countDocuments();
  return `APT-${String(count + 1).padStart(4, '0')}`;
};

export const createAppointment = async (data, user) => {
  const { patient_id, scheduled_date, scheduled_time, purpose, notes } = data;

  const patient = await Patient.findOne({ patient_id });
  if (!patient) throw new Error('Patient not found.');

  if (!VALID_PURPOSES.includes(purpose)) {
    throw new Error(`Invalid purpose. Must be one of: ${VALID_PURPOSES.join(', ')}`);
  }

  const scheduledDateObj = new Date(scheduled_date);
  if (scheduledDateObj < new Date()) {
    throw new Error('Scheduled date must be in the future.');
  }

  const existing = await Appointment.findOne({
    patient_id,
    scheduled_date: scheduledDateObj,
    status: { $in: ['Pending', 'Confirmed'] },
  });
  if (existing) throw new Error('Patient already has a pending or confirmed appointment on this date.');

  const appointmentId = await generateAppointmentId();

  const appointment = await Appointment.create({
    appointment_id: appointmentId,
    patient_id,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    health_center_id: patient.health_center_id,
    health_center_name: patient.health_center_name,
    requested_at: new Date(),
    scheduled_date: scheduledDateObj,
    scheduled_time,
    purpose,
    status: 'Pending',
    confirmed_by: null,
    notes: notes || '',
    created_at: new Date(),
    updated_at: new Date(),
  });

  return appointment;
};

export const getAppointments = async (filters, { page, limit }) => {
  const { status, purpose, from, to } = filters;
  const query = {};

  if (status) {
    const statuses = status.split(',').map(s => s.trim());
    query.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }
  if (purpose) query.purpose = purpose;
  if (from || to) {
    query.scheduled_date = {};
    if (from) query.scheduled_date.$gte = new Date(from);
    if (to) query.scheduled_date.$lte = new Date(to);
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [appointments, total] = await Promise.all([
    Appointment.find(query).sort({ scheduled_date: 1 }).skip(skip).limit(parseInt(limit)),
    Appointment.countDocuments(query),
  ]);

  return { appointments, total, page: parseInt(page), limit: parseInt(limit) };
};

export const getAppointment = async (appointmentId) => {
  const appointment = await Appointment.findOne({ appointment_id: appointmentId });
  if (!appointment) throw new Error('Appointment not found.');
  return appointment;
};

export const getPatientAppointments = async (patientId, { status, purpose, upcoming } = {}) => {
  const query = { patient_id: patientId };

  if (status) {
    const statuses = status.split(',').map(s => s.trim());
    query.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }

  if (purpose) query.purpose = purpose;

  if (upcoming === 'true') {
    query.scheduled_date = { $gte: new Date() };
  } else if (upcoming === 'false') {
    query.scheduled_date = { $lt: new Date() };
  }

  return await Appointment.find(query).sort({ scheduled_date: -1 });
};

export const getBarangayAppointments = async (barangayId, { status, purpose, date }) => {
  const query = { barangay_id: barangayId };

  if (status) {
    const statuses = status.split(',').map(s => s.trim());
    query.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }
  if (purpose) query.purpose = purpose;
  if (date) {
    const start = new Date(date);
    const end = new Date(start.getTime() + 86400000);
    query.scheduled_date = { $gte: start, $lt: end };
  }
  return await Appointment.find(query).sort({ scheduled_date: 1 });
};

export const confirmAppointment = async (appointmentId, user) => {
  const appointment = await Appointment.findOne({ appointment_id: appointmentId });
  if (!appointment) throw new Error('Appointment not found.');
  if (appointment.status !== 'Pending') throw new Error('Only pending appointments can be confirmed.');

  appointment.status = 'Confirmed';
  appointment.confirmed_by = user.user_id;
  appointment.updated_at = new Date();
  await appointment.save();

  return appointment;
};

export const completeAppointment = async (appointmentId, user) => {
  const appointment = await Appointment.findOne({ appointment_id: appointmentId });
  if (!appointment) throw new Error('Appointment not found.');
  if (appointment.status !== 'Confirmed') throw new Error('Only confirmed appointments can be marked as completed.');

  appointment.status = 'Completed';
  appointment.updated_at = new Date();
  await appointment.save();

  return appointment;
};

export const cancelAppointment = async (appointmentId, user) => {
  const appointment = await Appointment.findOne({ appointment_id: appointmentId });
  if (!appointment) throw new Error('Appointment not found.');
  if (appointment.status === 'Completed') throw new Error('Completed appointments cannot be cancelled.');
  if (appointment.status === 'Cancelled') throw new Error('Appointment is already cancelled.');

  appointment.status = 'Cancelled';
  appointment.updated_at = new Date();
  await appointment.save();

  return appointment;
};

export const updateAppointment = async (appointmentId, data, user) => {
  const appointment = await Appointment.findOne({ appointment_id: appointmentId });
  if (!appointment) throw new Error('Appointment not found.');
  if (appointment.status === 'Completed') throw new Error('Completed appointments cannot be edited.');
  if (appointment.status === 'Cancelled') throw new Error('Cancelled appointments cannot be edited.');

  const { scheduled_date, scheduled_time, purpose, notes } = data;

  if (scheduled_date) {
    const scheduledDateObj = new Date(scheduled_date);
    if (scheduledDateObj < new Date()) throw new Error('Scheduled date must be in the future.');
    appointment.scheduled_date = scheduledDateObj;
  }

  if (scheduled_time) appointment.scheduled_time = scheduled_time;
  if (purpose) {
    if (!VALID_PURPOSES.includes(purpose)) {
      throw new Error(`Invalid purpose. Must be one of: ${VALID_PURPOSES.join(', ')}`);
    }
    appointment.purpose = purpose;
  }
  if (notes !== undefined) appointment.notes = notes;

  appointment.updated_at = new Date();
  await appointment.save();

  return appointment;
};