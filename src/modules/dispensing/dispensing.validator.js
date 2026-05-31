import Joi from "joi";

export const listDispensingSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  patient_id: Joi.string().trim().optional().allow(""),
  barangay_id: Joi.string().trim().optional().allow(""),
  drug_name: Joi.string().trim().optional().allow(""),
  from_date: Joi.date().iso().optional(),
  to_date: Joi.date().iso().optional(),
});

export const createDispensingSchema = Joi.object({
  patient_id: Joi.string().trim().required(),
  inventory_id: Joi.string().trim().optional().allow(""),
  drug_name: Joi.string().trim().required(),
  strength: Joi.string().trim().optional().allow(""),
  unit: Joi.string().trim().optional().allow(""),
  quantity_dispensed: Joi.number().integer().min(1).required(),
  dispense_date: Joi.date().iso().required(),
  dispense_id: Joi.string().trim().optional().allow(""),
  dispensed_by: Joi.string().trim().required(),
  notes: Joi.string().trim().optional().allow(""),
});

export const dispensingIdParamsSchema = Joi.object({
  recordId: Joi.string().trim().required(),
});