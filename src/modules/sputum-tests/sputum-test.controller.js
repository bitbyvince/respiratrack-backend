const sputumTestService = require("./sputum-test.service");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

/**
 * POST /sputum-tests
 * Creates a new sputum test record for a patient.
 * Automatically upserts a Sputum Test Due alert.
 *
 * Body: { patient_id, month, due_date, date_collected?, notes? }
 * Role: nurse, barangay_admin, super_admin
 */
async function createSputumTest(req, res) {
  try {
    const test = await sputumTestService.createSputumTest(
      req.body,
      req.user.user_id
    );
    return sendSuccess(res, 201, "Sputum test created", test);
  } catch (err) {
    const status =
      err.message === "Patient not found"
        ? 404
        : err.message.includes("already exists")
        ? 409
        : 500;
    return sendError(res, status, err.message);
  }
}

/**
 * GET /sputum-tests
 * Paginated list of sputum tests with optional filters.
 * Nurse/barangay_admin scoped to their own barangay.
 *
 * Query: patient_id?, barangay_id?, result?, month?,
 *        overdue_only?, from?, to?, page?, limit?
 * Role:  super_admin, barangay_admin, nurse
 */
async function listSputumTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin" ? req.query.barangay_id : userBarangay;

    const result = await sputumTestService.listSputumTests({
      patient_id: req.query.patient_id,
      barangay_id: barangayId,
      result: req.query.result,
      month: req.query.month ? Number(req.query.month) : undefined,
      overdue_only: req.query.overdue_only === "true",
      from: req.query.from,
      to: req.query.to,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });

    return sendSuccess(res, 200, "Sputum tests fetched", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /sputum-tests/upcoming
 * Returns tests due within the next N days.
 * Powers the upcoming tests panel on the nurse dashboard.
 *
 * Query: barangay_id?, days_ahead?
 * Role:  super_admin, barangay_admin, nurse
 */
async function getUpcomingTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin" ? req.query.barangay_id : userBarangay;

    const tests = await sputumTestService.getUpcomingTests(
      barangayId,
      req.query.days_ahead ? Number(req.query.days_ahead) : undefined
    );

    return sendSuccess(res, 200, "Upcoming sputum tests fetched", tests);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /sputum-tests/overdue
 * Returns all Pending tests past their due date.
 * Powers the overdue tests alert panel.
 *
 * Query: barangay_id?
 * Role:  super_admin, barangay_admin, nurse
 */
async function getOverdueTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;

    const barangayId =
      role === "super_admin" ? req.query.barangay_id : userBarangay;

    const tests = await sputumTestService.getOverdueTests(barangayId);

    return sendSuccess(res, 200, "Overdue sputum tests fetched", tests);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

/**
 * GET /sputum-tests/patient/:patientId/summary
 * Full sputum test summary for a patient.
 * Powers the sputum tracker screen on the mobile app (Module 7).
 *
 * Role: super_admin, barangay_admin, nurse, patient (own)
 */
async function getPatientSputumSummary(req, res) {
  try {
    const { role, user_id, barangay_id: userBarangay } = req.user;
    const { patientId } = req.params;

    // Patients may only view their own summary
    if (role === "patient") {
      const patient = await require("../../models/Patient.model").findOne({
        patient_id: patientId,
      }).select("user_id");
      if (!patient || patient.user_id !== user_id) {
        return sendError(res, 403, "Access denied");
      }
    }

    const summary = await sputumTestService.getPatientSputumSummary(patientId);
    return sendSuccess(res, 200, "Patient sputum summary fetched", summary);
  } catch (err) {
    const status = err.message === "Patient not found" ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

/**
 * GET /sputum-tests/:testId
 * Fetch a single sputum test record by test_id.
 *
 * Role: super_admin, barangay_admin, nurse, patient (own)
 */
async function getSputumTest(req, res) {
  try {
    const test = await sputumTestService.getSputumTestById(req.params.testId);

    // Patients may only view their own tests
    const { role, user_id } = req.user;
    if (role === "patient") {
      const patient = await require("../../models/Patient.model").findOne({
        patient_id: test.patient_id,
      }).select("user_id");
      if (!patient || patient.user_id !== user_id) {
        return sendError(res, 403, "Access denied");
      }
    }

    return sendSuccess(res, 200, "Sputum test fetched", test);
  } catch (err) {
    const status = err.message === "Sputum test not found" ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

/**
 * PATCH /sputum-tests/:testId/result
 * Enters or updates the lab result for a sputum test.
 * Resolves the Sputum Test Due alert and syncs the patient schedule.
 *
 * Body: { result, date_collected?, notes? }
 * Role: nurse, barangay_admin, super_admin
 */
async function enterResult(req, res) {
  try {
    const test = await sputumTestService.enterResult(
      req.params.testId,
      req.body,
      req.user.user_id
    );
    return sendSuccess(res, 200, "Sputum test result entered", test);
  } catch (err) {
    const status = err.message === "Sputum test not found" ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

/**
 * PATCH /sputum-tests/:testId
 * Updates non-result fields — due_date, date_collected, notes.
 *
 * Body: { due_date?, date_collected?, notes? }
 * Role: nurse, barangay_admin, super_admin
 */
async function updateSputumTest(req, res) {
  try {
    const test = await sputumTestService.updateSputumTest(
      req.params.testId,
      req.body
    );
    return sendSuccess(res, 200, "Sputum test updated", test);
  } catch (err) {
    const status = err.message === "Sputum test not found" ? 404 : 500;
    return sendError(res, status, err.message);
  }
}

module.exports = {
  createSputumTest,
  listSputumTests,
  getUpcomingTests,
  getOverdueTests,
  getPatientSputumSummary,
  getSputumTest,
  enterResult,
  updateSputumTest,
};