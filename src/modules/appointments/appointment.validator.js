import Joi from 'joi';

const VALID_PURPOSES = ['Follow-up', 'Sputum Test', 'Medication Refill', 'Consultation', 'Routine'];

export const createAppointmentSchema = Joi.object({
  patient_id: Joi.string().required(),
  // Date-only granularity can't express "later today", so the real
  // in-the-future check (which also accounts for scheduled_time) happens
  // in appointment.service.js instead of here.
  scheduled_date: Joi.date().required(),
  scheduled_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .required()
    .messages({
      'string.pattern.base': 'scheduled_time must be in HH:MM format (e.g. 09:00).',
    }),
  purpose: Joi.string()
    .valid(...VALID_PURPOSES)
    .required()
    .messages({
      'any.only': `Purpose must be one of: ${VALID_PURPOSES.join(', ')}`,
    }),
  notes: Joi.string().allow('').optional(),
});

export const updateAppointmentSchema = Joi.object({
  scheduled_date: Joi.date().optional(),
  scheduled_time: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional()
    .messages({
      'string.pattern.base': 'scheduled_time must be in HH:MM format (e.g. 09:00).',
    }),
  purpose: Joi.string()
    .valid(...VALID_PURPOSES)
    .optional()
    .messages({
      'any.only': `Purpose must be one of: ${VALID_PURPOSES.join(', ')}`,
    }),
  notes: Joi.string().allow('').optional(),
});