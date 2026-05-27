const Joi = require("joi");
const ROLES = require("../../constants/roles");

// ── REUSABLE FIELD SCHEMAS ───────────────────────────────

const nameField = (label) =>
  Joi.string()
    .min(2)
    .max(64)
    .required()
    .messages({
      "string.min": `${label} must be at least 2 characters.`,
      "string.max": `${label} must not exceed 64 characters.`,
      "any.required": `${label} is required.`,
    });

const emailField = Joi.string().email().required().messages({
  "string.email": "Please provide a valid email address.",
  "any.required": "Email is required.",
});

const phoneField = (required = false) => {
  const base = Joi.string()
    .pattern(/^\+639\d{9}$/)
    .messages({
      "string.pattern.base":
        "Phone number must be in the format +639XXXXXXXXX.",
    });
  return required ? base.required() : base.optional().allow(null, "");
};

const pinField = (label = "PIN") =>
  Joi.string()
    .length(4)
    .pattern(/^\d{4}$/)
    .required()
    .messages({
      "string.length": `${label} must be exactly 4 digits.`,
      "string.pattern.base": `${label} must contain only numbers.`,
      "any.required": `${label} is required.`,
    });

const passwordField = Joi.string()
  .min(8)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .required()
  .messages({
    "string.min": "Password must be at least 8 characters.",
    "string.pattern.base":
      "Password must include at least one uppercase letter, one lowercase letter, and one number.",
    "any.required": "Password is required.",
  });

// ── TB CASE NUMBER FORMAT: PHNT-137-071-S26-XXXX ─────────
const tbCaseNumberField = Joi.string()
  .pattern(/^PHNT-\d{3}-\d{3}-[A-Z]\d{2}-\d{4}$/)
  .required()
  .messages({
    "string.pattern.base":
      "TB case number must follow the format PHNT-137-071-S26-0001.",
    "any.required": "TB case number is required.",
  });

// ================================================================
// CREATE STAFF (super_admin or barangay_admin creates nurse/admin)
// ================================================================
const createStaffSchema = Joi.object({
  role: Joi.string()
    .valid(ROLES.BARANGAY_ADMIN, ROLES.NURSE)
    .required()
    .messages({
      "any.only": "Role must be either barangay_admin or nurse.",
      "any.required": "Role is required.",
    }),
  first_name: nameField("First name"),
  last_name: nameField("Last name"),
  email: emailField,
  password: passwordField,
  phone_number: phoneField(false),

  // Only required when super_admin creates a barangay_admin or nurse
  barangay_id: Joi.string().when("role", {
    is: Joi.valid(ROLES.BARANGAY_ADMIN, ROLES.NURSE),
    then: Joi.string().optional(), // service enforces this for super_admin
    otherwise: Joi.forbidden(),
  }),
  health_center_id: Joi.string().optional().allow(null, ""),
});

// ================================================================
// UPDATE STAFF
// ================================================================
const updateStaffSchema = Joi.object({
  first_name: Joi.string().min(2).max(64).optional(),
  last_name: Joi.string().min(2).max(64).optional(),
  email: Joi.string().email().optional().messages({
    "string.email": "Please provide a valid email address.",
  }),
  phone_number: phoneField(false),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update.",
  });

// ================================================================
// CREATE PATIENT MOBILE ACCOUNT
// Called by nurse/barangay_admin after registering a patient
// ================================================================
const createPatientAccountSchema = Joi.object({
  patient_id: Joi.string().required().messages({
    "any.required": "Patient ID is required.",
  }),
  tb_case_number: tbCaseNumberField,
  first_name: nameField("First name"),
  last_name: nameField("Last name"),
  phone_number: phoneField(true),
  email: Joi.string().email().optional().allow(null, "").messages({
    "string.email": "Please provide a valid email address.",
  }),
  pin: pinField("PIN"),
  confirm_pin: Joi.string().valid(Joi.ref("pin")).required().messages({
    "any.only": "PINs do not match.",
    "any.required": "Please confirm the PIN.",
  }),
});

// ================================================================
// UPDATE PATIENT ACCOUNT
// Nurse/admin can update contact info or reset PIN
// ================================================================
const updatePatientAccountSchema = Joi.object({
  phone_number: phoneField(false),
  email: Joi.string().email().optional().allow(null, "").messages({
    "string.email": "Please provide a valid email address.",
  }),
  // PIN reset — nurse/admin sets a new PIN for the patient
  new_pin: Joi.string()
    .length(4)
    .pattern(/^\d{4}$/)
    .optional()
    .messages({
      "string.length": "New PIN must be exactly 4 digits.",
      "string.pattern.base": "New PIN must contain only numbers.",
    }),
  confirm_new_pin: Joi.when("new_pin", {
    is: Joi.exist(),
    then: Joi.string().valid(Joi.ref("new_pin")).required().messages({
      "any.only": "PINs do not match.",
      "any.required": "Please confirm the new PIN.",
    }),
    otherwise: Joi.forbidden(),
  }),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update.",
  });

// ================================================================
// LIST USERS QUERY PARAMS
// ================================================================
const listUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  role: Joi.string()
    .valid(ROLES.SUPER_ADMIN, ROLES.BARANGAY_ADMIN, ROLES.NURSE, ROLES.PATIENT)
    .optional(),
  barangay_id: Joi.string().optional(),
  is_active: Joi.boolean().optional(),
});

module.exports = {
  createStaffSchema,
  updateStaffSchema,
  createPatientAccountSchema,
  updatePatientAccountSchema,
  listUsersSchema,
};
