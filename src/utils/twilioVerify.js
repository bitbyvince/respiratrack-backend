// ============================================================
// utils/twilioVerify.js
//
// Wrapper around Twilio's Verify API — unlike plain SMS (semaphoreSms.js,
// twilioSms.js), Verify generates, sends, stores, and expires the code
// entirely on Twilio's side. We never see the code ourselves, so there's
// nothing for auth.service.js to hash/store locally for this provider —
// "is it valid?" is answered by calling checkVerification, not by
// comparing against a stored hash.
// ============================================================

import env from "../config/env.js";
import { createError } from "./apiResponse.js";
import logger from "./logger.js";

const BASE_URL = `https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}`;

const basicAuthHeader = () =>
  `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`;

// Kicks off a verification — Twilio generates the code and texts it.
export async function startVerification(phoneNumber) {
  const res = await fetch(`${BASE_URL}/Verifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({ To: phoneNumber, Channel: "sms" }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    logger.error(`[twilioVerify] HTTP ${res.status} starting verification: ${JSON.stringify(data)}`);
    throw createError(502, "Failed to send OTP SMS.");
  }

  return data; // { status: "pending", ... }
}

// Asks Twilio whether the code the user typed matches what was sent.
export async function checkVerification(phoneNumber, code) {
  const res = await fetch(`${BASE_URL}/VerificationCheck`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({ To: phoneNumber, Code: code }),
  });

  const data = await res.json().catch(() => null);

  // Twilio returns 404 for "no pending verification for this number"
  // (e.g. expired or never requested) rather than a generic failure.
  if (res.status === 404) return { approved: false, reason: "not_found" };

  if (!res.ok) {
    logger.error(`[twilioVerify] HTTP ${res.status} checking verification: ${JSON.stringify(data)}`);
    throw createError(502, "Failed to verify OTP code.");
  }

  return { approved: data?.status === "approved", reason: data?.status };
}
