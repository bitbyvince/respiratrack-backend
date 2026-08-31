// ============================================================
// models/Appointment.js
// Covers: Mobile Module 5 — Appointment Scheduler
//         Patient browses available slots and requests booking
//         Confirmed bookings appear on the patient dashboard
//         and trigger a push notification via Firebase
// ============================================================

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const AppointmentSchema = new Schema(
  {
    // ── Identifiers ────────────────────────────────────────
    appointment_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      // Format: "APT-{patient_id}-{timestamp_ms}"
      // e.g.  "APT-PT0001-1704067200000"
    },

    patient_id: {
      type: String,
      required: true,
      trim: true,
      ref: "Patient",
    },

    tb_case_number: {
      type: String,
      required: true,
      trim: true,
      // "PHNT-1304-071-S26-0001"
    },

    barangay_id: {
      type: String,
      required: true,
      trim: true,
      ref: "Barangay",
    },

    health_center_id: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Appointment details ────────────────────────────────
    // Purpose of the visit
    purpose: {
      type: String,
      required: true,
      enum: [
        "Follow-up", // routine treatment check-in
        "Sputum Test", // scheduled Month 2/5/6 sputum test
        "Emergency", // urgent patient-initiated request
        "Routine", // general health center visit
      ],
    },

physician: {
  type: String,
  required: false,
  default: '',
  trim: true,
  maxlength: 100,
},

    scheduled_date: {
      type: Date,
      required: true,
    },

    // "HH:MM" in 24-hour format — stored as string for simplicity
    // e.g. "09:00", "14:30"
    scheduled_time: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^([01]\d|2[0-3]):([0-5]\d)$/,
        "scheduled_time must be in HH:MM format (e.g. 09:00).",
      ],
    },

    // ── Booking lifecycle ──────────────────────────────────
    status: {
      type: String,
      required: true,
      enum: ["Pending", "Confirmed", "Completed", "Cancelled"],
      default: "Pending",
    },

    // Set when patient submits the request (mobile)
    requested_at: {
      type: Date,
      default: Date.now,
    },

    // Set by barangay_admin or nurse when they confirm
    confirmed_by: {
      type: String,
      default: null,
      trim: true,
      ref: "User",
      // user_id of the staff member who confirmed
    },

    confirmed_at: {
      type: Date,
      default: null,
    },

    // Set by staff when marking the appointment as completed
    completed_by: {
      type: String,
      default: null,
      trim: true,
      ref: "User",
    },

    completed_at: {
      type: Date,
      default: null,
    },

    // Set when appointment is cancelled (by patient or staff)
    cancelled_by: {
      type: String,
      default: null,
      trim: true,
      ref: "User",
    },

    cancelled_at: {
      type: Date,
      default: null,
    },

    cancellation_reason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },

    // ── Reminder tracking ──────────────────────────────────
    // Tracks whether the 24h reminder push has been sent
    // so Firebase doesn't send it twice
    reminder_sent: {
      type: Boolean,
      default: false,
    },

    reminder_sent_at: {
      type: Date,
      default: null,
    },

    // ── Notes ──────────────────────────────────────────────
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    collection: "appointments",
  },
);

// ── Indexes ────────────────────────────────────────────────
// Patient's appointment list on mobile dashboard
AppointmentSchema.index({ patient_id: 1, scheduled_date: -1 });

// tb_case_number lookup
AppointmentSchema.index({ tb_case_number: 1 });

// Barangay admin appointment management view
AppointmentSchema.index({ barangay_id: 1, status: 1, scheduled_date: 1 });

// Reminder job — query upcoming confirmed appointments
// where reminder has not been sent yet
AppointmentSchema.index({
  status: 1,
  scheduled_date: 1,
  reminder_sent: 1,
});

// Status filtering across all barangays (super admin)
AppointmentSchema.index({ status: 1, scheduled_date: -1 });

// ── Virtuals ───────────────────────────────────────────────
// Full ISO datetime string combining scheduled_date + scheduled_time
// Useful when you need a single sortable datetime value
AppointmentSchema.virtual("scheduled_datetime").get(function () {
  if (!this.scheduled_date || !this.scheduled_time) return null;
  const dateStr = this.scheduled_date.toISOString().split("T")[0];
  return new Date(`${dateStr}T${this.scheduled_time}:00`);
});

// True if the appointment is within the next 24 hours
// and has not had its reminder sent yet
AppointmentSchema.virtual("reminder_due").get(function () {
  if (this.status !== "Confirmed" || this.reminder_sent) return false;
  const now = Date.now();
  const apptTime = this.scheduled_datetime?.getTime();
  if (!apptTime) return false;
  const msUntilAppt = apptTime - now;
  return msUntilAppt > 0 && msUntilAppt <= 24 * 60 * 60 * 1000;
});

// ── Instance methods ───────────────────────────────────────
AppointmentSchema.methods.confirm = async function (userId) {
  if (this.status !== "Pending") {
    throw new Error(
      `Cannot confirm an appointment with status: ${this.status}`,
    );
  }
  this.status = "Confirmed";
  this.confirmed_by = userId;
  this.confirmed_at = new Date();
  return this.save();
};

AppointmentSchema.methods.complete = async function (userId) {
  if (this.status !== "Confirmed") {
    throw new Error(
      `Cannot complete an appointment with status: ${this.status}`,
    );
  }
  this.status = "Completed";
  this.completed_by = userId;
  this.completed_at = new Date();
  return this.save();
};

AppointmentSchema.methods.cancel = async function (userId, reason = "") {
  if (this.status === "Completed") {
    throw new Error("Cannot cancel a completed appointment.");
  }
  this.status = "Cancelled";
  this.cancelled_by = userId;
  this.cancelled_at = new Date();
  this.cancellation_reason = reason;
  return this.save();
};

AppointmentSchema.methods.markReminderSent = async function () {
  this.reminder_sent = true;
  this.reminder_sent_at = new Date();
  return this.save();
};

// ── Static methods ─────────────────────────────────────────
// Fetch upcoming confirmed appointments needing reminders
// Called by your Firebase notification scheduler job
AppointmentSchema.statics.getPendingReminders = function () {
  const now = new Date();
  const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return this.find({
    status: "Confirmed",
    reminder_sent: false,
    scheduled_date: { $gte: now, $lte: in24h },
  });
};

// Fetch all upcoming appointments for a patient (mobile dashboard)
AppointmentSchema.statics.getUpcomingByPatient = function (patientId) {
  return this.find({
    patient_id: patientId,
    status: { $in: ["Pending", "Confirmed"] },
    scheduled_date: { $gte: new Date() },
  }).sort({ scheduled_date: 1 });
};

// Fetch all appointments for a barangay on a specific date
// Used by barangay admin appointment management screen
AppointmentSchema.statics.getByBarangayAndDate = function (barangayId, date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return this.find({
    barangay_id: barangayId,
    scheduled_date: { $gte: start, $lte: end },
  }).sort({ scheduled_time: 1 });
};

// ── toJSON cleanup ─────────────────────────────────────────
AppointmentSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: (doc, ret) => {
    delete ret._id;
    delete ret.id;
    return ret;
  },
});

const Appointment = model("Appointment", AppointmentSchema);

export default Appointment;
