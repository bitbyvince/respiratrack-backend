medication - log.validator.js;

const Joi = require("joi");

const medicineEntrySchema = Joi.object({
  drug_name: Joi.string().required(),
  strength: Joi.string().required(),
  unit: Joi.string().required(),
  number_to_be_taken: Joi.number().integer().min(1).required(),
  status: Joi.string().valid("Taken", "Missed", "Partial").required(),
  taken_at: Joi.date().allow(null).optional(),
});

exports.logMedicationSchema = Joi.object({
  patient_id: Joi.string().required(),
  log_date: Joi.date().optional(),
  medicines: Joi.array().items(medicineEntrySchema).min(1).required(),
  notes: Joi.string().allow("").optional(),
});

exports.updateMedicationLogSchema = Joi.object({
  medicines: Joi.array().items(medicineEntrySchema).min(1).optional(),
  notes: Joi.string().allow("").optional(),
});
