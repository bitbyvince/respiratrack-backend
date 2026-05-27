const Joi = require("joi");

const triggerEscalationSchema = Joi.object({
  patient_id: Joi.string().required(),
  consecutive_missed_doses: Joi.number().integer().min(0).required(),
});

const acknowledgeEscalationSchema = Joi.object({
  acknowledgement_notes: Joi.string().allow("").optional(),
});

const resolveEscalationSchema = Joi.object({
  resolution_notes: Joi.string().allow("").optional(),
});

const listEscalationsSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  patient_id: Joi.string().optional(),
  level: Joi.number().integer().min(1).max(3).optional(),
  resolved: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = {
  triggerEscalationSchema,
  acknowledgeEscalationSchema,
  resolveEscalationSchema,
  listEscalationsSchema,
};