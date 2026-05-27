const Joi = require("joi");

// ── STAFF LOGIN ──────────────────────────────────────────
const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address.",
    "any.required": "Email is required.",
  }),
  password: Joi.string().min(6).required().messages({
    "string.min": "Password must be at least 6 characters.",
    "any.required": "Password is required.",
  }),
});

// ── PATIENT LOGIN ────────────────────────────────────────
// identifier = tb_case_number (PHNT-137-071-S26-XXXX)
//            | phone number (+639XXXXXXXXX)
//            | email
const patientLoginSchema = Joi.object({
  identifier: Joi.string().required().messages({
    "any.required":
      "Please provide your TB case number, phone number, or email.",
  }),
  pin: Joi.string()
    .length(4)
    .pattern(/^\d{4}$/)
    .required()
    .messages({
      "string.length": "PIN must be exactly 4 digits.",
      "string.pattern.base": "PIN must contain only numbers.",
      "any.required": "PIN is required.",
    }),
});

// ── REFRESH TOKEN ────────────────────────────────────────
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "any.required": "Refresh token is required.",
  }),
});

// ── CHANGE PASSWORD ──────────────────────────────────────
const changePasswordSchema = Joi.object({
  current_password: Joi.string().required().messages({
    "any.required": "Current password is required.",
  }),
  new_password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      "string.min": "New password must be at least 8 characters.",
      "string.pattern.base":
        "New password must include at least one uppercase letter, one lowercase letter, and one number.",
      "any.required": "New password is required.",
    }),
  confirm_new_password: Joi.string()
    .valid(Joi.ref("new_password"))
    .required()
    .messages({
      "any.only": "Passwords do not match.",
      "any.required": "Please confirm your new password.",
    }),
});

// ── CHANGE PIN ───────────────────────────────────────────
const changePinSchema = Joi.object({
  current_pin: Joi.string()
    .length(4)
    .pattern(/^\d{4}$/)
    .required()
    .messages({
      "string.length": "Current PIN must be exactly 4 digits.",
      "string.pattern.base": "Current PIN must contain only numbers.",
      "any.required": "Current PIN is required.",
    }),
  new_pin: Joi.string()
    .length(4)
    .pattern(/^\d{4}$/)
    .required()
    .messages({
      "string.length": "New PIN must be exactly 4 digits.",
      "string.pattern.base": "New PIN must contain only numbers.",
      "any.required": "New PIN is required.",
    }),
  confirm_new_pin: Joi.string().valid(Joi.ref("new_pin")).required().messages({
    "any.only": "PINs do not match.",
    "any.required": "Please confirm your new PIN.",
  }),
});

// ── REQUEST OTP ──────────────────────────────────────────
const requestOtpSchema = Joi.object({
  phone_number: Joi.string()
    .pattern(/^\+639\d{9}$/)
    .required()
    .messages({
      "string.pattern.base":
        "Phone number must be in the format +639XXXXXXXXX.",
      "any.required": "Phone number is required.",
    }),
});

// ── VERIFY OTP ───────────────────────────────────────────
// The client sends the Firebase ID token after completing
// phone verification on the Firebase client SDK
const verifyOtpSchema = Joi.object({
  phone_number: Joi.string()
    .pattern(/^\+639\d{9}$/)
    .required()
    .messages({
      "string.pattern.base":
        "Phone number must be in the format +639XXXXXXXXX.",
      "any.required": "Phone number is required.",
    }),
  otp_code: Joi.string().required().messages({
    "any.required": "Firebase ID token is required.",
  }),
});

module.exports = {
  loginSchema,
  patientLoginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  changePinSchema,
  requestOtpSchema,
  verifyOtpSchema,
};
