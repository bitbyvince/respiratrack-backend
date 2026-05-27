import mongoose from 'mongoose';

const symptomEntrySchema = new mongoose.Schema(
  {
    symptom: {
      type: String,
      enum: [
        'Nausea', 'Vomiting', 'Rash', 'Joint Pain', 'Dizziness',
        'Blurred Vision', 'Abdominal Pain', 'Fever', 'Fatigue', 'Other',
      ],
      required: true,
    },
    severity: { type: Number, enum: [1, 2, 3], required: true }, // 1=Mild | 2=Moderate | 3=Severe
  },
  { _id: false },
);

const symptomLogSchema = new mongoose.Schema(
  {
    log_id:          { type: String, required: true, unique: true },
    patient_id:      { type: String, required: true },
    tb_case_number:  { type: String, required: true },
    barangay_id:     { type: String, required: true },
    logged_at:       { type: Date,   required: true },
    symptoms:        { type: [symptomEntrySchema], default: [] },
    free_text_notes: { type: String, default: '' },
    reviewed_by:     { type: String, default: null },
    reviewed_at:     { type: Date,   default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } },
);

symptomLogSchema.index({ patient_id: 1, logged_at: -1 });
symptomLogSchema.index({ tb_case_number: 1 });
symptomLogSchema.index({ barangay_id: 1 });

export default mongoose.model('SymptomLog', symptomLogSchema);