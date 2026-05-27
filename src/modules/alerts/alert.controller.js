import * as service from './alert.service.js';
import { success, error } from '../../utils/apiResponse.js';

export const createAlert = async (req, res) => {
  try {
    const alert = await service.createAlert(req.body);
    return res.status(201).json(success('Alert created.', { alert }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const getAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, severity, alert_type, role } = req.query;
    const result = await service.getAlerts(
      { status, severity, alert_type, role: role || req.user.role },
      { page, limit },
    );
    return res.status(200).json(success('Alerts retrieved.', result));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const getAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.getAlert(alertId);
    return res.status(200).json(success('Alert retrieved.', { alert }));
  } catch (err) {
    return res.status(404).json(error(err.message));
  }
};

export const getBarangayAlerts = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const { status, severity, alert_type } = req.query;
    const alerts = await service.getBarangayAlerts(barangayId, { status, severity, alert_type });
    return res.status(200).json(success('Barangay alerts retrieved.', { alerts }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const getPatientAlerts = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { status } = req.query;
    const alerts = await service.getPatientAlerts(patientId, { status });
    return res.status(200).json(success('Patient alerts retrieved.', { alerts }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const resolveAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.resolveAlert(alertId, req.user);
    return res.status(200).json(success('Alert resolved.', { alert }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};

export const acknowledgeAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const alert = await service.acknowledgeAlert(alertId, req.user);
    return res.status(200).json(success('Alert acknowledged.', { alert }));
  } catch (err) {
    return res.status(400).json(error(err.message));
  }
};