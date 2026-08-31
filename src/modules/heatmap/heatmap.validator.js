import Joi from "joi";

export const getHeatmapSchema = Joi.object({
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  snapshot_date: Joi.date().iso().optional(),
  barangay_id: Joi.string().optional(),
});

export const buildSnapshotSchema = Joi.object({
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  snapshot_date: Joi.date().iso().optional(),
});

export const getBarangayDetailSchema = Joi.object({
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  snapshot_date: Joi.date().iso().optional(),
});

export const getHeatmapHistorySchema = Joi.object({
  barangay_id: Joi.string().optional(), // ← make optional since it's in the URL
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(365).default(30),
});
