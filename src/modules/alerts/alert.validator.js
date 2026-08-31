import Joi from "joi";

const VALID_ALERT_TYPES = [
  "Missed Dose",
  "Escalation L1",
  "Escalation L2",
  "Escalation L3",
  "Low Stock",
  "Sputum Test Due",
  "Appointment Reminder",
];

const VALID_SEVERITIES = ["Info", "Warning", "Critical"];

const VALID_ROLES = ["nurse", "barangay_admin", "super_admin", "patient"];

export const createAlertSchema = Joi.object({
  patient_id: Joi.string().allow(null, "").optional(),
  tb_case_number: Joi.string().allow(null, "").optional(),
  barangay_id: Joi.string().required(),
  alert_type: Joi.string()
    .valid(...VALID_ALERT_TYPES)
    .required()
    .messages({
      "any.only": `alert_type must be one of: ${VALID_ALERT_TYPES.join(", ")}`,
    }),
  escalation_level: Joi.number().integer().min(0).max(3).optional(),
  message: Joi.string().min(5).required(),
  severity: Joi.string()
    .valid(...VALID_SEVERITIES)
    .required()
    .messages({
      "any.only": `severity must be one of: ${VALID_SEVERITIES.join(", ")}`,
    }),
  target_roles: Joi.array()
    .items(Joi.string().valid(...VALID_ROLES))
    .min(1)
    .required(),
});

export const resolveAlertSchema = Joi.object({
  notes: Joi.string().allow("").optional(),
});
