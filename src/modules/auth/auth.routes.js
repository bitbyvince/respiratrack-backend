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
  setPatientPinSchema,
} from "./auth.validator.js";

const router = Router();

router.post("/login", validate(loginSchema), authController.staffLogin);
router.post("/patient-login", validate(patientLoginSchema), authController.patientLogin);
router.post("/staff/login", validate(loginSchema), authController.staffLogin);
router.post("/set-pin", authMiddleware, validate(setPatientPinSchema), authController.setPatientPin);
router.post("/refresh", validate(refreshTokenSchema), authController.refreshToken);
router.post("/logout", authMiddleware, authController.logout);
router.post("/change-password", authMiddleware, validate(changePasswordSchema), authController.changePassword);
router.post("/change-pin", authMiddleware, validate(changePinSchema), authController.changePin);
router.post("/otp/request", validate(requestOtpSchema), authController.requestOtp);
router.post("/otp/verify", validate(verifyOtpSchema), authController.verifyOtp);
router.get("/me", authMiddleware, authController.getMe);

export default router;