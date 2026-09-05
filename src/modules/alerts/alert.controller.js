import * as service from './alert.service.js';
import { success, error } from '../../utils/apiResponse.js';

export const createAlert = async (req, res) => {
  try {
    const alert = await service.createAlert(req.body);
    return success(res, 'Alert created.', { alert }, 201);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const getAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, severity, alert_type } = req.query;
    const role = req.user.role;
    const barangayId = req.query.barangay_id || req.user.barangay_id;
    const result = await service.getAlerts(
      { status, severity, alert_type, role, barangay_id: barangayId },
      { page, limit },
    );
    return success(res, 'Alerts retrieved.', result);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const getAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.getAlert(alertId);
    return success(res, 'Alert retrieved.', { alert });
  } catch (err) {
    return error(res, err.message, 404);
  }
};

export const getBarangayAlerts = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const { status, severity, alert_type } = req.query;
    const alerts = await service.getBarangayAlerts(barangayId, { status, severity, alert_type });
    return success(res, 'Barangay alerts retrieved.', { alerts });
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const getPatientAlerts = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status } = req.query;
    const alerts = await service.getPatientAlerts(patientId, { status });
    return success(res, 'Patient alerts retrieved.', { alerts });
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const resolveAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.resolveAlert(alertId, req.user);
    return success(res, 'Alert resolved.', { alert });
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const acknowledgeAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.acknowledgeAlert(alertId, req.user);
    return success(res, 'Alert acknowledged.', { alert });
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const sendFollowUp = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { message } = req.body;
    const result = await service.sendFollowUp(alertId, message);
    return success(res, 'Follow-up notification sent.', result);
  } catch (err) {
    return error(res, err.message, 400);
  }
};

export const checkEscalations = async (req, res) => {
  try {
    const barangayId = req.user.barangay_id;
    if (!barangayId) return error(res, 'No barangay associated with this user.', 400);
    const result = await service.checkAndTriggerEscalations(barangayId);
    return success(res, 'Escalation check complete.', result);
  } catch (err) {
    console.error('ESCALATION ERROR:', err);
    return error(res, err.message, 500);
  }
};