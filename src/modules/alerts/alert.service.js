import Alert from '../../models/Alert.model.js';
import Patient from '../../models/Patient.model.js';
import User from '../../models/User.model.js';
import Barangay from '../../models/Barangay.model.js';
import { ESCALATION_LEVELS } from '../../constants/escalationLevels.js';
import { isSuperAdminLevel } from '../../constants/roles.js';
import { notifyPatient } from '../../utils/notifyPatient.js';
import mongoose from 'mongoose';

const VALID_ALERT_TYPES = [
  'Missed Dose',
  'Escalation L1',
  'Escalation L2',
  'Escalation L3',
  'Low Stock',
  'Stock Request',
  'Sputum Test Due',
  'Appointment Reminder',
];

const VALID_SEVERITIES = ['Info', 'Warning', 'Critical'];
const VALID_STATUSES   = ['Active', 'Resolved', 'Acknowledged'];

// Fires a staff-facing "Missed Dose" alert the first time a patient's
// consecutive missed-dose streak reaches this count, and auto-resolves it
// once the streak recovers. Deliberately independent of the 2/7/30
// escalation-level thresholds in constants/escalationLevels.js — this is a
// separate, earlier signal.
const MISSED_DOSE_ALERT_THRESHOLD = 3;

const ROLE_ALERT_MAP = {
  nurse:          ['Missed Dose', 'Escalation L1', 'Escalation L2', 'Escalation L3', 'Sputum Test Due', 'Appointment Reminder'],
  barangay_admin: ['Escalation L2', 'Escalation L3', 'Low Stock', 'Stock Request', 'Sputum Test Due'],
  super_admin:    ['Escalation L3', 'Low Stock', 'Stock Request', 'Missed Dose', 'Escalation L1', 'Escalation L2', 'Sputum Test Due', 'Appointment Reminder'],
  patc:           ['Escalation L3', 'Low Stock', 'Stock Request', 'Missed Dose', 'Escalation L1', 'Escalation L2', 'Sputum Test Due', 'Appointment Reminder'],
};

const ESCALATION_META = {
  1: { alert_type: 'Escalation L1', severity: 'Warning',  target_roles: ['nurse'],                                    label: 'missed 2 or more consecutive doses — Missed Dose Alert' },
  2: { alert_type: 'Escalation L2', severity: 'Warning',  target_roles: ['nurse', 'barangay_admin'],                  label: 'missed 7 or more consecutive doses — At Risk of Interruption' },
  3: { alert_type: 'Escalation L3', severity: 'Critical', target_roles: ['nurse', 'barangay_admin', 'super_admin'],   label: 'missed 30 or more consecutive doses and is classified as Lost to Follow-Up' },
};

function resolveEscalationLevel(consecutiveMissed) {
  if (consecutiveMissed >= ESCALATION_LEVELS.L3_THRESHOLD) return 3;
  if (consecutiveMissed >= ESCALATION_LEVELS.L2_THRESHOLD) return 2;
  if (consecutiveMissed >= ESCALATION_LEVELS.L1_THRESHOLD) return 1;
  return 0;
}

const resolveBarangayStringId = async (barangayId) => {
  if (!barangayId) return null;
  if (typeof barangayId === 'string' && barangayId.startsWith('BRG-')) return barangayId;

  const query = mongoose.Types.ObjectId.isValid(barangayId)
    ? { $or: [{ _id: new mongoose.Types.ObjectId(barangayId) }, { barangay_id: barangayId }] }
    : { barangay_id: barangayId };

  const barangay = await Barangay.findOne(query).lean();
  return barangay?.barangay_id ?? barangayId;
};

