import rateLimit from "express-rate-limit";

// Applied to auth endpoints (login, OTP, PIN) — these accept a small
// credential space (4-digit PINs, 6-digit OTPs) and are the primary
// brute-force surface in the app.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many attempts. Please try again later.",
  },
});
