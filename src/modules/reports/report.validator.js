import Joi from "joi";

export const getPatientReportSchema = Joi.object({
  patient_id: Joi.string().required(),
  include_medication_logs: Joi.boolean().default(true),
  include_symptom_logs: Joi.boolean().default(true),
  include_sputum_tests: Joi.boolean().default(true),
  include_appointments: Joi.boolean().default(true),
  include_dispensing: Joi.boolean().default(true),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  format: Joi.string().valid("json", "pdf").default("json"),
});

export const getBarangayReportSchema = Joi.object({
  barangay_id: Joi.string().required(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  format: Joi.string().valid("json", "pdf").default("json"),
});

export const getCityReportSchema = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  format: Joi.string().valid("json", "pdf").default("json"),
});

export const getComplianceTrendSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  period: Joi.string().valid("daily", "monthly", "all_time").default("monthly"),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(365).default(30),
});

export const getInventoryReportSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  format: Joi.string().valid("json", "pdf").default("json"),
});

export const getTreatmentOutcomeSchema = Joi.object({
  barangay_id: Joi.string().optional(),
  year: Joi.number()
    .integer()
    .min(2020)
    .max(new Date().getFullYear())
    .optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  format: Joi.string().valid("json", "pdf").default("json"),
});
