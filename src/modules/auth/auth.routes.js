import { Router } from "express";
import * as authController from "./auth.controller.js";
import { validate } from "../../middleware/validate.middleware.js";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import {
  loginSchema,
  patientLoginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  changePinSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from "./auth.validator.js";

const router = Router();

// ── STAFF LOGIN (super_admin, barangay_admin, nurse) ─────
router.post("/login", validate(loginSchema), authController.staffLogin);

// ── PATIENT LOGIN (mobile app) ───────────────────────────
router.post("/patient-login", validate(patientLoginSchema), authController.patientLogin);

// ── REFRESH ACCESS TOKEN ─────────────────────────────────
router.post("/refresh", validate(refreshTokenSchema), authController.refreshToken);

// ── LOGOUT ───────────────────────────────────────────────
router.post("/logout", authMiddleware, authController.logout);

// ── CHANGE PASSWORD (staff only) ─────────────────────────
router.post(
  "/change-password",
  authMiddleware,
  validate(changePasswordSchema),
  authController.changePassword
);

// ── CHANGE PIN (patient only) ────────────────────────────
router.post(
  "/change-pin",
  authMiddleware,
  validate(changePinSchema),
  authController.changePin
);

// ── OTP — REQUEST (Firebase SMS) ─────────────────────────
router.post("/otp/request", validate(requestOtpSchema), authController.requestOtp);

// ── OTP — VERIFY ─────────────────────────────────────────
router.post("/otp/verify", validate(verifyOtpSchema), authController.verifyOtp);

// ── GET CURRENT USER ─────────────────────────────────────
router.get("/me", authMiddleware, authController.getMe);

// ── VERIFY TOKEN ─────────────────────────────────────────
router.get("/verify", authMiddleware, authController.verifyToken);

export default router;