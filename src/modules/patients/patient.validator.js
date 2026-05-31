import Joi from 'joi';

// ── REUSABLE FIELDS ──────────────────────────────────────

const nameField = (label, required = true) => {
  const base = Joi.string()
    .min(1)
    .max(64)
    .messages({
      'string.min': `${label} must not be empty.`,
      'string.max': `${label} must not exceed 64 characters.`,
    });
  return required
    ? base.required().messages({ 'any.required': `${label} is required.` })
    : base.optional().allow('', null);
};

const dateField = (label, required = true) => {
  const base = Joi.date()
    .iso()
    .messages({
      'date.base': `${label} must be a valid date.`,
      'date.format': `${label} must be in ISO format (YYYY-MM-DD).`,
    });
  return required
    ? base.required().messages({ 'any.required': `${label} is required.` })
    : base.optional().allow(null);
};

const phoneField = (required = false) => {
  const base = Joi.string()
    .pattern(/^\+639\d{9}$/)
    .messages({
      'string.pattern.base': 'Phone number must be in the format +639XXXXXXXXX.',
    });
  return required ? base.required() : base.optional().allow(null, '');
};

// ── DRUG REGIMEN ITEM ────────────────────────────────────
const drugRegimenItem = Joi.object({
  drug_name: Joi.string().required().messages({
    'any.required': 'Drug name is required.',
  }),
  strength: Joi.string().required().messages({
    'any.required': 'Drug strength is required.',
  }),
  unit: Joi.string()
    .valid('tablet', 'capsule', 'vial', 'sachet')
    .required()
    .messages({
      'any.only': 'Unit must be tablet, capsule, vial, or sachet.',
      'any.required': 'Unit is required.',
    }),
  number_to_be_taken: Joi.number().integer().min(1).required().messages({
    'number.min': 'Number to be taken must be at least 1.',
    'any.required': 'Number to be taken is required.',
  }),
});

// ── PATIENT TYPE ─────────────────────────────────────────
const patientTypeSchema = Joi.object({
  is_new: Joi.boolean().required(),
  is_retreatment: Joi.boolean().required(),
  is_drug_susceptible: Joi.boolean().required(),
  is_drug_resistant: Joi.boolean().required(),
}).messages({
  'object.base': 'Patient type must be a valid object.',
});

// ── TREATMENT SUPPORTER ──────────────────────────────────
const treatmentSupporterSchema = Joi.object({
  name: Joi.string().optional().allow(null, ''),
  contact: Joi.string()
    .pattern(/^\+639\d{9}$/)
    .optional()
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Supporter contact must be in the format +639XXXXXXXXX.',
    }),
});

// ── CONTACT TRACING ──────────────────────────────────────
const contactTracingSchema = Joi.object({
  number_of_contacts: Joi.number().integer().min(0).optional(),
  schedule: dateField('Contact tracing schedule', false),
});

// ================================================================
// REGISTER PATIENT
// ================================================================
export const registerPatientSchema = Joi.object({
  barangay_id: Joi.string().optional().allow(null, ''),
  health_center_id: Joi.string().optional().allow(null, ''),

  last_name: nameField('Last name'),
  first_name: nameField('First name'),
  middle_name: nameField('Middle name', false),
  birth_date: dateField('Birth date'),
  age: Joi.number().integer().min(0).max(120).required().messages({
    'number.min': 'Age must be a positive number.',
    'number.max': 'Age must not exceed 120.',
    'any.required': 'Age is required.',
  }),
  sex: Joi.string().valid('Male', 'Female').required().messages({
    'any.only': 'Sex must be either Male or Female.',
    'any.required': 'Sex is required.',
  }),
  philhealth_number: Joi.string()
    .pattern(/^\d{2}-\d{9}-\d{1}$/)
    .optional()
    .allow(null, '')
    .messages({
      'string.pattern.base': 'PhilHealth number must follow the format 12-123456789-0.',
    }),
  phone_number: phoneField(true),
  email: Joi.string().email().optional().allow(null, '').messages({
    'string.email': 'Please provide a valid email address.',
  }),
  barangay_name: Joi.string().required().messages({
    'any.required': 'Barangay name is required.',
  }),
  health_center_name: Joi.string().required().messages({
    'any.required': 'Health center name is required.',
  }),
  assigned_nurse_id: Joi.string().optional().allow(null, ''),
  diagnosis: Joi.string().required().messages({
    'any.required': 'Diagnosis is required.',
  }),
  date_of_diagnosis: dateField('Date of diagnosis'),
  classification: Joi.string()
    .valid('Pulmonary', 'Extra-pulmonary')
    .required()
    .messages({
      'any.only': 'Classification must be Pulmonary or Extra-pulmonary.',
      'any.required': 'Classification is required.',
    }),
  bacteriological_status: Joi.string()
    .valid('Bacteriologically Confirmed', 'Clinically Diagnosed')
    .required()
    .messages({
      'any.only': 'Bacteriological status must be Bacteriologically Confirmed or Clinically Diagnosed.',
      'any.required': 'Bacteriological status is required.',
    }),
  patient_type: patientTypeSchema.required(),
  treatment_phase: Joi.string()
    .valid('Intensive', 'Continuation')
    .required()
    .messages({
      'any.only': 'Treatment phase must be Intensive or Continuation.',
      'any.required': 'Treatment phase is required.',
    }),
  location_of_treatment: Joi.string()
    .valid('Health Facility', 'Community', 'Home')
    .required()
    .messages({
      'any.only': 'Location of treatment must be Health Facility, Community, or Home.',
      'any.required': 'Location of treatment is required.',
    }),
  date_started: dateField('Date started'),
  dat_support: Joi.string()
    .valid('Direct Observed Treatment', 'Video-observed Treatment', 'Self-administered')
    .required()
    .messages({
      'any.only': 'DAT support must be Direct Observed Treatment, Video-observed Treatment, or Self-administered.',
      'any.required': 'DAT support is required.',
    }),
  regimen_type: Joi.string().required().messages({
    'any.required': 'Regimen type is required.',
  }),
  drug_regimen: Joi.array().items(drugRegimenItem).min(1).required().messages({
    'array.min': 'At least one drug must be added to the regimen.',
    'any.required': 'Drug regimen is required.',
  }),
  treatment_supporter: treatmentSupporterSchema.optional(),
  contact_tracing: contactTracingSchema.optional(),
  additional_notes: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'Additional notes must not exceed 500 characters.',
  }),
});

