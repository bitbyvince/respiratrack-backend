const userService = require("./user.service");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

// ================================================================
// STAFF
// ================================================================

const listStaff = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      // barangay_admin can only see staff in their own barangay
      ...(req.user.role === "barangay_admin" && {
        barangay_id: req.user.barangay_id,
      }),
    };
    const result = await userService.listStaff(filters);
    return sendSuccess(res, 200, "Staff list retrieved.", result);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

const getStaff = async (req, res) => {
  try {
    const user = await userService.getStaffById(req.params.user_id, req.user);
    return sendSuccess(res, 200, "Staff retrieved.", user);
  } catch (err) {
    return sendError(res, err.statusCode || 404, err.message);
  }
};

const createStaff = async (req, res) => {
  try {
    const newUser = await userService.createStaff(req.body, req.user);
    return sendSuccess(
      res,
      201,
      "Staff account created successfully.",
      newUser,
    );
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

const updateStaff = async (req, res) => {
  try {
    const updated = await userService.updateStaff(
      req.params.user_id,
      req.body,
      req.user,
    );
    return sendSuccess(res, 200, "Staff account updated.", updated);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

const deactivateStaff = async (req, res) => {
  try {
    await userService.setStaffActiveStatus(req.params.user_id, false, req.user);
    return sendSuccess(res, 200, "Staff account deactivated.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

const reactivateStaff = async (req, res) => {
  try {
    await userService.setStaffActiveStatus(req.params.user_id, true, req.user);
    return sendSuccess(res, 200, "Staff account reactivated.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

const deleteStaff = async (req, res) => {
  try {
    await userService.deleteStaff(req.params.user_id, req.user);
    return sendSuccess(res, 200, "Staff account permanently deleted.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ================================================================
// PATIENT ACCOUNTS
// ================================================================

const listPatientAccounts = async (req, res) => {
  try {
    const filters = {
      ...req.query,
      ...(req.user.role !== "super_admin" && {
        barangay_id: req.user.barangay_id,
      }),
    };
    const result = await userService.listPatientAccounts(filters);
    return sendSuccess(res, 200, "Patient accounts retrieved.", result);
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

const getPatientAccount = async (req, res) => {
  try {
    const user = await userService.getPatientAccountById(
      req.params.user_id,
      req.user,
    );
    return sendSuccess(res, 200, "Patient account retrieved.", user);
  } catch (err) {
    return sendError(res, err.statusCode || 404, err.message);
  }
};

const createPatientAccount = async (req, res) => {
  try {
    const newUser = await userService.createPatientAccount(req.body, req.user);
    return sendSuccess(
      res,
      201,
      "Patient mobile account created successfully.",
      newUser,
    );
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

const updatePatientAccount = async (req, res) => {
  try {
    const updated = await userService.updatePatientAccount(
      req.params.user_id,
      req.body,
      req.user,
    );
    return sendSuccess(res, 200, "Patient account updated.", updated);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

const deactivatePatientAccount = async (req, res) => {
  try {
    await userService.setPatientAccountActiveStatus(
      req.params.user_id,
      false,
      req.user,
    );
    return sendSuccess(res, 200, "Patient account deactivated.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

const reactivatePatientAccount = async (req, res) => {
  try {
    await userService.setPatientAccountActiveStatus(
      req.params.user_id,
      true,
      req.user,
    );
    return sendSuccess(res, 200, "Patient account reactivated.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ================================================================
// SELF-SERVICE
// ================================================================

const getMyProfile = async (req, res) => {
  try {
    const user = await userService.getUserById(req.user.user_id);
    return sendSuccess(res, 200, "Profile retrieved.", user);
  } catch (err) {
    return sendError(res, err.statusCode || 404, err.message);
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const updated = await userService.updateMyProfile(
      req.user.user_id,
      req.body,
    );
    return sendSuccess(res, 200, "Profile updated successfully.", updated);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

module.exports = {
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  reactivateStaff,
  deleteStaff,
  listPatientAccounts,
  getPatientAccount,
  createPatientAccount,
  updatePatientAccount,
  deactivatePatientAccount,
  reactivatePatientAccount,
  getMyProfile,
  updateMyProfile,
};
