// ============================================================
// auth.middleware.js
// Verifies JWT on every protected route.
// Attaches decoded user payload to req.user.
//
// Flow:
//   1. Extract Bearer token from Authorization header
//   2. Verify signature and expiry against JWT_ACCESS_SECRET
//   3. Cross-check user still exists and is active in MongoDB
//   4. Attach full user doc to req.user and move on
//
// Usage on routes:
//   router.get("/protected", authenticate, handler)
// ============================================================

import jwt from "jsonwebtoken";
import User from "../models/User.model.js";

export const authenticate = async (req, res, next) => {
  try {
    // ── 1. Extract token ──────────────────────────────────
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "NO_TOKEN",
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token.trim() === "") {
      return res.status(401).json({
        success: false,
        code: "EMPTY_TOKEN",
        message: "Access denied. Token is empty.",
      });
    }

    // ── 2. Verify token ───────────────────────────────────
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          code: "TOKEN_EXPIRED",
          message: "Session expired. Please log in again.",
        });
      }
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          code: "TOKEN_INVALID",
          message: "Invalid token. Please log in again.",
        });
      }
      return res.status(401).json({
        success: false,
        code: "TOKEN_ERROR",
        message: "Token verification failed.",
      });
    }

    // ── 3. Cross-check user still exists and is active ───
    const user = await User.findOne({
      user_id: decoded.user_id,
      is_active: true,
    }).lean();

    if (!user) {
      return res.status(401).json({
        success: false,
        code: "USER_NOT_FOUND",
        message: "User account not found or has been deactivated.",
      });
    }

    // ── 4. Attach to request and continue ─────────────────
    req.user = {
      user_id: user.user_id,
      role: user.role,
      barangay_id: user.barangay_id ?? null,
      health_center_id: user.health_center_id ?? null,
      patient_id: user.patient_id ?? null,
      tb_case_number: user.tb_case_number ?? null,
      email: user.email ?? null,
      phone_number: user.phone_number ?? null,
    };

    next();
  } catch (err) {
    console.error("[auth.middleware] Unexpected error:", err);
    return res.status(500).json({
      success: false,
      code: "AUTH_ERROR",
      message: "Authentication failed due to a server error.",
    });
  }
};

export const softAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      return next();
    }

    const token = authHeader.split(" ")[1];
    if (!token || token.trim() === "") {
      req.user = null;
      return next();
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch {
      req.user = null;
      return next();
    }

    const user = await User.findOne({
      user_id: decoded.user_id,
      is_active: true,
    }).lean();

    req.user = user
      ? {
          user_id: user.user_id,
          role: user.role,
          barangay_id: user.barangay_id ?? null,
          health_center_id: user.health_center_id ?? null,
          patient_id: user.patient_id ?? null,
          tb_case_number: user.tb_case_number ?? null,
          email: user.email ?? null,
          phone_number: user.phone_number ?? null,
        }
      : null;

    next();
  } catch (err) {
    console.error("[softAuthenticate] Unexpected error:", err);
    req.user = null;
    next();
  }
};

export const authMiddleware = authenticate;