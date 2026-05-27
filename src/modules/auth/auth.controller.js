const authService = require("./auth.service");
const { sendSuccess, sendError } = require("../../utils/apiResponse");

// ── STAFF LOGIN ──────────────────────────────────────────
const staffLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.staffLogin(email, password);
    return sendSuccess(res, 200, "Login successful.", result);
  } catch (err) {
    return sendError(res, err.statusCode || 401, err.message);
  }
};

// ── PATIENT LOGIN ────────────────────────────────────────
const patientLogin = async (req, res) => {
  try {
    // identifier = tb_case_number | phone_number | email
    const { identifier, pin } = req.body;
    const result = await authService.patientLogin(identifier, pin);
    return sendSuccess(res, 200, "Login successful.", result);
  } catch (err) {
    return sendError(res, err.statusCode || 401, err.message);
  }
};

// ── REFRESH TOKEN ────────────────────────────────────────
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.rotateRefreshToken(refreshToken);
    return sendSuccess(res, 200, "Token refreshed.", result);
  } catch (err) {
    return sendError(res, err.statusCode || 401, err.message);
  }
};

// ── LOGOUT ───────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    await authService.logout(req.user.user_id);
    return sendSuccess(res, 200, "Logged out successfully.");
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

// ── CHANGE PASSWORD ──────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    await authService.changePassword(
      req.user.user_id,
      current_password,
      new_password,
    );
    return sendSuccess(res, 200, "Password updated successfully.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── CHANGE PIN ───────────────────────────────────────────
const changePin = async (req, res) => {
  try {
    const { current_pin, new_pin } = req.body;
    await authService.changePin(req.user.user_id, current_pin, new_pin);
    return sendSuccess(res, 200, "PIN updated successfully.");
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── REQUEST OTP ──────────────────────────────────────────
const requestOtp = async (req, res) => {
  try {
    const { phone_number } = req.body;
    await authService.requestOtp(phone_number);
    return sendSuccess(res, 200, "OTP sent to the provided phone number.");
  } catch (err) {
    return sendError(res, err.statusCode || 500, err.message);
  }
};

// ── VERIFY OTP ───────────────────────────────────────────
const verifyOtp = async (req, res) => {
  try {
    const { phone_number, otp_code } = req.body;
    const result = await authService.verifyOtp(phone_number, otp_code);
    return sendSuccess(res, 200, "OTP verified successfully.", result);
  } catch (err) {
    return sendError(res, err.statusCode || 400, err.message);
  }
};

// ── GET CURRENT USER ─────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await authService.getMe(req.user.user_id);
    return sendSuccess(res, 200, "User retrieved.", user);
  } catch (err) {
    return sendError(res, err.statusCode || 404, err.message);
  }
};

module.exports = {
  staffLogin,
  patientLogin,
  refreshToken,
  logout,
  changePassword,
  changePin,
  requestOtp,
  verifyOtp,
  getMe,
};
