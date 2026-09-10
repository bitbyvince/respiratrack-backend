import Appointment from '../../models/Appointment.model.js';
import Patient from '../../models/Patient.model.js';
import User from '../../models/User.model.js';
import { notifyPatient } from '../../utils/notifyPatient.js';

const VALID_PURPOSES = ['Follow-up', 'Sputum Test', 'Medication Refill', 'Consultation', 'Routine'];
const VALID_STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

// appointment.patient_id is a plain string (not the Patient's _id), so
// Mongoose .populate() can't resolve it — batch-fetch the matching
// patients instead and merge their display fields onto each appointment.
// Pending appointments need action, so they should surface first regardless
// of date; Array.prototype.sort is stable, so this preserves the date/time
// descending (latest-first) order already applied within each status group.
const sortByStatusPriority = (appointments) =>
  [...appointments].sort(
    (a, b) => VALID_STATUSES.indexOf(a.status) - VALID_STATUSES.indexOf(b.status),
  );

const attachPatientInfo = async (appointments) => {
  const patientIds = [...new Set(appointments.map((a) => a.patient_id))];
  const patients = await Patient.find({ patient_id: { $in: patientIds } })
    .select('patient_id first_name last_name middle_name phone_number barangay_name')
    .lean();
  const byId = new Map(patients.map((p) => [p.patient_id, p]));

  return appointments.map((a) => {
    const appointment = a.toJSON ? a.toJSON() : a;
    const patient = byId.get(appointment.patient_id);
    return {
      ...appointment,
      patient_name: patient
        ? [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ')
        : null,
      patient_phone: patient?.phone_number ?? null,
      patient_barangay_name: patient?.barangay_name ?? null,
    };
  });
};

// scheduled_date alone is stored/compared at midnight granularity, so
// checking it against `new Date()` directly rejects every same-day booking
// once any time has passed since midnight. Combine it with scheduled_time
// to find out whether the actual slot is still upcoming.
const assertScheduledSlotIsFuture = (scheduledDateObj, scheduledTime) => {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (scheduledDateObj < today) {
    throw new Error('Scheduled date must be today or later.');
  }

  const isToday =
    scheduledDateObj.getFullYear() === now.getFullYear() &&
    scheduledDateObj.getMonth() === now.getMonth() &&
    scheduledDateObj.getDate() === now.getDate();

  if (isToday) {
    const [hours, minutes] = scheduledTime.split(':').map(Number);
    const slotDateTime = new Date();
    slotDateTime.setHours(hours, minutes, 0, 0);
    if (slotDateTime < now) {
      throw new Error('That time has already passed. Please pick a later time.');
    }
  }
};

const generateAppointmentId = async () => {
  const latest = await Appointment.findOne().sort({ appointment_id: -1 }).select('appointment_id');
  if (!latest) return 'APT-0001';
  const num = parseInt(latest.appointment_id.replace('APT-', ''), 10) + 1;
  return `APT-${String(num).padStart(4, '0')}`;
};

const notifyAppointmentPatient = async (patient, { type, title, body, appointmentId }) => {
  if (!patient.user_id) return;
  const user = await User.findOne({ user_id: patient.user_id });
  await notifyPatient({
    userId: patient.user_id,
    fcmToken: user?.fcm_token,
    type,
    title,
    body,
    data: { deep_link: 'respiratrack://appointments', appointment_id: appointmentId },
  });
};

export const createAppointment = async (data, user) => {
  const { patient_id, scheduled_date, scheduled_time, purpose, notes } = data;

  const patient = await Patient.findOne({ patient_id });
  if (!patient) throw new Error('Patient not found.');

  if (!VALID_PURPOSES.includes(purpose)) {
    throw new Error(`Invalid purpose. Must be one of: ${VALID_PURPOSES.join(', ')}`);
  }

  const scheduledDateObj = new Date(scheduled_date);
  if (Number.isNaN(scheduledDateObj.getTime())) throw new Error('Invalid scheduled date.');
  assertScheduledSlotIsFuture(scheduledDateObj, scheduled_time);

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

  await notifyAppointmentPatient(patient, {
    type: 'appointment_booked',
    title: 'Appointment Requested',
    body: `Your ${purpose} appointment request for ${scheduledDateObj.toDateString()} at ${scheduled_time} has been sent — you'll be notified once your health center confirms it.`,
    appointmentId,
  });

  return appointment;
};

// ── AVAILABLE SLOTS ──────────────────────────────────────────
// Fixed daily clinic schedule, minus whatever's already booked
// (Pending/Confirmed) for the requesting patient's own barangay.
const CLINIC_SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];

