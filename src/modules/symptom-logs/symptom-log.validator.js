import Joi from "joi";

const VALID_SYMPTOMS = [
  "Nausea",
  "Vomiting",
  "Rash",
  "Joint Pain",
  "Dizziness",
  "Blurred Vision",
  "Abdominal Pain",
  "Fever",
  "Fatigue",
  "Tingling in Hands/Feet",
  "Yellowing of Skin",
  "Dark Urine",
  "Hearing Loss",
  "Other",
];

const symptomEntrySchema = Joi.object({
  symptom: Joi.string()
    .valid(...VALID_SYMPTOMS)
    .required(),
  severity: Joi.number().integer().valid(1, 2, 3).required().messages({
    "any.only": "Severity must be 1 (Mild), 2 (Moderate), or 3 (Severe).",
  }),
});

export const logSymptomSchema = Joi.object({
  patient_id: Joi.string().required(),
  symptoms: Joi.array().items(symptomEntrySchema).min(1).required().messages({
    "array.min": "At least one symptom must be provided.",
  }),
  free_text_notes: Joi.string().allow("").optional(),
});

export const reviewSymptomSchema = Joi.object({
  notes: Joi.string().allow("").optional(),
});
