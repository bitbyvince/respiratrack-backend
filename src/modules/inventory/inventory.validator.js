import Joi from "joi";

export const getInventorySchema = Joi.object({
  barangay_id: Joi.string().optional(),
  health_center_id: Joi.string().optional(),
  stock_status: Joi.string().valid("OK", "Low", "Critical", "Stockout").optional(),
  drug_name: Joi.string().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const getInventoryItemSchema = Joi.object({
  inventory_id: Joi.string().required(),
});

export const updateStockSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required(),
  notes: Joi.string().allow("").optional(),
});

export const adjustStockSchema = Joi.object({
  adjustment: Joi.number().integer().not(0).required(),
  reason: Joi.string()
    .valid("Damaged", "Expired", "Returned", "Recount Correction", "Other")
    .required(),
  notes: Joi.string().allow("").optional(),
});

export const getLowStockSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  include_ok: Joi.boolean().default(false),
});

export const getStockoutPredictionSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  days_threshold: Joi.number().integer().min(1).default(30),
});

export const restockInventorySchema = Joi.object({
  quantity_added: Joi.number().integer().min(1).required(),
  notes: Joi.string().trim().optional().allow(""),
});

export const createInventorySchema = Joi.object({
  barangay_id: Joi.string().optional(), // barangay admins are pinned to their own; super admins must supply it
  health_center_id: Joi.string().required(),
  drug_name: Joi.string()
    .valid("HRZE", "HR", "Isoniazid", "Rifampicin", "Pyrazinamide", "Ethambutol")
    .required(),
  // HRZE/HR are fixed-dose combinations with no meaningful strength of
  // their own — only the individual single drugs need one.
  strength: Joi.string().trim().when('drug_name', {
    is: Joi.valid('HRZE', 'HR'),
    then: Joi.string().allow('', null).optional(),
    otherwise: Joi.string().required(),
  }),
  unit: Joi.string().valid("tablet", "capsule", "vial").default("tablet"),
  initial_quantity: Joi.number().integer().min(1).required(),
  expiry_date: Joi.date().iso().required(),
});