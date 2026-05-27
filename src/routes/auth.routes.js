import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";

import PublicUser from "../models/PublicUser.js";
import Nurse from "../models/Nurse.js";
import BarangayAdmin from "../models/BarangayAdmin.js";
import SuperAdmin from "../models/SuperAdmin.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import {
  verifyFirebaseToken,
  createOtpSession,
  verifyOtpSession,
  saveFcmToken,
} from "../services/firebase.service.js";

const router = express.Router();

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const generateToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });

const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res
      .status(400)
      .json({ message: "Validation failed", errors: errors.array() });
    return true;
  }
  return false;
};

// ─── MODEL MAP ────────────────────────────────────────────────────────────────
// Maps a role string to its Mongoose model for shared login logic

const roleModelMap = {
  nurse: Nurse,
  barangay_admin: BarangayAdmin,
  super_admin: SuperAdmin,
};

// =============================================================================
// PUBLIC USER — Register + OTP (Firebase Phone Auth)
// =============================================================================

/**
 * POST /api/auth/public/register
 * Step 1 of public user registration:
 * Validate inputs, hash password, save user, create OTP session in Firestore.
 * The Flutter app handles sending the actual OTP via Firebase Phone Auth SDK.
 */
router.post(
  "/public/register",
  [
    body("contact_number")
      .matches(/^\+639\d{9}$/)
      .withMessage("Contact number must be in format +639XXXXXXXXX"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("full_name")
      .optional()
      .trim()
      .isLength({ min: 2 })
      .withMessage("Full name must be at least 2 characters"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { contact_number, password, full_name, email } = req.body;

    try {
      // Check if contact number already registered
      const existing = await PublicUser.findOne({ contact_number });
      if (existing) {
        return res
          .status(409)
          .json({ message: "Contact number already registered." });
      }

      const password_hash = await bcrypt.hash(password, 12);

      const user = await PublicUser.create({
        contact_number,
        password_hash,
        full_name: full_name || null,
        email: email || null,
        otp_verified: false,
      });

      // Create OTP session in Firestore for tracking
      const sessionId = `${user._id}_${Date.now()}`;
      await createOtpSession(contact_number, sessionId);

      res.status(201).json({
        message:
          "Registration successful. Please verify your phone number with OTP.",
        user_id: user._id,
        session_id: sessionId,
      });
    } catch (err) {
      console.error("Public register error:", err);
      res.status(500).json({ message: "Server error during registration." });
    }
  },
);

/**
 * POST /api/auth/public/verify-otp
 * Step 2: After the user enters the OTP in the Flutter app and Firebase verifies it,
 * Flutter sends the Firebase ID token here. We verify it and mark the user as verified.
 */
router.post(
  "/public/verify-otp",
  [
    body("firebase_id_token")
      .notEmpty()
      .withMessage("Firebase ID token is required"),
    body("user_id").notEmpty().withMessage("User ID is required"),
    body("session_id").notEmpty().withMessage("Session ID is required"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { firebase_id_token, user_id, session_id } = req.body;

    try {
      // Verify the Firebase token
      const firebaseResult = await verifyFirebaseToken(firebase_id_token);
      if (!firebaseResult.success) {
        return res.status(401).json({ message: "Invalid Firebase token." });
      }

      // Clean up OTP session from Firestore
      await verifyOtpSession(session_id);

      // Mark user as OTP verified in MongoDB
      const user = await PublicUser.findByIdAndUpdate(
        user_id,
        { otp_verified: true },
        { new: true },
      );

      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }

      const token = generateToken({
        id: user._id,
        role: "public_user",
      });

      res.json({
        message: "Phone number verified successfully.",
        token,
        user: {
          id: user._id,
          full_name: user.full_name,
          contact_number: user.contact_number,
          role: "public_user",
        },
      });
    } catch (err) {
      console.error("OTP verify error:", err);
      res
        .status(500)
        .json({ message: "Server error during OTP verification." });
    }
  },
);

/**
 * POST /api/auth/public/login
 * Login for already-registered and verified public users.
 */
router.post(
  "/public/login",
  [
    body("contact_number").notEmpty().withMessage("Contact number is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { contact_number, password } = req.body;

    try {
      const user = await PublicUser.findOne({ contact_number });
      if (!user) {
        return res
          .status(401)
          .json({ message: "Invalid contact number or password." });
      }

      if (!user.otp_verified) {
        return res
          .status(403)
          .json({
            message:
              "Phone number not verified. Please complete OTP verification.",
          });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res
          .status(401)
          .json({ message: "Invalid contact number or password." });
      }

      const token = generateToken({ id: user._id, role: "public_user" });

      res.json({
        message: "Login successful.",
        token,
        user: {
          id: user._id,
          full_name: user.full_name,
          contact_number: user.contact_number,
          role: "public_user",
        },
      });
    } catch (err) {
      console.error("Public login error:", err);
      res.status(500).json({ message: "Server error during login." });
    }
  },
);

// =============================================================================
// STAFF LOGIN — Nurse, Barangay Admin, Super Admin
// All staff use email + password (no OTP)
// =============================================================================

/**
 * POST /api/auth/staff/login
 * Unified login for nurse, barangay_admin, and super_admin.
 * Body: { email, password, role }
 */
router.post(
  "/staff/login",
  [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
    body("role")
      .isIn(["nurse", "barangay_admin", "super_admin"])
      .withMessage("Role must be nurse, barangay_admin, or super_admin"),
  ],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { email, password, role, barangay_name } = req.body;

    try {
      const Model = roleModelMap[role]; // ✅ Model defined first

      if (!Model) {
        return res.status(400).json({ message: "Invalid role." });
      }

      const user = await Model.findOne({ email }); // ✅ then used here

      if (!user) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      console.log('DB barangay_name:', JSON.stringify(user.barangay_name));
console.log('Sent barangay_name:', JSON.stringify(barangay_name));

      // ✅ Barangay validation after user is found
      if (role === "barangay_admin" && user.barangay_name !== barangay_name) {
        return res.status(401).json({ message: "Selected barangay does not match your account." });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      user.last_login = new Date();
      await user.save();

      const tokenPayload = {
        id: user._id,
        role,
        ...(user.barangay_id && { barangay_id: user.barangay_id }),
      };

      const token = generateToken(tokenPayload);

      res.json({
        message: "Login successful.",
        token,
        user: {
          id: user._id,
          full_name: user.full_name || null,
          email: user.email,
          role,
          ...(user.barangay_id && { barangay_id: user.barangay_id }),
          ...(user.barangay_name && { barangay_name: user.barangay_name }),
        },
      });
    } catch (err) {
      console.error("Staff login error:", err);
      res.status(500).json({ message: "Server error during login." });
    }
  },
);

// =============================================================================
// FCM TOKEN — Save device token for push notifications
// =============================================================================

/**
 * POST /api/auth/fcm-token
 * Save or update the FCM token for the logged-in user.
 * Call this from the Flutter app after login and on every app launch.
 */
router.post(
  "/fcm-token",
  verifyToken,
  [body("fcm_token").notEmpty().withMessage("FCM token is required")],
  async (req, res) => {
    if (handleValidationErrors(req, res)) return;

    const { fcm_token } = req.body;
    const { id, role } = req.user;

    try {
      await saveFcmToken(String(id), role, fcm_token);
      res.json({ message: "FCM token saved successfully." });
    } catch (err) {
      console.error("FCM token save error:", err);
      res.status(500).json({ message: "Server error saving FCM token." });
    }
  },
);

// =============================================================================
// VERIFY TOKEN — Check if a JWT is still valid
// =============================================================================

/**
 * GET /api/auth/verify
 * Used by the Flutter app on startup to check if the stored token is still valid.
 * Returns the decoded user info if valid.
 */
router.get("/verify", verifyToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user,
  });
});



export default router;
