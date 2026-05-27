const Joi = require("joi");

const getInventorySchema = Joi.object({
  barangay_id: Joi.string().optional(),
  stock_status: Joi.string()
    .valid("OK", "Low", "Critical", "Stockout")
    .optional(),
  drug_name: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

const getInventoryItemSchema = Joi.object({
  inventory_id: Joi.string().required(),
});

const updateStockSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required(),
  notes: Joi.string().allow("").optional(),
});

const adjustStockSchema = Joi.object({
  adjustment: Joi.number().integer().not(0).required(), // positive = add, negative = deduct
  reason: Joi.string()
    .valid(
      "Damaged",
      "Expired",
      "Returned",
      "Recount Correction",
      "Other"
    )
    .required(),
  notes: Joi.string().allow("").optional(),
});

const getLowStockSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  include_ok: Joi.boolean().default(false),
});

const getStockoutPredictionSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  days_threshold: Joi.number().integer().min(1).default(30),
});

module.exports = {
  getInventorySchema,
  getInventoryItemSchema,
  updateStockSchema,
  adjustStockSchema,
  getLowStockSchema,
  getStockoutPredictionSchema,
};