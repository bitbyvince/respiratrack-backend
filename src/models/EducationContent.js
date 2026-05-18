import mongoose from "mongoose";

const educationContentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    content_body: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: [
        "Protection Protocol",
        "TB Awareness",
        "Treatment Guide",
        "Emergency Response",
      ],
      required: true,
    },

    risk_level_target: {
      type: String,
      enum: ["Low", "Moderate", "High", "Critical", null],
      default: null,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

// Indexes matching the MongoDB setup script
educationContentSchema.index({ category: 1, is_active: 1 });
educationContentSchema.index({ risk_level_target: 1 });
educationContentSchema.index({ title: "text", content_body: "text" });

const EducationContent = mongoose.model(
  "EducationContent",
  educationContentSchema,
  "education_contents",
);
export default EducationContent;
