// ============================================================
// utils/semaphoreSms.js
//
// Thin wrapper around Semaphore's OTP endpoint (api.semaphore.co).
// Semaphore generates the 6-digit code itself and returns it in the
// response — we hash and store it (see auth.service.js requestOtp),
// we never trust anything the client sends us as "the code" without
// comparing against that stored hash.
// ============================================================

import env from "../config/env.js";
import { createError } from "./apiResponse.js";
import logger from "./logger.js";

const SEMAPHORE_OTP_URL = "https://api.semaphore.co/api/v4/otp";

export async function sendOtpSms(phoneNumber) {
  const payload = {
    apikey: env.SMS_API_KEY,
    number: phoneNumber,
    message: "Your RespiraTrack verification code is {otp}. It expires in 5 minutes.",
  };
  // Only send a custom sender name if one is configured — Semaphore rejects
  // unapproved sender names outright, so omit it to fall back to the
  // account's default approved sender until a custom one is approved.
  if (env.SMS_SENDER_NAME) {
    payload.sendername = env.SMS_SENDER_NAME;
  }

  const res = await fetch(SEMAPHORE_OTP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    logger.error(`[semaphoreSms] HTTP ${res.status} from Semaphore: ${JSON.stringify(data)}`);
    throw createError(502, "Failed to send OTP SMS.");
  }

  const code = data?.[0]?.code;
  if (!code) {
    logger.error(`[semaphoreSms] No code in Semaphore response: ${JSON.stringify(data)}`);
    throw createError(502, "SMS provider did not return a code.");
  }

  return String(code);
}
