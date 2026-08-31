import Patient from "../../models/Patient.model.js";
import * as sputumTestService from "./sputum-test.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";

export async function createSputumTest(req, res) {
  try {
    const test = await sputumTestService.createSputumTest(req.body, req.user.user_id);
    return sendSuccess(res, 201, "Sputum test created", test);
  } catch (err) {
    const status = err.message === "Patient not found" ? 404 : err.message.includes("already exists") ? 409 : 500;
    return sendError(res, status, err.message);
  }
}

export async function listSputumTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const result = await sputumTestService.listSputumTests({
      patient_id: req.query.patient_id,
      barangay_id: role === "super_admin" ? req.query.barangay_id : userBarangay,
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

export async function getUpcomingTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const tests = await sputumTestService.getUpcomingTests(
      role === "super_admin" ? req.query.barangay_id : userBarangay,
      req.query.days_ahead ? Number(req.query.days_ahead) : undefined,
    );
    return sendSuccess(res, 200, "Upcoming sputum tests fetched", tests);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getOverdueTests(req, res) {
  try {
    const { role, barangay_id: userBarangay } = req.user;
    const tests = await sputumTestService.getOverdueTests(
      role === "super_admin" ? req.query.barangay_id : userBarangay,
    );
    return sendSuccess(res, 200, "Overdue sputum tests fetched", tests);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}

export async function getPatientSputumSummary(req, res) {
  try {
    const { role, user_id } = req.user;
    const { patientId } = req.params;
    if (role === "patient") {
      const patient = await Patient.findOne({ patient_id: patientId }).select("user_id");
      if (!patient || patient.user_id !== user_id)
        return sendError(res, 403, "Access denied");
    }
    const summary = await sputumTestService.getPatientSputumSummary(patientId);
    return sendSuccess(res, 200, "Patient sputum summary fetched", summary);
  } catch (err) {
    return sendError(res, err.message === "Patient not found" ? 404 : 500, err.message);
  }
}

export async function getSputumTest(req, res) {
  try {
    const test = await sputumTestService.getSputumTestById(req.params.testId);
    const { role, user_id } = req.user;
    if (role === "patient") {
      const patient = await Patient.findOne({ patient_id: test.patient_id }).select("user_id");
      if (!patient || patient.user_id !== user_id)
        return sendError(res, 403, "Access denied");
    }
    return sendSuccess(res, 200, "Sputum test fetched", test);
  } catch (err) {
    return sendError(res, err.message === "Sputum test not found" ? 404 : 500, err.message);
  }
}

export async function enterResult(req, res) {
  try {
    const test = await sputumTestService.enterResult(req.params.testId, req.body, req.user.user_id);
    return sendSuccess(res, 200, "Sputum test result entered", test);
  } catch (err) {
    return sendError(res, err.message === "Sputum test not found" ? 404 : 500, err.message);
  }
}

export async function updateSputumTest(req, res) {
  try {
    const test = await sputumTestService.updateSputumTest(req.params.testId, req.body);
    return sendSuccess(res, 200, "Sputum test updated", test);
  } catch (err) {
    return sendError(res, err.message === "Sputum test not found" ? 404 : 500, err.message);
  }
}

export async function reportSampleSubmitted(req, res) {
  try {
    const patient = await Patient.findOne({ user_id: req.user.user_id });
    if (!patient) return sendError(res, 404, "Patient not found");
    const month = Number(req.params.month);
    const schedule = await sputumTestService.reportSampleSubmitted(patient.patient_id, month);
    return sendSuccess(res, 200, "Thanks — your health center has been notified.", { schedule });
  } catch (err) {
    return sendError(res, 400, err.message);
  }
}

export async function getMySputumTests(req, res) {
  try {
    const patient = await Patient.findOne({ user_id: req.user.user_id });
    if (!patient) return sendError(res, 404, "Patient not found");
    const result = await sputumTestService.listSputumTests({
      patient_id: patient.patient_id,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 60,
    });
    return sendSuccess(res, 200, "Sputum tests fetched", result);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
}