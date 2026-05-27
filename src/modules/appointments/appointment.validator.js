const Joi = require("joi");

const VALID_PURPOSES = ["Follow-up", "Sputum Test", "Emergency", "Routine"];

exports.createAppointmentSchema = Joi.object({
  patient_id: Joi.string().required(),
  scheduled_date: Joi.date().greater("now").required().messages({
    "date.greater": "Scheduled date must be in the future.",
  }),
  scheduled_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .required()
    .messages({
      "string.pattern.base":
        "scheduled_time must be in HH:MM format (e.g. 09:00).",
    }),
  purpose: Joi.string()
    .valid(...VALID_PURPOSES)
    .required()
    .messages({
      "any.only": `Purpose must be one of: ${VALID_PURPOSES.join(", ")}`,
    }),
  notes: Joi.string().allow("").optional(),
});

exports.updateAppointmentSchema = Joi.object({
  scheduled_date: Joi.date().greater("now").optional().messages({
    "date.greater": "Scheduled date must be in the future.",
  }),
  scheduled_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional()
    .messages({
      "string.pattern.base":
        "scheduled_time must be in HH:MM format (e.g. 09:00).",
    }),
  purpose: Joi.string()
    .valid(...VALID_PURPOSES)
    .optional()
    .messages({
      "any.only": `Purpose must be one of: ${VALID_PURPOSES.join(", ")}`,
    }),
  notes: Joi.string().allow("").optional(),
});
