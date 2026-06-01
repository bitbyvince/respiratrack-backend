import * as service from './alert.service.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

export const createAlert = async (req, res) => {
  try {
    const alert = await service.createAlert(req.body);
    return sendSuccess(res, 'Alert created.', { alert }, 201);
  } catch (err) { return sendError(res, err); }
};

export const getAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, severity, alert_type, role } = req.query;
    const result = await service.getAlerts(
      { status, severity, alert_type, role: role || req.user.role },
      { page, limit },
    );
    return sendSuccess(res, 'Alerts retrieved.', result);
  } catch (err) { return sendError(res, err); }
};

export const getAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.getAlert(alertId);
    return sendSuccess(res, 'Alert retrieved.', { alert });
  } catch (err) { return sendError(res, err); }
};

export const getBarangayAlerts = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const { status, severity, alert_type } = req.query;
    const alerts = await service.getBarangayAlerts(barangayId, { status, severity, alert_type });
    return sendSuccess(res, 'Barangay alerts retrieved.', { alerts });
  } catch (err) { return sendError(res, err); }
};

export const getPatientAlerts = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status } = req.query;
    const alerts = await service.getPatientAlerts(patientId, { status });
    return sendSuccess(res, 'Patient alerts retrieved.', { alerts });
  } catch (err) { return sendError(res, err); }
};

export const resolveAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.resolveAlert(alertId, req.user);
    return sendSuccess(res, 'Alert resolved.', { alert });
  } catch (err) { return sendError(res, err); }
};

export const acknowledgeAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.acknowledgeAlert(alertId, req.user);
    return sendSuccess(res, 'Alert acknowledged.', { alert });
  } catch (err) { return sendError(res, err); }
};