const Joi = require("joi");

const listComplianceSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  barangay_id: Joi.string().trim().optional().allow(""),
  period: Joi.string().valid("daily", "monthly", "all_time").optional(),
  snapshot_date: Joi.date().iso().optional(),
});

const snapshotParamsSchema = Joi.object({
  barangayId: Joi.string().trim().required(),
});

module.exports = {
  listComplianceSchema,
  snapshotParamsSchema,
};
