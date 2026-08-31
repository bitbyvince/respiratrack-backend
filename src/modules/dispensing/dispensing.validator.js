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
  days_supplied: Joi.number().integer().min(1).required(),
  dispense_date: Joi.date().iso().required(),
  medicines: Joi.array()
    .items(
      Joi.object({
        drug_name: Joi.string().trim().required(),
        strength: Joi.string().trim().required(),
        quantity_dispensed: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .required(),
  notes: Joi.string().trim().optional().allow(""),
});

export const dispensingIdParamsSchema = Joi.object({
  recordId: Joi.string().trim().required(),
});

export const createInventorySchema = Joi.object({
  barangay_id: Joi.string().trim().required(),
  health_center_id: Joi.string().trim().required(),
  drug_name: Joi.string()
    .trim()
    .valid("Isoniazid", "Rifampicin", "Pyrazinamide", "Ethambutol")
    .required(),
  strength: Joi.string().trim().required(),
  unit: Joi.string().trim().valid("tablet", "capsule", "vial").default("tablet"),
  total_allocated: Joi.number().integer().min(1).required(),
  expiry_date: Joi.date().iso().required(),
});

export const restockInventorySchema = Joi.object({
  quantity_added: Joi.number().integer().min(1).required(),
  expiry_date: Joi.date().iso().optional(),
  notes: Joi.string().trim().optional().allow(""),
});