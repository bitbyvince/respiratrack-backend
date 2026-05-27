const express = require("express");
const router = express.Router();
const authController = require("./auth.controller");
const { validate } = require("../../middleware/validate.middleware");
const { authMiddleware } = require("../../middleware/auth.middleware");
const {
  loginSchema,
  patientLoginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  changePinSchema,
  requestOtpSchema,
  verifyOtpSchema,
} = require("./auth.validator");

// ── STAFF LOGIN (super_admin, barangay_admin, nurse) ─────
// POST /api/auth/login
router.post("/login", validate(loginSchema), authController.staffLogin);

// ── PATIENT LOGIN (mobile app) ───────────────────────────
// POST /api/auth/patient-login
// Accepts: tb_case_number | phone_number | email + PIN
router.post(
  "/patient-login",
  validate(patientLoginSchema),
  authController.patientLogin,
);

// ── REFRESH ACCESS TOKEN ─────────────────────────────────
// POST /api/auth/refresh
router.post(
  "/refresh",
  validate(refreshTokenSchema),
  authController.refreshToken,
);

// ── LOGOUT ───────────────────────────────────────────────
// POST /api/auth/logout  (invalidates refresh token)
router.post("/logout", authMiddleware, authController.logout);

// ── CHANGE PASSWORD (staff only) ─────────────────────────
// POST /api/auth/change-password
router.post(
  "/change-password",
  authMiddleware,
  validate(changePasswordSchema),
  authController.changePassword,
);

// ── CHANGE PIN (patient only) ────────────────────────────
// POST /api/auth/change-pin
router.post(
  "/change-pin",
  authMiddleware,
  validate(changePinSchema),
  authController.changePin,
);

// ── OTP — REQUEST (Firebase SMS) ─────────────────────────
// POST /api/auth/otp/request
router.post(
  "/otp/request",
  validate(requestOtpSchema),
  authController.requestOtp,
);

// ── OTP — VERIFY ─────────────────────────────────────────
// POST /api/auth/otp/verify
router.post("/otp/verify", validate(verifyOtpSchema), authController.verifyOtp);

// ── GET CURRENT USER ─────────────────────────────────────
// GET /api/auth/me
router.get("/me", authMiddleware, authController.getMe);

module.exports = router;
