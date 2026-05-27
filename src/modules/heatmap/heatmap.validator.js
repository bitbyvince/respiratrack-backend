const Joi = require("joi");

const getHeatmapSchema = Joi.object({
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  snapshot_date: Joi.date().iso().optional(),
  barangay_id: Joi.string().optional(),
});

const buildSnapshotSchema = Joi.object({
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  snapshot_date: Joi.date().iso().optional(),
});

const getBarangayDetailSchema = Joi.object({
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  snapshot_date: Joi.date().iso().optional(),
});

const getHeatmapHistorySchema = Joi.object({
  barangay_id: Joi.string().required(),
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(365).default(30),
});

module.exports = {
  getHeatmapSchema,
  buildSnapshotSchema,
  getBarangayDetailSchema,
  getHeatmapHistorySchema,
};