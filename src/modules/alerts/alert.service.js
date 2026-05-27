const Alert = require('../../models/Alert.model');
const Patient = require('../../models/Patient.model');

const VALID_ALERT_TYPES = [
  'Missed Dose',
  'Escalation L1',
  'Escalation L2',
  'Escalation L3',
  'Low Stock',
  'Sputum Test Due',
  'Appointment Reminder',
];

const VALID_SEVERITIES = ['Info', 'Warning', 'Critical'];
const VALID_STATUSES = ['Active', 'Resolved', 'Acknowledged'];

const ROLE_ALERT_MAP = {
  nurse: ['Missed Dose', 'Escalation L1', 'Escalation L2', 'Escalation L3', 'Sputum Test Due', 'Appointment Reminder'],
  barangay_admin: ['Escalation L2', 'Escalation L3', 'Low Stock', 'Sputum Test Due'],
  super_admin: ['Escalation L3', 'Low Stock', 'Missed Dose', 'Escalation L1', 'Escalation L2', 'Sputum Test Due', 'Appointment Reminder'],
};

const generateAlertId = async () => {
  const count = await Alert.countDocuments();
  return `ALT-${String(count + 1).padStart(4, '0')}`;
};

exports.createAlert = async (data) => {
  const {
    patient_id,
    tb_case_number,
    barangay_id,
    alert_type,
    escalation_level,
    message,
    severity,
    target_roles,
  } = data;

  if (!VALID_ALERT_TYPES.includes(alert_type)) {
    throw new Error(`Invalid alert type. Must be one of: ${VALID_ALERT_TYPES.join(', ')}`);
  }

  if (!VALID_SEVERITIES.includes(severity)) {
    throw new Error(`Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }

  const alertId = await generateAlertId();

  const alert = await Alert.create({
    alert_id: alertId,
    patient_id: patient_id || null,
    tb_case_number: tb_case_number || null,
    barangay_id,
    alert_type,
    escalation_level: escalation_level || 0,
    message,
    severity,
    status: 'Active',
    target_roles: target_roles || [],
    created_at: new Date(),
    resolved_at: null,
    resolved_by: null,
  });

  return alert;
};

exports.getAlerts = async (filters, { page, limit }) => {
  const { status, severity, alert_type, role } = filters;

  const query = {};

  if (status) query.status = status;
  if (severity) query.severity = severity;
  if (alert_type) query.alert_type = alert_type;

  if (role && ROLE_ALERT_MAP[role]) {
    query.target_roles = { $in: [role] };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [alerts, total] = await Promise.all([
    Alert.find(query).sort({ created_at: -1 }).skip(skip).limit(parseInt(limit)),
    Alert.countDocuments(query),
  ]);

  return { alerts, total, page: parseInt(page), limit: parseInt(limit) };
};

exports.getAlert = async (alertId) => {
  const alert = await Alert.findOne({ alert_id: alertId });
  if (!alert) throw new Error('Alert not found.');
  return alert;
};

exports.getBarangayAlerts = async (barangayId, { status, severity, alert_type }) => {
  const query = { barangay_id: barangayId };

  if (status) query.status = status;
  if (severity) query.severity = severity;
  if (alert_type) query.alert_type = alert_type;

  return await Alert.find(query).sort({ created_at: -1 });
};

exports.getPatientAlerts = async (patientId, { status }) => {
  const query = { patient_id: patientId };
  if (status) query.status = status;
  return await Alert.find(query).sort({ created_at: -1 });
};

exports.resolveAlert = async (alertId, user) => {
  const alert = await Alert.findOne({ alert_id: alertId });
  if (!alert) throw new Error('Alert not found.');
  if (alert.status === 'Resolved') throw new Error('Alert is already resolved.');

  alert.status = 'Resolved';
  alert.resolved_at = new Date();
  alert.resolved_by = user.user_id;
  await alert.save();

  if (alert.patient_id) {
    const patient = await Patient.findOne({ patient_id: alert.patient_id });
    if (patient) {
      const unresolvedEscalations = await Alert.countDocuments({
        patient_id: alert.patient_id,
        alert_type: { $in: ['Escalation L1', 'Escalation L2', 'Escalation L3'] },
        status: { $ne: 'Resolved' },
      });

      if (unresolvedEscalations === 0 && patient.escalation.level > 0) {
        await Patient.updateOne(
          { patient_id: alert.patient_id },
          {
            $set: {
              'escalation.level': 0,
              'escalation.acknowledged_by': user.user_id,
              'escalation.acknowledged_at': new Date(),
              updated_at: new Date(),
            },
          }
        );
      }
    }
  }

  return alert;
};

exports.acknowledgeAlert = async (alertId, user) => {
  const alert = await Alert.findOne({ alert_id: alertId });
  if (!alert) throw new Error('Alert not found.');
  if (alert.status === 'Resolved') throw new Error('Cannot acknowledge a resolved alert.');
  if (alert.status === 'Acknowledged') throw new Error('Alert is already acknowledged.');

  alert.status = 'Acknowledged';
  await alert.save();

  return alert;
};

exports.createSystemAlert = async ({
  patient_id,
  tb_case_number,
  barangay_id,
  alert_type,
  escalation_level,
  message,
  severity,
  target_roles,
}) => {
  const existing = await Alert.findOne({
    patient_id,
    alert_type,
    status: { $ne: 'Resolved' },
  });

  if (existing) return existing;

  return await exports.createAlert({
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