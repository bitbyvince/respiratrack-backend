import * as userService from "./user.service.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { isSuperAdminLevel } from "../../constants/roles.js";

export const listStaff = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      ...(req.user.role === "barangay_admin" && { barangay_id: req.user.barangay_id }),
    };
    return sendSuccess(res, 200, "Staff list retrieved.", await userService.listStaff(filters));
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const getStaff = async (req, res) => {
  try {
    return sendSuccess(res, 200, "Staff retrieved.", await userService.getStaffById(req.params.user_id, req.user));
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const createStaff = async (req, res) => {
  try {
    return sendSuccess(res, "Staff account created successfully.", await userService.createStaff(req.body, req.user), 201);
  } catch (err) {
    return sendError(res, err);
  }
};

export const updateStaff = async (req, res) => {
  try {
    return sendSuccess(res, "Staff account updated.", await userService.updateStaff(req.params.user_id, req.body, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};

export const deactivateStaff = async (req, res) => {
  try {
    await userService.setStaffActiveStatus(req.params.user_id, false, req.user);
    return sendSuccess(res, "Staff account deactivated.");
  } catch (err) {
    return sendError(res, err);
  }
};

export const reactivateStaff = async (req, res) => {
  try {
    await userService.setStaffActiveStatus(req.params.user_id, true, req.user);
    return sendSuccess(res, "Staff account reactivated.");
  } catch (err) {
    return sendError(res, err);
  }
};

export const deleteStaff = async (req, res) => {
  try {
    await userService.deleteStaff(req.params.user_id, req.user);
    return sendSuccess(res, "Staff account permanently deleted.");
  } catch (err) {
    return sendError(res, err);
  }
};

export const listPatientAccounts = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      ...(!isSuperAdminLevel(req.user.role) && { barangay_id: req.user.barangay_id }),
    };
    return sendSuccess(res, 200, "Patient accounts retrieved.", await userService.listPatientAccounts(filters));
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const getPatientAccount = async (req, res) => {
  try {
    return sendSuccess(res, 200, "Patient account retrieved.", await userService.getPatientAccountById(req.params.user_id, req.user));
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const createPatientAccount = async (req, res) => {
  try {
    return sendSuccess(res, 201, "Patient mobile account created successfully.", await userService.createPatientAccount(req.body, req.user));
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

export const updatePatientAccount = async (req, res) => {
  try {
    return sendSuccess(res, "Patient account updated.", await userService.updatePatientAccount(req.params.user_id, req.body, req.user));
  } catch (err) {
    return sendError(res, err);
  }
};

export const deactivatePatientAccount = async (req, res) => {
  try {
    await userService.setPatientAccountActiveStatus(req.params.user_id, false, req.user);
    return sendSuccess(res, "Patient account deactivated.");
  } catch (err) {
    return sendError(res, err);
  }
};

export const reactivatePatientAccount = async (req, res) => {
  try {
    await userService.setPatientAccountActiveStatus(req.params.user_id, true, req.user);
    return sendSuccess(res, "Patient account reactivated.");
  } catch (err) {
    return sendError(res, err);
  }
};

export const getMyProfile = async (req, res) => {
  try {
    return sendSuccess(res, "Profile retrieved.", await userService.getUserById(req.user.user_id));
  } catch (err) {
    return sendError(res, err);
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    return sendSuccess(res, "Profile updated successfully.", await userService.updateMyProfile(req.user.user_id, req.body));
  } catch (err) {
    return sendError(res, err);
  }
};

export const resetPatientPin = async (req, res) => {
  try {
    const result = await userService.resetPatientPin(req.params.patient_id, req.user);
    return sendSuccess(res, 'PIN reset successfully.', result);
  } catch (err) {
    return sendError(res, err);
  }
};