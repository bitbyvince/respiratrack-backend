import * as escalationService from './escalation.service.js';
import { sendSuccess, sendError } from '../../utils/apiResponse.js';

export async function triggerEscalation(req, res) {
  try {
    const { patient_id, consecutive_missed_doses } = req.body;
    const result = await escalationService.triggerEscalation(patient_id, consecutive_missed_doses);

    if (!result.created) {
      return sendSuccess(res, 200, 'No new escalation required or already exists', result);
    }
    return sendSuccess(res, 201, `Escalation Level ${result.level} triggered`, result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function listEscalations(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangay_id = role === 'super_admin' ? req.query.barangay_id : userBarangay;

    const filters = {
      barangay_id,
      patient_id: req.query.patient_id,
      level: req.query.level !== undefined ? Number(req.query.level) : undefined,
      resolved: req.query.resolved !== undefined ? req.query.resolved === 'true' : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    };

    const result = await escalationService.listEscalations(filters);
    return sendSuccess(res, 200, 'Escalations fetched', result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getEscalation(req, res) {
  try {
    const escalation = await escalationService.getEscalationById(req.params.escalationId);
    return sendSuccess(res, 200, 'Escalation fetched', escalation);
  } catch (err) {
    const status = err.message === 'Escalation not found' ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

export async function acknowledgeEscalation(req, res) {
  try {
    const escalation = await escalationService.acknowledgeEscalation(
      req.params.escalationId,
      req.user.user_id,
      req.body.acknowledgement_notes,
    );
    return sendSuccess(res, 200, 'Escalation acknowledged', escalation);
  } catch (err) {
    const status = err.message === 'Escalation not found' ? 404 : 400;
    return sendError(res, status, err.message);
  }
}

export async function resolveEscalation(req, res) {
  try {
    const escalation = await escalationService.resolveEscalation(
      req.params.escalationId,
      req.user.user_id,
      req.body.resolution_notes,
    );
    return sendSuccess(res, 200, 'Escalation resolved', escalation);
  } catch (err) {
    const status = err.message === 'Escalation not found' ? 404 : 400;
    return sendError(res, status, err.message);
  }
}