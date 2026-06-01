import Patient from "../../models/Patient.model.js";
import * as sputumTestService from "./sputum-test.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export async function createSputumTest(req, res) {
  try {
    const test = await sputumTestService.createSputumTest(
      req.body,
      req.user.user_id,
    );
    return sendSuccess(res, "Sputum test created", test, 201);
  } catch (err) {
    const status =
      err.message === "Patient not found"
        ? 404
        : err.message.includes("already exists")
          ? 409
          : 500;
    return sendError(res, err);
  }
}

export async function listSputumTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const result = await sputumTestService.listSputumTests({
      patient_id: req.query.patient_id,
      barangay_id:
        role === "super_admin" ? req.query.barangay_id : userBarangay,
      result: req.query.result,
      month: req.query.month ? Number(req.query.month) : undefined,
      overdue_only: req.query.overdue_only === "true",
      from: req.query.from,
      to: req.query.to,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    });
    return sendSuccess(res, "Sputum tests fetched", result, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getUpcomingTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const tests = await sputumTestService.getUpcomingTests(
      role === "super_admin" ? req.query.barangay_id : userBarangay,
      req.query.days_ahead ? Number(req.query.days_ahead) : undefined,
    );
    return sendSuccess(res, "Upcoming sputum tests fetched", tests, 200);
  } catch (err) {
    return sendError(res, err);
  }
}

export async function getOverdueTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const tests = await sputumTestService.getOverdueTests(
      role === "super_admin" ? req.query.barangay_id : userBarangay,
    );
    return sendSuccess(res, "Overdue sputum tests fetched", tests, 200);
  } catch (err) { return sendError(res, err); }
}

export async function getPatientSputumSummary(req, res) {
  try {
    const { role, user_id } = req.user;
    const { patientId } = req.params;
    if (role === "patient") {
      const patient = await Patient.findOne({ patient_id: patientId }).select(
        "user_id",
      );
      if (!patient || patient.user_id !== user_id)
        return sendError(res, { statusCode: 403, message: "Access denied" });
    }
    const summary = await sputumTestService.getPatientSputumSummary(patientId);
    return sendSuccess(res, "Patient sputum summary fetched", summary, 200);
  } catch (err) { return sendError(res, err); }
}

export async function getSputumTest(req, res) {
  try {
    const test = await sputumTestService.getSputumTestById(req.params.testId);
    const { role, user_id } = req.user;
    if (role === "patient") {
      const patient = await Patient.findOne({
        patient_id: test.patient_id,
      }).select("user_id");
      if (!patient || patient.user_id !== user_id)
        return sendError(res, { statusCode: 403, message: "Access denied" });
    }
    return sendSuccess(res, "Sputum test fetched", test, 200);
  } catch (err) { return sendError(res, err); }
}

export async function enterResult(req, res) {
  try {
    const test = await sputumTestService.enterResult(
      req.params.testId,
      req.body,
      req.user.user_id,
    );
    return sendSuccess(res, "Sputum test result entered", test, 200);
  } catch (err) { return sendError(res, err); }
}

export async function updateSputumTest(req, res) {
  try {
    const test = await sputumTestService.updateSputumTest(
      req.params.testId,
      req.body,
    );
    return sendSuccess(res, "Sputum test updated", test, 200);
  } catch (err) { return sendError(res, err); }
}

export const getMyTests = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const summary = await sputumTestService.getPatientSputumSummary(req.user.patient_id);
    return sendSuccess(res, "Sputum tests retrieved.", summary);
  } catch (err) { return sendError(res, err); }
};