// alert.patient_id is a plain string (not the Patient's _id), so it can't
// be resolved with Mongoose .populate() — batch-fetch the matching patients
// instead and attach a display name onto each alert.
const attachPatientNames = async (alerts) => {
  const patientIds = [...new Set(alerts.map((a) => a.patient_id).filter(Boolean))];
  if (patientIds.length === 0) return alerts.map((a) => (a.toJSON ? a.toJSON() : a));

  const patients = await Patient.find({ patient_id: { $in: patientIds } })
    .select('patient_id first_name last_name middle_name')
    .lean();
  const byId = new Map(patients.map((p) => [p.patient_id, p]));

  return alerts.map((a) => {
    const alert = a.toJSON ? a.toJSON() : a;
    const patient = byId.get(alert.patient_id);
    return {
      ...alert,
      patient_name: patient
        ? [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ')
        : null,
    };
  });
};

const generateAlertId = async () => {
  const last = await Alert.findOne({}, { alert_id: 1 }).sort({ alert_id: -1 }).lean();
  if (!last?.alert_id) return 'ALT-0001';
  const num = parseInt(last.alert_id.replace('ALT-', ''), 10);
  return `ALT-${String(num + 1).padStart(4, '0')}`;
};

export const createAlert = async (data) => {
  const {
    patient_id,
    tb_case_number,
    barangay_id,
    alert_type,
    escalation_level,
    message,
    severity,
    target_roles,
    stock_request_items,
  } = data;

  if (!VALID_ALERT_TYPES.includes(alert_type)) {
    throw new Error(`Invalid alert type. Must be one of: ${VALID_ALERT_TYPES.join(', ')}`);
  }

  if (!VALID_SEVERITIES.includes(severity)) {
    throw new Error(`Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }

  const alertId = await generateAlertId();
  const resolvedBarangayId = await resolveBarangayStringId(barangay_id);

  const alert = await Alert.create({
    alert_id:         alertId,
    patient_id:       patient_id || null,
    tb_case_number:   tb_case_number || null,
    barangay_id:      resolvedBarangayId,
    alert_type,
    escalation_level: escalation_level || 0,
    message,
    severity,
    status:           'Active',
    target_roles:     target_roles || [],
    created_at:       new Date(),
    resolved_at:      null,
    resolved_by:      null,
    ...(stock_request_items && { stock_request_items }),
  });

  return alert;
};

export const getAlerts = async (filters, { page, limit }) => {
  const { status, severity, alert_type, role, barangay_id } = filters;

  const query = {};
  if (status)     query.status     = status;
  if (severity)   query.severity   = severity;
  if (alert_type) query.alert_type = alert_type;
  if (role && ROLE_ALERT_MAP[role]) query.target_roles = { $in: [role] };

  if (barangay_id && !isSuperAdminLevel(role)) {
    const resolvedId = await resolveBarangayStringId(barangay_id);
    query.barangay_id = resolvedId;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [rawAlerts, total] = await Promise.all([
    Alert.find(query).sort({ created_at: -1 }).skip(skip).limit(parseInt(limit)),
    Alert.countDocuments(query),
  ]);
  const alerts = await attachPatientNames(rawAlerts);

  return { alerts, total, page: parseInt(page), limit: parseInt(limit) };
};

export const getAlert = async (alertId) => {
  const alert = await Alert.findOne({ alert_id: alertId });
  if (!alert) throw new Error('Alert not found.');
  return alert;
};

export const getBarangayAlerts = async (barangayId, { status, severity, alert_type }) => {
  const query = { barangay_id: barangayId };
  if (status)     query.status     = status;
  if (severity)   query.severity   = severity;
  if (alert_type) query.alert_type = alert_type;
  const alerts = await Alert.find(query).sort({ created_at: -1 });
  return await attachPatientNames(alerts);
};

export const getPatientAlerts = async (patientId, { status }) => {
  const query = { patient_id: patientId };
  if (status) query.status = status;
  return await Alert.find(query).sort({ created_at: -1 });
};

export const resolveAlert = async (alertId, user) => {
  const alert = await Alert.findOne({ alert_id: alertId });
  if (!alert) throw new Error('Alert not found.');
  if (alert.status === 'Resolved') throw new Error('Alert is already resolved.');

  alert.status      = 'Resolved';
  alert.resolved_at = new Date();
  alert.resolved_by = user.user_id;
  await alert.save();

  if (alert.patient_id) {
    const patient = await Patient.findOne({ patient_id: alert.patient_id });
    if (patient) {
      const unresolvedEscalations = await Alert.countDocuments({
        patient_id: alert.patient_id,
        alert_type: { $in: ['Escalation L1', 'Escalation L2', 'Escalation L3'] },
        status:     { $ne: 'Resolved' },
      });

      if (unresolvedEscalations === 0 && patient.escalation.level > 0) {
        await Patient.updateOne(
          { patient_id: alert.patient_id },
          {
            $set: {
              'escalation.level':           0,
              'escalation.acknowledged_by': user.user_id,
              'escalation.acknowledged_at': new Date(),
              updated_at:                   new Date(),
            },
          },
        );
      }
    }
  }

  return alert;
};

export const acknowledgeAlert = async (alertId, user) => {
  const alert = await Alert.findOne({ alert_id: alertId });
  if (!alert) throw new Error('Alert not found.');
  if (alert.status === 'Resolved')     throw new Error('Cannot acknowledge a resolved alert.');
  if (alert.status === 'Acknowledged') throw new Error('Alert is already acknowledged.');

  alert.status = 'Acknowledged';
  await alert.save();

  return alert;
};

export const sendFollowUp = async (alertId, customMessage) => {
  const alert = await Alert.findOne({ alert_id: alertId });
  if (!alert) throw new Error('Alert not found.');
  if (!alert.patient_id) throw new Error('This alert is not linked to a patient.');

  const patient = await Patient.findOne({ patient_id: alert.patient_id });
  if (!patient) throw new Error('Patient not found.');
  if (!patient.user_id) throw new Error('This patient has no mobile app account to notify.');

  const user = await User.findOne({ user_id: patient.user_id });

  await notifyPatient({
    userId: patient.user_id,
    fcmToken: user?.fcm_token,
    type: 'follow_up',
    title: 'Follow-up from your health center',
    body: customMessage?.trim() ||
      `Hi ${patient.first_name}, we noticed you've missed some medication doses. Please reach out to your health center or take your next dose as soon as possible.`,
    data: {
      deep_link: 'respiratrack://medication-log',
      tb_case_number: patient.tb_case_number,
      alert_id: alert.alert_id,
    },
  });

  return { sent: true };
};

// Single entry point for keeping a patient's "Missed Dose" alert in sync
// with their current streak — creates one once the streak crosses the
// threshold, and auto-resolves any still-open one once the streak recovers
// (i.e. the patient logged a dose again, resetting consecutive_missed_doses).
// Called both from the nightly missedDose.job and synchronously whenever a
// medication log is created/edited, so recovery is reflected immediately
// rather than waiting for the next job run.
export const syncMissedDoseAlert = async (patient, consecutiveMissedDoses) => {
  if (consecutiveMissedDoses >= MISSED_DOSE_ALERT_THRESHOLD) {
    const existingAlert = await Alert.findOne({
      patient_id: patient.patient_id,
      alert_type: 'Missed Dose',
      status: { $ne: 'Resolved' },
    });
    if (existingAlert) return;

    await createAlert({
      patient_id: patient.patient_id,
      tb_case_number: patient.tb_case_number,
      barangay_id: patient.barangay_id,
      alert_type: 'Missed Dose',
      severity: 'Warning',
      message: `Patient ${patient.tb_case_number} has missed ${consecutiveMissedDoses} consecutive doses.`,
      target_roles: ['nurse', 'barangay_admin', 'super_admin', 'patc'],
    });
    return;
  }

  const openAlerts = await Alert.find({
    patient_id: patient.patient_id,
    alert_type: 'Missed Dose',
    status: { $ne: 'Resolved' },
  });

  for (const openAlert of openAlerts) {
    openAlert.status = 'Resolved';
    openAlert.resolved_by = 'system';
    openAlert.resolved_at = new Date();
    openAlert.resolution_notes = 'Automatically resolved: patient resumed taking medication.';
    await openAlert.save();
  }
};

export const createSystemAlert = async ({
  patient_id,
  tb_case_number,
  barangay_id,
  alert_type,
  escalation_level,
  message,
  severity,
  target_roles,
}) => {
const existingAlert = await Alert.findOne({
  patient_id: patient.patient_id,
  alert_type: meta.alert_type,
});

  if (existing) return existing;

  return await createAlert({
    patient_id,
    tb_case_number,
    barangay_id,
    alert_type,
    escalation_level,
    message,
    severity,
    target_roles,
  });
};

export const checkAndTriggerEscalations = async (barangayId) => {
  const resolvedId = await resolveBarangayStringId(barangayId);

  const patients = await Patient.find({
    barangay_id: resolvedId,
    is_active: true,
  });

  let triggered = 0;

  for (const patient of patients) {
    const consecutiveMissed = patient.compliance?.consecutive_missed_doses ?? 0;
    const newLevel = resolveEscalationLevel(consecutiveMissed);

    if (newLevel === 0) continue;

    const meta = ESCALATION_META[newLevel];
    const now = new Date();

    const existingAlert = await Alert.findOne({
      patient_id: patient.patient_id,
      alert_type: meta.alert_type,
      status: { $ne: 'Resolved' },
    });

    if (existingAlert) continue;

    await Patient.findOneAndUpdate(
      { patient_id: patient.patient_id },
      {
        $set: {
          'escalation.level': newLevel,
          'escalation.escalated_at': now,
          'escalation.escalated_by': 'system',
          'escalation.notes': `${consecutiveMissed} consecutive missed doses — escalation level ${newLevel} triggered`,
          ...(newLevel === 3 && { 'compliance.risk_level': 'Defaulter' }),
          updated_at: now,
        },
      },
    );

    const resolvedPatientBarangayId = await resolveBarangayStringId(patient.barangay_id);
    const alertId = await generateAlertId();

    await Alert.create({
      alert_id: alertId,
      patient_id: patient.patient_id,
      tb_case_number: patient.tb_case_number,
      barangay_id: resolvedPatientBarangayId,
      alert_type: meta.alert_type,
      escalation_level: newLevel,
      message: `Patient ${patient.tb_case_number} has ${meta.label}.`,
      severity: meta.severity,
      status: 'Active',
      target_roles: meta.target_roles,
      created_at: now,
      resolved_at: null,
      resolved_by: null,
    });

    triggered++;
  }

  return { checked: patients.length, triggered };
};