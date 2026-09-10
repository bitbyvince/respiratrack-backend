// ============================================================
// utils/twilioSms.js
//
// Thin wrapper around Twilio's Messages API (plain SMS — not the
// separate Verify product). Unlike Semaphore's OTP endpoint, Twilio
// doesn't generate or hand back a code, so we generate our own here
// and just ask Twilio to deliver it — auth.service.js hashes and
// stores whatever this returns, exactly like it does for Semaphore.
// ============================================================

import { randomInt } from "crypto";
import env from "../config/env.js";
import { createError } from "./apiResponse.js";
import logger from "./logger.js";

const TWILIO_API_URL = (accountSid) =>
  `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

export async function sendOtpSms(phoneNumber) {
  const code = String(randomInt(100000, 1000000)); // 6-digit, zero-safe

  const body = new URLSearchParams({
    To: phoneNumber,
    From: env.TWILIO_PHONE_NUMBER,
    Body: `Your RespiraTrack verification code is ${code}. It expires in 5 minutes.`,
  });

  const basicAuth = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64");

  const res = await fetch(TWILIO_API_URL(env.TWILIO_ACCOUNT_SID), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    logger.error(`[twilioSms] HTTP ${res.status} from Twilio: ${JSON.stringify(data)}`);
    throw createError(502, "Failed to send OTP SMS.");
  }

  return code;
}
