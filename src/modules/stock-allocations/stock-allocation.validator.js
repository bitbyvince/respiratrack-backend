const Joi = require('joi');

const createAllocationSchema = Joi.object({
  barangay_id: Joi.string().required(),
  health_center_id: Joi.string().required(),
  drug_name: Joi.string()
    .valid('Isoniazid', 'Rifampicin', 'Pyrazinamide', 'Ethambutol')
    .required(),
  strength: Joi.string().required(),
  unit: Joi.string().valid('tablet', 'capsule', 'vial').default('tablet'),
  quantity_allocated: Joi.number().integer().min(1).required(),
  allocation_date: Joi.date().iso().default(() => new Date()),
  notes: Joi.string().allow('').optional(),
});

const getAllocationsQuerySchema = Joi.object({
  barangay_id: Joi.string().optional(),
  drug_name: Joi.string().optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

module.exports = { createAllocationSchema, getAllocationsQuerySchema };