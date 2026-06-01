import mongoose from 'mongoose';

// ============================================================
// Patient Model
// TB Case Number Format: PHNT-137-071-S26-XXXX
//   PHNT = Philippines National Tuberculosis Program
//   137  = NCR Region 13, sub-code 7 (Pasig)
//   071  = Pasig City municipality code
//   S26  = Screened in 2026
//   XXXX = Zero-padded sequential number
// ============================================================

const drugRegimenEntrySchema = new mongoose.Schema(
  {
    drug_name:           { type: String, required: true, trim: true, enum: ['Isoniazid', 'Rifampicin', 'Pyrazinamide', 'Ethambutol'] },
    strength:            { type: String, required: true, trim: true },
    unit:                { type: String, required: true, trim: true, default: 'tablet' },
    number_to_be_taken:  { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const sputumTestScheduleEntrySchema = new mongoose.Schema(
  {
    month:    { type: Number, required: true },          // 2 | 5 | 6
    due_date: { type: Date,   required: true },
    status:   { type: String, required: true, enum: ['Pending', 'Completed', 'Missed'], default: 'Pending' },
  },
  { _id: false },
);

const patientSchema = new mongoose.Schema(
  {
    patient_id: {
      type: String,
      required: true,
      trim: true,
      // Format: PT-XXXX
    },

    tb_case_number: {
      type: String,
      required: true,
      trim: true,
      // Format: PHNT-137-071-S26-XXXX
    },

    user_id: {
      type: String,
      trim: true,
      default: null,
      ref: 'User',
      // null if patient has not yet created a mobile account
    },

    registered_by: {
      type: String,
      required: true,
      trim: true,
      ref: 'User',
      // user_id of the nurse who created this record
    },

    // ── Personal Information ─────────────────────────────────
    last_name:   { type: String, required: true, trim: true },
    first_name:  { type: String, required: true, trim: true },
    middle_name: { type: String, trim: true, default: '' },

    full_name: {
      type: String,
      required: true,
      trim: true,
      // Denormalized: "First Middle Last" — used for text search
    },

    birth_date: { type: Date, required: true },
    age:        { type: Number, required: true, min: 0 },
    sex:        { type: String, required: true, enum: ['Male', 'Female'] },

    philhealth_number: { type: String, trim: true, default: null },
    phone_number:      { type: String, trim: true, default: null },
    email:             { type: String, trim: true, default: null, lowercase: true },

    // ── Assignment ───────────────────────────────────────────
    barangay_id: {
      type: String,
      required: true,
      trim: true,
      ref: 'Barangay',
    },

    barangay_name: {
      type: String,
      required: true,
      trim: true,
      // Denormalized for fast display
    },

    health_center_id: {
      type: String,
      required: true,
      trim: true,
    },

    health_center_name: {
      type: String,
      required: true,
      trim: true,
      // Denormalized for fast display
    },

    assigned_nurse_id: {
      type: String,
      required: true,
      trim: true,
      ref: 'User',
    },

    // ── Diagnosis ────────────────────────────────────────────
    diagnosis: {
      type: String,
      required: true,
      trim: true,
      default: 'Pulmonary TB',
    },

    date_of_diagnosis: {
      type: Date,
      required: true,
    },

    classification: {
      type: String,
      required: true,
      enum: ['Pulmonary', 'Extra-pulmonary'],
    },

    bacteriological_status: {
      type: String,
      required: true,
      enum: ['Bacteriologically Confirmed', 'Clinically Diagnosed'],
    },

    patient_type: {
      is_new:              { type: Boolean, default: true },
      is_retreatment:      { type: Boolean, default: false },
      is_drug_susceptible: { type: Boolean, default: true },
      is_drug_resistant:   { type: Boolean, default: false },
    },

    // ── Treatment ────────────────────────────────────────────
    treatment_phase: {
      type: String,
      required: true,
      enum: ['Intensive', 'Continuation'],
    },

    location_of_treatment: {
      type: String,
      required: true,
      enum: ['Health Facility', 'Home'],
      default: 'Health Facility',
    },

    date_started: { type: Date, required: true },
    end_date:     { type: Date, required: true },

    treatment_duration_months: {
      type: Number,
      required: true,
      default: 6,
    },

    schedule_of_treatment: {
      type: Date,
      required: true,
    },

    dat_support: {
      type: String,
      required: true,
      enum: ['Video-observed Treatment', 'Self-administered', 'Directly Observed Treatment'],
    },

    regimen_type: {
      type: String,
      required: true,
      trim: true,
      // e.g. "2HRZE/4HR"
    },

    drug_regimen: {
      type: [drugRegimenEntrySchema],
      required: true,
      validate: {
        validator: (v) => v.length > 0,
        message: 'Drug regimen must have at least one entry.',
      },
    },

    treatment_supporter: {
      name:    { type: String, trim: true, default: null },
      contact: { type: String, trim: true, default: null },
    },

    treatment_outcome: {
      status: {
        type: String,
        required: true,
        enum: [
          'On Treatment',
          'Cured',
          'Treatment Completed',
          'Treatment Failed',
          'Died',
          'Lost to Follow-Up',
          'Not Evaluated',
        ],
        default: 'On Treatment',
      },
      date_of_outcome: { type: Date,   default: null },
      recorded_by:     { type: String, trim: true, default: null, ref: 'User' },
    },

    // ── Contact Tracing ──────────────────────────────────────
    contact_tracing: {
      number_of_contacts: { type: Number, default: 0, min: 0 },
      schedule:           { type: Date,   default: null },
    },

    additional_notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },

    // ── Sputum Test Schedule ─────────────────────────────────
    sputum_test_schedule: {
      type: [sputumTestScheduleEntrySchema],
      default: [],
    },

    // ── Compliance ───────────────────────────────────────────
    compliance: {
      total_doses_required:     { type: Number, required: true, min: 0 },
      doses_taken:              { type: Number, default: 0,     min: 0 },
      doses_missed:             { type: Number, default: 0,     min: 0 },
      doses_remaining:          { type: Number, default: 0,     min: 0 },
      compliance_percentage:    { type: Number, default: 0,     min: 0, max: 100 },
      adherence: {
        type: String,
        enum: ['Regular', 'Irregular', 'Pending'],
        default: 'Pending',
      },
      consecutive_missed_doses: { type: Number, default: 0, min: 0 },
      last_dose_taken:          { type: Date,   default: null },
      risk_level: {
        type: String,
        enum: ['Compliant', 'At Risk', 'Defaulter'],
        default: 'Compliant',
      },
    },

    // ── Risk Score ───────────────────────────────────────────
    risk_score: {
      score: { type: Number, default: 0, min: 0, max: 100 },
      factors: {
        consecutive_missed:  { type: Number, default: 0 },
        symptom_frequency:   { type: Number, default: 0 },
        days_into_treatment: { type: Number, default: 0 },
        phase_weight: {
          type: Number,
          default: 1.2,
          // Intensive = 1.2 | Continuation = 1.0
        },
      },
      last_computed: { type: Date, default: null },
    },

    // ── Escalation ───────────────────────────────────────────
    escalation: {
      level: {
        type: Number,
        enum: [0, 1, 2, 3],
        default: 0,
        // 0 = none
        // 1 = consecutive_missed >= 2  → assigned nurse
        // 2 = consecutive_missed >= 5  → barangay admin
        // 3 = consecutive_missed >= 14 → super admin + Defaulter
      },
      escalated_at:    { type: Date,   default: null },
      escalated_by:    { type: String, default: 'system' },
      acknowledged_by: { type: String, default: null, ref: 'User' },
      acknowledged_at: { type: Date,   default: null },
      notes:           { type: String, trim: true, default: '' },
    },

    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    collection: 'patients',
  },
);

// ── Indexes ──────────────────────────────────────────────────
patientSchema.index({ patient_id: 1 },                          { unique: true });
patientSchema.index({ tb_case_number: 1 },                      { unique: true });
patientSchema.index({ user_id: 1 },                             { sparse: true });
patientSchema.index({ barangay_id: 1 });
patientSchema.index({ assigned_nurse_id: 1 });
patientSchema.index({ phone_number: 1 });
patientSchema.index({ email: 1 },                               { sparse: true });
patientSchema.index({ full_name: 'text' });
patientSchema.index({ 'compliance.risk_level': 1 });
patientSchema.index({ 'compliance.consecutive_missed_doses': 1 });
patientSchema.index({ 'escalation.level': 1 });
patientSchema.index({ 'risk_score.score': -1 });
patientSchema.index({ treatment_phase: 1 });
patientSchema.index({ is_active: 1 });

// ── Pre-save: sync full_name ──────────────────────────────────
patientSchema.pre('save', async function () {
  if (
    this.isModified('first_name') ||
    this.isModified('middle_name') ||
    this.isModified('last_name')
  ) {
    const parts = [this.first_name, this.middle_name, this.last_name].filter(Boolean);
    this.full_name = parts.join(' ');
  }
});

patientSchema.pre('save', async function () {
  if (
    this.isModified('compliance.doses_taken') ||
    this.isModified('compliance.total_doses_required')
  ) {
    const { total_doses_required, doses_taken } = this.compliance;
    this.compliance.doses_remaining = Math.max(0, total_doses_required - doses_taken);
    this.compliance.compliance_percentage =
      total_doses_required > 0
        ? parseFloat(((doses_taken / total_doses_required) * 100).toFixed(2))
        : 0;
  }
});

// ── Static: get active patients by barangay ───────────────────
patientSchema.statics.getActiveByBarangay = function (barangay_id) {
  return this.find({ barangay_id, is_active: true }).sort({ 'risk_score.score': -1 });
};

// ── Static: get defaulters system-wide ───────────────────────
patientSchema.statics.getDefaulters = function () {
  return this.find({ 'compliance.risk_level': 'Defaulter', is_active: true });
};

export default mongoose.model('Patient', patientSchema);