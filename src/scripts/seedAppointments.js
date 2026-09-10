// ============================================================
// scripts/seedAppointments.js
//
// Seeds a mix of past and upcoming appointments against the real
// seeded patients — at least 10 of each bucket:
//   - Past: Completed (most) or Cancelled
//   - Upcoming: Pending (just requested) or Confirmed (staff approved)
//
// Uses the same appointment_id format as the real booking flow
// (APT-XXXX, sequential) and staffs confirmed_by/completed_by with
// whichever real user actually registered that patient.
//
// Run with: node src/scripts/seedAppointments.js
// ============================================================

import mongoose from "mongoose";
import "dotenv/config";
import Patient from "../models/Patient.model.js";
import Appointment from "../models/Appointment.model.js";

const { MONGODB_URI } = process.env;
const DAY_MS = 86400000;

const PURPOSES = ["Follow-up", "Sputum Test", "Medication Refill", "Consultation", "Routine"];
const PHYSICIANS = ["Dr. Ramos", "Dr. Villanueva", "Dr. Santos", "Dr. Cruz", "Dr. Aquino", ""];
const TIMES = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "13:00", "13:30", "14:00", "15:00"];
const CANCEL_REASONS = [
  "Patient requested reschedule due to work conflict.",
  "Patient unavailable — will rebook next visit.",
  "Weather/transportation issue reported by patient.",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;

async function run() {
  await mongoose.connect(MONGODB_URI);

  const patients = await Patient.find({ is_active: true }).select(
    "patient_id tb_case_number barangay_id health_center_id health_center_name registered_by assigned_nurse_id"
  );
  if (patients.length === 0) {
    throw new Error("No patients found — run seedPatients.js first.");
  }

  let apptSeq = 1;
  const nextApptId = () => `APT-${String(apptSeq++).padStart(4, "0")}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const docs = [];

  // ── Past appointments (at least 10) ──────────────────────────
  const PAST_COUNT = 16;
  for (let i = 0; i < PAST_COUNT; i++) {
    const patient = pick(patients);
    const daysAgo = randInt(3, 150);
    const scheduledDate = new Date(today.getTime() - daysAgo * DAY_MS);
    const isCancelled = chance(0.2);
    const staffId = patient.assigned_nurse_id || patient.registered_by;

    const base = {
      appointment_id: nextApptId(),
      patient_id: patient.patient_id,
      tb_case_number: patient.tb_case_number,
      barangay_id: patient.barangay_id,
      health_center_id: patient.health_center_id,
      health_center_name: patient.health_center_name,
      purpose: pick(PURPOSES),
      physician: pick(PHYSICIANS),
      scheduled_date: scheduledDate,
      scheduled_time: pick(TIMES),
      requested_at: new Date(scheduledDate.getTime() - randInt(1, 5) * DAY_MS),
      notes: "",
    };

    if (isCancelled) {
      docs.push({
        ...base,
        status: "Cancelled",
        confirmed_by: chance(0.5) ? staffId : null,
        confirmed_at: chance(0.5) ? new Date(scheduledDate.getTime() - randInt(1, 3) * DAY_MS) : null,
        cancelled_by: chance(0.7) ? staffId : null,
        cancelled_at: new Date(scheduledDate.getTime() - randInt(0, 2) * DAY_MS),
        cancellation_reason: pick(CANCEL_REASONS),
        reminder_sent: false,
        reminder_sent_at: null,
      });
    } else {
      const confirmedAt = new Date(scheduledDate.getTime() - randInt(1, 3) * DAY_MS);
      docs.push({
        ...base,
        status: "Completed",
        confirmed_by: staffId,
        confirmed_at: confirmedAt,
        completed_by: staffId,
        completed_at: scheduledDate,
        reminder_sent: true,
        reminder_sent_at: new Date(scheduledDate.getTime() - DAY_MS),
      });
    }
  }

  // ── Upcoming / pending appointments (at least 10) ────────────
  const UPCOMING_COUNT = 16;
  for (let i = 0; i < UPCOMING_COUNT; i++) {
    const patient = pick(patients);
    const daysAhead = randInt(1, 30);
    const scheduledDate = new Date(today.getTime() + daysAhead * DAY_MS);
    const isConfirmed = chance(0.5);
    const staffId = patient.assigned_nurse_id || patient.registered_by;

    const base = {
      appointment_id: nextApptId(),
      patient_id: patient.patient_id,
      tb_case_number: patient.tb_case_number,
      barangay_id: patient.barangay_id,
      health_center_id: patient.health_center_id,
      health_center_name: patient.health_center_name,
      purpose: pick(PURPOSES),
      physician: pick(PHYSICIANS),
      scheduled_date: scheduledDate,
      scheduled_time: pick(TIMES),
      status: isConfirmed ? "Confirmed" : "Pending",
      requested_at: new Date(today.getTime() - randInt(0, 3) * DAY_MS),
      confirmed_by: isConfirmed ? staffId : null,
      confirmed_at: isConfirmed ? new Date(today.getTime() - randInt(0, 2) * DAY_MS) : null,
      reminder_sent: false,
      reminder_sent_at: null,
      notes: "",
    };

    docs.push(base);
  }

  await Appointment.insertMany(docs);
  console.log(`✅ Seeded ${docs.length} appointments:`);
  console.log(`   - ${PAST_COUNT} past (Completed/Cancelled)`);
  console.log(`   - ${UPCOMING_COUNT} upcoming (Pending/Confirmed)`);

  const byStatus = docs.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1;
    return acc;
  }, {});
  console.log("   Status breakdown:", byStatus);

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
