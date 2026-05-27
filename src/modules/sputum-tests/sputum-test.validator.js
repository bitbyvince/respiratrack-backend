const Joi = require("joi");

const createSputumTestSchema = Joi.object({
  patient_id: Joi.string().required(),
  month: Joi.number().integer().valid(2, 5, 6).required(),
  due_date: Joi.date().iso().required(),
  date_collected: Joi.date().iso().optional().allow(null),
  notes: Joi.string().allow("").optional(),
});

const enterResultSchema = Joi.object({
  result: Joi.string()
    .valid("Negative", "Positive", "Pending", "Not Done")
    .required(),
  date_collected: Joi.date().iso().optional().allow(null),
  notes: Joi.string().allow("").optional(),
});

const updateSputumTestSchema = Joi.object({
  due_date: Joi.date().iso().optional(),
  date_collected: Joi.date().iso().optional().allow(null),
  result: Joi.string()
    .valid("Negative", "Positive", "Pending", "Not Done")
    .optional(),
  notes: Joi.string().allow("").optional(),
});

const listSputumTestsSchema = Joi.object({
  patient_id: Joi.string().optional(),
  barangay_id: Joi.string().optional(),
  result: Joi.string()
    .valid("Negative", "Positive", "Pending", "Not Done")
    .optional(),
  month: Joi.number().integer().valid(2, 5, 6).optional(),
  overdue_only: Joi.boolean().default(false),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const getUpcomingSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  days_ahead: Joi.number().integer().min(1).max(30).default(7),
});

module.exports = {
  createSputumTestSchema,
  enterResultSchema,
  updateSputumTestSchema,
  listSputumTestsSchema,
  getUpcomingSchema,
};