import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../../models/User.model.js";
import Barangay from "../../models/Barangay.model.js";
import { createError } from "../../utils/apiResponse.js";
import firebaseAdmin from "../../config/firebase.js";
import { sendOtpSms } from "../../utils/semaphoreSms.js";

const OTP_TTL_MS = 5 * 60 * 1000;

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
  patient_id: user.patient_id || null,
});

async function issueTokens(user) {
  const payload = buildTokenPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Firebase custom token, keyed to the SAME user_id used everywhere
  // else (Mongo, Firestore document paths). Without this, the app
  // could only sign in to Firebase anonymously — a random UID with
  // no relation to user_id, which made it impossible for Firestore
  // Security Rules to ever restrict a user to their own data.
  const firebaseToken = await firebaseAdmin.auth().createCustomToken(user.user_id);

  const hashedRefresh = await bcrypt.hash(refreshToken, 10);
  await User.findOneAndUpdate(
    { user_id: user.user_id },
    { refresh_token_hash: hashedRefresh, last_login: new Date() }
  );

    return {
    accessToken,
    refreshToken,
    firebaseToken,
    userId: user.user_id,
    patientId: user.patient_id || null,
    tbCaseNumber: user.tb_case_number || null,
    phone_number: user.phone_number || null,
    phone_verified: user.phone_verified ?? false,
    role: user.role,
    barangay_id: user.barangay_id || null,
    barangay_name: user.barangay_name || null,
    health_center_id: user.health_center_id || null,
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

// ── Service Functions ─────────────────────────────────────

export async function staffLogin(email, password) {
  const user = await User.findOne({ email, is_active: true });

  if (!user) throw createError(401, "Invalid email or password.");
  if (user.role === "patient") throw createError(403, "Please use the patient login.");

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) throw createError(401, "Invalid email or password.");

  return issueTokens(user);
}

export async function patientLogin(identifier, pin) {
  const user = await User.findOne({
    $or: [
      { patient_id: identifier },
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
}

export async function setPatientPin(requestingUser, pin) {
  if (requestingUser.role !== "patient" || !requestingUser.patient_id) {
    throw createError(403, "Only patients can set their own PIN.");
  }
  const user = await User.findOne({ patient_id: requestingUser.patient_id, role: "patient" });
  if (!user) throw createError(404, "Patient not found.");
  const hashed = await bcrypt.hash(pin, 12);
  await User.findOneAndUpdate(
    { patient_id: requestingUser.patient_id },
    { pin_hash: hashed, updated_at: new Date() }
  );
}

export async function rotateRefreshToken(incomingRefreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw createError(401, "Refresh token is invalid or expired.");
  }

  const user = await User.findOne({ user_id: decoded.user_id, is_active: true });

  if (!user || !user.refresh_token_hash) {
    throw createError(401, "Session expired. Please log in again.");
  }

  const isValid = await bcrypt.compare(incomingRefreshToken, user.refresh_token_hash);
  if (!isValid) throw createError(401, "Refresh token mismatch. Possible token reuse.");

  return issueTokens(user);
}

export async function logout(userId) {
  await User.findOneAndUpdate({ user_id: userId }, { refresh_token_hash: null });
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findOne({ user_id: userId });
  if (!user) throw createError(404, "User not found.");
  if (user.role === "patient") throw createError(403, "Patients use a PIN, not a password.");
  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isMatch) throw createError(400, "Current password is incorrect.");
  const hashed = await bcrypt.hash(newPassword, 12);
  await User.findOneAndUpdate(
    { user_id: userId },
    { password_hash: hashed, updated_at: new Date() }
  );
}

export async function changePin(userId, currentPin, newPin) {
  const user = await User.findOne({ user_id: userId });
  if (!user) throw createError(404, "User not found.");
  if (user.role !== "patient") throw createError(403, "Only patients use a PIN.");
  const isMatch = await bcrypt.compare(currentPin, user.pin_hash);
  if (!isMatch) throw createError(400, "Current PIN is incorrect.");
  const hashed = await bcrypt.hash(newPin, 12);
  await User.findOneAndUpdate(
    { user_id: userId },
    { pin_hash: hashed, updated_at: new Date() }
  );
}

export async function requestOtp(phoneNumber) {
  const user = await User.findOne({
    phone_number: phoneNumber,
    role: "patient",
    is_active: true,
  });
  if (!user) throw createError(404, "No active account found with this phone number.");

  const code = await sendOtpSms(phoneNumber);
  const hashed = await bcrypt.hash(code, 10);

  await User.findOneAndUpdate(
    { phone_number: phoneNumber },
    { otp_hash: hashed, otp_expires_at: new Date(Date.now() + OTP_TTL_MS) }
  );

  return { message: "OTP sent." };
}

export async function verifyOtp(phoneNumber, code) {
  const user = await User.findOne({
    phone_number: phoneNumber,
    role: "patient",
    is_active: true,
  });
  if (!user) throw createError(404, "User not found.");

  if (!user.otp_hash || !user.otp_expires_at || user.otp_expires_at < new Date()) {
    throw createError(400, "Code expired or not requested — request a new one.");
  }

  const isMatch = await bcrypt.compare(code, user.otp_hash);
  if (!isMatch) throw createError(400, "Invalid code.");

  await User.findOneAndUpdate(
    { phone_number: phoneNumber },
    { phone_verified: true, otp_hash: null, otp_expires_at: null }
  );
  user.phone_verified = true;

  return issueTokens(user);
}

export async function getMe(userId) {
  const user = await User.findOne({ user_id: userId }).select(
    "-password_hash -pin_hash -refresh_token_hash"
  );
  if (!user) throw createError(404, "User not found.");

  const userObj = user.toObject();
  userObj.full_name = `${userObj.first_name} ${userObj.last_name}`.trim();

  if (userObj.barangay_id) {
    try {
      const barangay = await Barangay.findOne(
        { barangay_id: userObj.barangay_id },
        { barangay_id: 1, name: 1, municipality: 1, health_center: 1 }
      ).lean();
      if (barangay) {
        userObj.barangay_id = barangay;
      }
    } catch (_) {}
  }

  return userObj;
}