// ================================================================
// UPDATE PATIENT
// ================================================================
export const updatePatientSchema = Joi.object({
  last_name: nameField('Last name', false),
  first_name: nameField('First name', false),
  middle_name: nameField('Middle name', false),
  birth_date: dateField('Birth date', false),
  age: Joi.number().integer().min(0).max(120).optional(),
  sex: Joi.string().valid('Male', 'Female').optional(),
  philhealth_number: Joi.string().pattern(/^\d{2}-\d{9}-\d{1}$/).optional().allow(null, ''),
  phone_number: phoneField(false),
  email: Joi.string().email().optional().allow(null, ''),
  diagnosis: Joi.string().optional(),
  date_of_diagnosis: dateField('Date of diagnosis', false),
  classification: Joi.string().valid('Pulmonary', 'Extra-pulmonary').optional(),
  bacteriological_status: Joi.string()
    .valid('Bacteriologically Confirmed', 'Clinically Diagnosed')
    .optional(),
  patient_type: patientTypeSchema.optional(),
  treatment_phase: Joi.string().valid('Intensive', 'Continuation').optional(),
  location_of_treatment: Joi.string().valid('Health Facility', 'Community', 'Home').optional(),
  date_started: dateField('Date started', false),
  dat_support: Joi.string()
    .valid('Direct Observed Treatment', 'Video-observed Treatment', 'Self-administered')
    .optional(),
  regimen_type: Joi.string().optional(),
  drug_regimen: Joi.array().items(drugRegimenItem).min(1).optional(),
  treatment_supporter: treatmentSupporterSchema.optional(),
  contact_tracing: contactTracingSchema.optional(),
  additional_notes: Joi.string().max(500).optional().allow(''),
  assigned_nurse_id: Joi.string().optional().allow(null, ''),
})
  .min(1)
  .messages({
    'object.min': 'At least one field must be provided for update.',
  });

// ================================================================
// UPDATE TREATMENT OUTCOME
// ================================================================
export const updateTreatmentOutcomeSchema = Joi.object({
  status: Joi.string()
    .valid(
      'On Treatment',
      'Cured',
      'Treatment Completed',
      'Treatment Failed',
      'Died',
      'Lost to Follow-Up',
      'Not Evaluated',
    )
    .required()
    .messages({
      'any.only':
        'Status must be one of: On Treatment, Cured, Treatment Completed, Treatment Failed, Died, Lost to Follow-Up, Not Evaluated.',
      'any.required': 'Treatment outcome status is required.',
    }),
});

// ================================================================
// UPDATE SPUTUM SCHEDULE
// ================================================================
export const updateSputumScheduleSchema = Joi.object({
  month: Joi.number().valid(2, 5, 6).required().messages({
    'any.only': 'Sputum test month must be 2, 5, or 6.',
    'any.required': 'Month is required.',
  }),
  due_date: dateField('Due date', false),
  status: Joi.string().valid('Pending', 'Completed', 'Missed').optional().messages({
    'any.only': 'Status must be Pending, Completed, or Missed.',
  }),
})
  .min(2)
  .messages({
    'object.min': 'At least month and one other field must be provided.',
  });

// ================================================================
// LIST PATIENTS QUERY PARAMS
// ================================================================
export const listPatientsSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  barangay_id: Joi.string().optional(),
  escalation_level: Joi.number().integer().valid(0, 1, 2, 3).optional(),
  risk_level: Joi.string().valid('Compliant', 'At Risk', 'Defaulter').optional().messages({
    'any.only': 'Risk level must be Compliant, At Risk, or Defaulter.',
  }),
  treatment_phase: Joi.string().valid('Intensive', 'Continuation').optional(),
  is_active: Joi.boolean().optional(),
  search: Joi.string().max(100).optional().allow('').messages({
    'string.max': 'Search query must not exceed 100 characters.',
  }),
});