const Joi = require("joi");

const listDispensingSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  patient_id: Joi.string().trim().optional().allow(""),
  barangay_id: Joi.string().trim().optional().allow(""),
  medication_name: Joi.string().trim().optional().allow(""),
  from_date: Joi.date().iso().optional(),
  to_date: Joi.date().iso().optional(),
});

const createDispensingSchema = Joi.object({
  patient_id: Joi.string().trim().required(),
  medication_name: Joi.string().trim().required(),
  dosage: Joi.string().trim().optional().allow(""),
  quantity: Joi.number().integer().min(1).required(),
  dispensed_date: Joi.date().iso().required(),
  dispensed_by: Joi.string().trim().required(),
  notes: Joi.string().trim().optional().allow(""),
});

const dispensingIdParamsSchema = Joi.object({
  recordId: Joi.string().trim().required(),
});

module.exports = {
  createDispensingSchema,
  listDispensingSchema,
  dispensingIdParamsSchema,
};
