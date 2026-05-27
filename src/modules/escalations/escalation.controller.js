const escalationService = require("./escalation.service");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

/**
 * POST /escalations/trigger
 * Body: { patient_id, consecutive_missed_doses }
 * Role: system / super_admin (internal or admin override)
 */
async function triggerEscalation(req, res) {
  try {
    const { patient_id, consecutive_missed_doses } = req.body;
    const result = await escalationService.triggerEscalation(
      patient_id,
      consecutive_missed_doses
    );

    if (!result.created) {
      return sendSuccess(res, 200, "No new escalation required or already exists", result);
    }
    return sendSuccess(res, 201, `Escalation Level ${result.level} triggered`, result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /escalations
 * Query: barangay_id?, patient_id?, level?, resolved?, page?, limit?
 * Role: nurse (own barangay), barangay_admin (own barangay), super_admin (all)
 */
async function listEscalations(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    // Scope nurses and barangay admins to their own barangay
    const barangay_id =
      role === "super_admin"
        ? req.query.barangay_id
        : userBarangay;

    const filters = {
      barangay_id,
      patient_id: req.query.patient_id,
      level: req.query.level !== undefined ? Number(req.query.level) : undefined,
      resolved:
        req.query.resolved !== undefined
          ? req.query.resolved === "true"
          : undefined,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    };

    const result = await escalationService.listEscalations(filters);
    return sendSuccess(res, 200, "Escalations fetched", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /escalations/:escalationId
 * Role: nurse, barangay_admin, super_admin
 */
async function getEscalation(req, res) {
  try {
    const escalation = await escalationService.getEscalationById(
      req.params.escalationId
    );
    return sendSuccess(res, 200, "Escalation fetched", escalation);
  } catch (err) {
    const status = err.message === "Escalation not found" ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

/**
 * PATCH /escalations/:escalationId/acknowledge
 * Body: { acknowledgement_notes? }
 * Role: nurse, barangay_admin, super_admin
 */
async function acknowledgeEscalation(req, res) {
  try {
    const escalation = await escalationService.acknowledgeEscalation(
      req.params.escalationId,
      req.user.user_id,
      req.body.acknowledgement_notes
    );
    return sendSuccess(res, 200, "Escalation acknowledged", escalation);
  } catch (err) {
    const status = err.message === "Escalation not found" ? 404 : 400;
    return sendError(res, status, err.message);
  }
}

/**
 * PATCH /escalations/:escalationId/resolve
 * Body: { resolution_notes? }
 * Role: nurse, barangay_admin, super_admin
 */
async function resolveEscalation(req, res) {
  try {
    const escalation = await escalationService.resolveEscalation(
      req.params.escalationId,
      req.user.user_id,
      req.body.resolution_notes
    );
    return sendSuccess(res, 200, "Escalation resolved", escalation);
  } catch (err) {
    const status = err.message === "Escalation not found" ? 404 : 400;
    return sendError(res, status, err.message);
  }
}

module.exports = {
  triggerEscalation,
  listEscalations,
  getEscalation,
  acknowledgeEscalation,
  resolveEscalation,
};