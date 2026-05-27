const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../../models/User.model");
const { createError } = require("../../utils/apiResponse");
const firebaseAdmin = require("../../config/firebase");

// ── HELPERS ──────────────────────────────────────────────

/**
 * Signs a short-lived access token (15 min).
 */
const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });

/**
 * Signs a long-lived refresh token (7 days).
 */
const signRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });

/**
 * Builds the token payload from a user document.
 */
const buildTokenPayload = (user) => ({
  user_id: user.user_id,
  role: user.role,
  barangay_id: user.barangay_id || null,
  health_center_id: user.health_center_id || null,
});

/**
 * Returns both tokens and saves the refresh token hash on the user doc.
 */
const issueTokens = async (user) => {
  const payload = buildTokenPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store hashed refresh token for rotation & invalidation
  const hashedRefresh = await bcrypt.hash(refreshToken, 10);
  await User.findOneAndUpdate(
    { user_id: user.user_id },
    {
      refresh_token_hash: hashedRefresh,
      last_login: new Date(),
    },
  );

  return { accessToken, refreshToken, role: user.role };
};

// ── STAFF LOGIN ──────────────────────────────────────────
const staffLogin = async (email, password) => {
  const user = await User.findOne({ email, is_active: true });

  if (!user) throw createError(401, "Invalid email or password.");

  // Patients are not allowed on the staff login endpoint
  if (user.role === "patient")
    throw createError(403, "Please use the patient login.");

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw createError(401, "Invalid email or password.");

  return issueTokens(user);
};

// ── PATIENT LOGIN ────────────────────────────────────────
// Accepts tb_case_number | phone_number | email as identifier
const patientLogin = async (identifier, pin) => {
  const user = await User.findOne({
    $or: [
      { tb_case_number: identifier },
      { phone_number: identifier },
      { email: identifier },
    ],
    role: "patient",
    is_active: true,
  });

  if (!user) throw createError(401, "Invalid credentials.");

  const isMatch = await bcrypt.compare(pin, user.pin_hash);
  if (!isMatch) throw createError(401, "Invalid credentials.");

  return issueTokens(user);
};

// ── ROTATE REFRESH TOKEN ─────────────────────────────────
const rotateRefreshToken = async (incomingRefreshToken) => {
  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw createError(401, "Refresh token is invalid or expired.");
  }

  const user = await User.findOne({
    user_id: decoded.user_id,
    is_active: true,
  });

  if (!user || !user.refresh_token_hash)
    throw createError(401, "Session expired. Please log in again.");

  const isValid = await bcrypt.compare(
    incomingRefreshToken,
    user.refresh_token_hash,
  );
  if (!isValid)
    throw createError(401, "Refresh token mismatch. Possible token reuse.");

  // Rotate: issue new pair, invalidate old one
  return issueTokens(user);
};

// ── LOGOUT ───────────────────────────────────────────────
const logout = async (userId) => {
  await User.findOneAndUpdate(
    { user_id: userId },
    { refresh_token_hash: null },
  );
};

// ── CHANGE PASSWORD ──────────────────────────────────────
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findOne({ user_id: userId });
  if (!user) throw createError(404, "User not found.");
  if (user.role === "patient")
    throw createError(403, "Patients use a PIN, not a password.");

  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isMatch) throw createError(400, "Current password is incorrect.");

  const hashed = await bcrypt.hash(newPassword, 12);
  await User.findOneAndUpdate(
    { user_id: userId },
    { password_hash: hashed, updated_at: new Date() },
  );
};

// ── CHANGE PIN ───────────────────────────────────────────
const changePin = async (userId, currentPin, newPin) => {
  const user = await User.findOne({ user_id: userId });
  if (!user) throw createError(404, "User not found.");
  if (user.role !== "patient")
    throw createError(403, "Only patients use a PIN.");

  const isMatch = await bcrypt.compare(currentPin, user.pin_hash);
  if (!isMatch) throw createError(400, "Current PIN is incorrect.");

  const hashed = await bcrypt.hash(newPin, 12);
  await User.findOneAndUpdate(
    { user_id: userId },
    { pin_hash: hashed, updated_at: new Date() },
  );
};

// ── REQUEST OTP (Firebase) ───────────────────────────────
// Firebase client SDK handles SMS delivery on the app side.
// On the server we verify the phone number exists in our system
// before allowing OTP flow to proceed.
const requestOtp = async (phoneNumber) => {
  const user = await User.findOne({
    phone_number: phoneNumber,
    is_active: true,
  });

  if (!user)
    throw createError(404, "No active account found with this phone number.");

  // Firebase phone auth is initiated client-side.
  // This endpoint acts as a pre-check to confirm the number is registered.
  return { message: "Phone number verified. Proceed with Firebase OTP." };
};

// ── VERIFY OTP (Firebase ID Token) ───────────────────────
// After Firebase SMS verification on the client, the app sends
// the Firebase ID token here for server-side verification.
const verifyOtp = async (phoneNumber, firebaseIdToken) => {
  let decoded;
  try {
    decoded = await firebaseAdmin.auth().verifyIdToken(firebaseIdToken);
  } catch {
    throw createError(400, "OTP verification failed. Token is invalid.");
  }

  // Confirm the phone number in the token matches what was submitted
  if (decoded.phone_number !== phoneNumber)
    throw createError(400, "Phone number does not match the verified token.");

  const user = await User.findOne({
    phone_number: phoneNumber,
    is_active: true,
  });

  if (!user) throw createError(404, "User not found.");

  // OTP verified — issue session tokens
  return issueTokens(user);
};

// ── GET ME ───────────────────────────────────────────────
const getMe = async (userId) => {
  const user = await User.findOne({ user_id: userId }).select(
    "-password_hash -pin_hash -refresh_token_hash",
  );
  if (!user) throw createError(404, "User not found.");
  return user;
};

module.exports = {
  staffLogin,
  patientLogin,
  rotateRefreshToken,
  logout,
  changePassword,
  changePin,
  requestOtp,
  verifyOtp,
  getMe,
};
