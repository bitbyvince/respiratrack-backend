import mongoose from "mongoose";

const treatmentCalendarSchema = new mongoose.Schema(
  {
    patient_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },

    dose_date: {
      type: Date,
      required: true,
    },

    dose_taken: {
      type: Boolean,
      required: true,
      default: false,
    },

    // Who recorded this entry: 'nurse' | 'admin' | 'system'
    recorded_by: {
      type: String,
      default: null,
    },

    recorded_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: false,
  },
);

// Indexes matching the MongoDB setup script
treatmentCalendarSchema.index({ patient_id: 1 });
treatmentCalendarSchema.index(
  { patient_id: 1, dose_date: 1 },
  { unique: true },
); // one entry per patient per day
treatmentCalendarSchema.index({ dose_date: 1 });
treatmentCalendarSchema.index({ dose_taken: 1 });

const TreatmentCalendar = mongoose.model(
  "TreatmentCalendar",
  treatmentCalendarSchema,
  "treatment_calendars",
);
export default TreatmentCalendar;
