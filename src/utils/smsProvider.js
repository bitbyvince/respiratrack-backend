// ============================================================
// utils/smsProvider.js
//
// Picks the OTP SMS backend based on env.SMS_PROVIDER, so switching
// providers is an .env change only — auth.service.js always imports
// from here, never from a specific provider file directly.
// ============================================================

import env from "../config/env.js";
import { sendOtpSms as sendOtpSmsSemaphore } from "./semaphoreSms.js";
import { sendOtpSms as sendOtpSmsTwilio } from "./twilioSms.js";

export async function sendOtpSms(phoneNumber) {
  if (env.SMS_PROVIDER === "twilio") return sendOtpSmsTwilio(phoneNumber);
  return sendOtpSmsSemaphore(phoneNumber);
}