export const getAvailableSlots = async (patientId, dateStr) => {
  if (!dateStr) throw new Error('Date is required.');

  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw new Error('No patient record linked to this account.');

  const start = new Date(dateStr);
  if (Number.isNaN(start.getTime())) throw new Error('Invalid date.');
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);

  const booked = await Appointment.find({
    barangay_id: patient.barangay_id,
    scheduled_date: { $gte: start, $lt: end },
    status: { $in: ['Pending', 'Confirmed'] },
  }).select('scheduled_time');

  const bookedTimes = new Set(booked.map((a) => a.scheduled_time));
  const slots = CLINIC_SLOTS.filter((t) => !bookedTimes.has(t));

  return { date: dateStr, barangay_id: patient.barangay_id, slots };
};

export const getAppointments = async (filters, { page, limit }) => {
  const { status, purpose, from, to, barangay_id, sortDir } = filters;
  const query = {};

  if (status) {
    const statuses = status.split(',').map(s => s.trim());
    query.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }
  if (purpose) query.purpose = purpose;
  if (barangay_id) query.barangay_id = barangay_id;
  if (from || to) {
    query.scheduled_date = {};
    if (from) query.scheduled_date.$gte = new Date(from);
    if (to) query.scheduled_date.$lte = new Date(to);
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Pending-first ordering can't be expressed as a single Mongo sort key,
  // so fetch the full matching set (date/time, direction per sortDir) and
  // re-rank by status before paginating — appointment volumes here are
  // small enough that this stays cheap.
  const dir = sortDir === 'asc' ? 1 : -1;
  const allMatching = await Appointment.find(query).sort({ scheduled_date: dir, scheduled_time: dir });
  const sorted = sortByStatusPriority(allMatching);
  const total = sorted.length;
  const rawAppointments = sorted.slice(skip, skip + limitNum);
  const appointments = await attachPatientInfo(rawAppointments);

  return { appointments, total, page: pageNum, limit: limitNum };
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

  if (upcoming === 'true' || upcoming === 'false') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    query.scheduled_date = upcoming === 'true' ? { $gte: startOfToday } : { $lt: startOfToday };
  }

  const appointments = await Appointment.find(query).sort({ scheduled_date: -1 });
  return attachHealthCenterName(appointments, patientId);
};

// Older appointments were booked before health_center_name was a stored
// field, so they come back with it blank — fall back to the patient's
// current registered health center rather than leaving it empty.
const attachHealthCenterName = async (appointments, patientId) => {
  const missingName = appointments.some((a) => !a.health_center_name);
  if (!missingName) return appointments;

  const patient = await Patient.findOne({ patient_id: patientId }).select('health_center_name').lean();
  return appointments.map((a) => {
    if (a.health_center_name) return a;
    const appointment = a.toJSON ? a.toJSON() : a;
    return { ...appointment, health_center_name: patient?.health_center_name ?? '' };
  });
};

export const getBarangayAppointments = async (barangayId, { status, purpose, date, from, to, sortDir }) => {
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
  } else if (from || to) {
    query.scheduled_date = {};
    if (from) query.scheduled_date.$gte = new Date(from);
    if (to) query.scheduled_date.$lte = new Date(to);
  }
  const dir = sortDir === 'asc' ? 1 : -1;
  const appointments = await Appointment.find(query).sort({ scheduled_date: dir, scheduled_time: dir });
  return await attachPatientInfo(sortByStatusPriority(appointments));
};

export const confirmAppointment = async (appointmentId, user) => {
  const appointment = await Appointment.findOne({ appointment_id: appointmentId });
  if (!appointment) throw new Error('Appointment not found.');
  if (appointment.status !== 'Pending') throw new Error('Only pending appointments can be confirmed.');

  appointment.status = 'Confirmed';
  appointment.confirmed_by = user.user_id;
  appointment.updated_at = new Date();
  await appointment.save();

  const patient = await Patient.findOne({ patient_id: appointment.patient_id });
  if (patient) {
    await notifyAppointmentPatient(patient, {
      type: 'appointment_confirmed',
      title: 'Appointment Confirmed',
      body: `Your ${appointment.purpose} appointment on ${appointment.scheduled_date.toDateString()} at ${appointment.scheduled_time} is confirmed.`,
      appointmentId: appointment.appointment_id,
    });
  }

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

  if (scheduled_date || scheduled_time) {
    const scheduledDateObj = scheduled_date ? new Date(scheduled_date) : appointment.scheduled_date;
    if (scheduled_date && Number.isNaN(scheduledDateObj.getTime())) {
      throw new Error('Invalid scheduled date.');
    }
    const scheduledTime = scheduled_time || appointment.scheduled_time;
    assertScheduledSlotIsFuture(scheduledDateObj, scheduledTime);

    if (scheduled_date) appointment.scheduled_date = scheduledDateObj;
    if (scheduled_time) appointment.scheduled_time = scheduledTime;
  }
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