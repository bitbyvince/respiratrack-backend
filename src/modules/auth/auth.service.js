import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../../models/User.model.js";
import { createError } from "../../utils/apiResponse.js";
import firebaseAdmin from "../../config/firebase.js";

// ── Helpers ───────────────────────────────────────────────

const signAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });

const signRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });

const buildTokenPayload = (user) => ({
  user_id: user.user_id,
  role: user.role,
  barangay_id: user.barangay_id || null,
  health_center_id: user.health_center_id || null,
});

async function issueTokens(user) {
  const payload = buildTokenPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const hashedRefresh = await bcrypt.hash(refreshToken, 10);
  await User.findOneAndUpdate(
    { user_id: user.user_id },
    { refresh_token_hash: hashedRefresh, last_login: new Date() },
  );

  return { accessToken, refreshToken, role: user.role };
}

// ── Service Functions ─────────────────────────────────────

export async function staffLogin(email, password) {
  const user = await User.findOne({ email, is_active: true });

  if (!user) throw createError(401, "Invalid email or password.");
  if (user.role === "patient")
    throw createError(403, "Please use the patient login.");

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw createError(401, "Invalid email or password.");

  return issueTokens(user);
}

export async function patientLogin(identifier, pin) {
  const user = await User.findOne({
    $or: [
      { patient_id: identifier },
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
}

export async function rotateRefreshToken(incomingRefreshToken) {
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

  if (!user || !user.refresh_token_hash) {
    throw createError(401, "Session expired. Please log in again.");
  }

  const isValid = await bcrypt.compare(
    incomingRefreshToken,
    user.refresh_token_hash,
  );
  if (!isValid)
    throw createError(401, "Refresh token mismatch. Possible token reuse.");

  return issueTokens(user);
}

export async function logout(userId) {
  await User.findOneAndUpdate(
    { user_id: userId },
    { refresh_token_hash: null },
  );
}

export async function changePassword(userId, currentPassword, newPassword) {
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
}

export async function changePin(userId, currentPin, newPin) {
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
}

export async function requestOtp(phoneNumber) {
  const user = await User.findOne({
    phone_number: phoneNumber,
    is_active: true,
  });
  if (!user)
    throw createError(404, "No active account found with this phone number.");

  return { message: "Phone number verified. Proceed with Firebase OTP." };
}

export async function verifyOtp(phoneNumber, firebaseIdToken) {
  let decoded;
  try {
    decoded = await firebaseAdmin.auth().verifyIdToken(firebaseIdToken);
  } catch {
    throw createError(400, "OTP verification failed. Token is invalid.");
  }

  if (decoded.phone_number !== phoneNumber) {
    throw createError(400, "Phone number does not match the verified token.");
  }

  const user = await User.findOne({
    phone_number: phoneNumber,
    is_active: true,
  });
  if (!user) throw createError(404, "User not found.");

  return issueTokens(user);
}

export async function getMe(userId) {
  const user = await User.findOne({ user_id: userId }).select(
    "-password_hash -pin_hash -refresh_token_hash",
  );
  if (!user) throw createError(404, "User not found.");
  return user;
}
