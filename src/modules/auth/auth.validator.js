import Joi from "joi";

export const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address.",
    "any.required": "Email is required.",
  }),
  password: Joi.string().min(6).required().messages({
    "string.min": "Password must be at least 6 characters.",
    "any.required": "Password is required.",
  }),
});

export const patientLoginSchema = Joi.object({
  identifier: Joi.string().required().messages({
    "any.required": "Please provide your Patient ID, TB case number, phone number, or email.",
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

export const setPatientPinSchema = Joi.object({
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

export const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "any.required": "Refresh token is required.",
  }),
});

export const changePasswordSchema = Joi.object({
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

export const changePinSchema = Joi.object({
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

export const requestOtpSchema = Joi.object({
  phone_number: Joi.string()
    .pattern(/^\+639\d{9}$/)
    .required()
    .messages({
      "string.pattern.base": "Phone number must be in the format +639XXXXXXXXX.",
      "any.required": "Phone number is required.",
    }),
});

export const verifyOtpSchema = Joi.object({
  phone_number: Joi.string()
    .pattern(/^\+639\d{9}$/)
    .required()
    .messages({
      "string.pattern.base": "Phone number must be in the format +639XXXXXXXXX.",
      "any.required": "Phone number is required.",
    }),
  otp_code: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      "string.length": "OTP code must be exactly 6 digits.",
      "string.pattern.base": "OTP code must contain only numbers.",
      "any.required": "OTP code is required.",
    }),
});