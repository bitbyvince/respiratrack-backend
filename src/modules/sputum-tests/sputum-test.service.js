const SputumTest = require("../../models/SputumTest.model");
const Patient = require("../../models/Patient.model");
const Alert = require("../../models/Alert.model");
const { ALERT_TYPES } = require("../../constants/alertTypes");
const { ROLES } = require("../../constants/roles");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a sequential test_id in the format SPT-XXXX.
 * Finds the highest existing numeric suffix and increments it.
 */
async function generateTestId() {
  const latest = await SputumTest.findOne().sort({ test_id: -1 }).select("test_id");
  if (!latest) return "SPT-0001";
  const num = parseInt(latest.test_id.replace("SPT-", ""), 10) + 1;
  return `SPT-${String(num).padStart(4, "0")}`;
}

/**
 * Syncs the sputum_test_schedule entry on the patient document
 * to match the persisted SputumTest result.
 * Keeps the embedded schedule in the patient record consistent
 * with the sputum_tests collection.
 *
 * @param {string} patientId
 * @param {number} month
 * @param {string} status   - "Completed" | "Pending" | "Not Done"
 */
async function syncPatientSchedule(patientId, month, status) {
  await Patient.updateOne(
    {
      patient_id: patientId,
      "sputum_test_schedule.month": month,
    },
    {
      $set: {
        "sputum_test_schedule.$.status": status,
        updated_at: new Date(),
      },
    }
  );
}

/**
 * Creates or updates the Sputum Test Due alert for a patient.
 * Resolves the alert once the result has been entered (not Pending).
 *
 * @param {object} testDoc
 * @param {string} resolvedByUserId
 */
async function syncSputumAlert(testDoc, resolvedByUserId = null) {
  // If result is now entered, resolve any outstanding alert
  if (testDoc.result !== "Pending") {
    await Alert.updateMany(
      {
        patient_id: testDoc.patient_id,
        alert_type: ALERT_TYPES.SPUTUM_TEST_DUE,
        status: "Active",
      },
      {
        $set: {
          status: "Resolved",
          resolved_at: new Date(),
          resolved_by: resolvedByUserId,
        },
      }
    );
    return;
  }

  // Upsert a Sputum Test Due alert — avoid duplicates
  await Alert.findOneAndUpdate(
    {
      patient_id: testDoc.patient_id,
      alert_type: ALERT_TYPES.SPUTUM_TEST_DUE,
      status: "Active",
    },
    {
      $setOnInsert: {
        tb_case_number: testDoc.tb_case_number,
        barangay_id: testDoc.barangay_id,
        escalation_level: 0,
        created_at: new Date(),
      },
      $set: {
        message:
          `Sputum test (Month ${testDoc.month}) is due for patient ` +
          `${testDoc.tb_case_number} on ` +
          `${testDoc.due_date.toISOString().split("T")[0]}.`,
        severity: "Warning",
        status: "Active",
        target_roles: [ROLES.NURSE, ROLES.BARANGAY_ADMIN],
        resolved_at: null,
        resolved_by: null,
      },
    },
    { upsert: true }
  );
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Creates a new sputum test record for a patient.
 * Also upserts a Sputum Test Due alert.
 * Called when a nurse schedules a new test or the system auto-schedules
 * based on the patient's sputum_test_schedule.
 *
 * @param {object} payload  - patient_id, month, due_date, date_collected?, notes?
 * @param {string} createdByUserId
 * @returns {SputumTest}
 */
async function createSputumTest(payload, createdByUserId) {
  const { patient_id, month, due_date, date_collected, notes } = payload;

  const patient = await Patient.findOne({ patient_id }).select(
    "patient_id tb_case_number barangay_id"
  );
  if (!patient) throw new Error("Patient not found");

  // Prevent duplicate tests for the same patient/month
  const existing = await SputumTest.findOne({ patient_id, month });
  if (existing) {
    throw new Error(
      `A sputum test for Month ${month} already exists for this patient`
    );
  }

  const testId = await generateTestId();

  const test = await SputumTest.create({
    test_id: testId,
    patient_id,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    month,
    due_date: new Date(due_date),
    date_collected: date_collected ? new Date(date_collected) : null,
    result: "Pending",
    result_entered_by: null,
    result_entered_at: null,
    notes: notes ?? "",
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Sync patient embedded schedule
  await syncPatientSchedule(patient_id, month, "Pending");

  // Create sputum due alert
  await syncSputumAlert(test);

  return test;
}

/**
 * Enters or updates the result of a sputum test.
 * Called by a nurse or barangay admin after receiving lab results.
 * Resolves the associated Sputum Test Due alert on entry.
 *
 * @param {string} testId
 * @param {object} payload  - result, date_collected?, notes?
 * @param {string} enteredByUserId
 * @returns {SputumTest}
 */
async function enterResult(testId, payload, enteredByUserId) {
  const { result, date_collected, notes } = payload;

  const test = await SputumTest.findOne({ test_id: testId });
  if (!test) throw new Error("Sputum test not found");

  const now = new Date();
  test.result = result;
  test.result_entered_by = enteredByUserId;
  test.result_entered_at = now;
  if (date_collected) test.date_collected = new Date(date_collected);
  if (notes !== undefined) test.notes = notes;
  test.updated_at = now;
  await test.save();

  // Sync patient schedule: Completed if Negative/Positive, Not Done if Not Done
  const scheduleStatus =
    result === "Not Done" ? "Not Done" : "Completed";
  await syncPatientSchedule(test.patient_id, test.month, scheduleStatus);

  // Resolve sputum due alert now that result is entered
  await syncSputumAlert(test, enteredByUserId);

  return test;
}

/**
 * Updates non-result fields of a sputum test (due_date, notes, date_collected).
 * Does not re-trigger alert logic — use enterResult for result updates.
 *
 * @param {string} testId
 * @param {object} payload
 * @returns {SputumTest}
 */
async function updateSputumTest(testId, payload) {
  const test = await SputumTest.findOne({ test_id: testId });
  if (!test) throw new Error("Sputum test not found");

  if (payload.due_date) test.due_date = new Date(payload.due_date);
  if (payload.date_collected !== undefined)
    test.date_collected = payload.date_collected
      ? new Date(payload.date_collected)
      : null;
  if (payload.notes !== undefined) test.notes = payload.notes;
  test.updated_at = new Date();
  await test.save();

  return test;
}

/**
 * Returns a paginated list of sputum tests with optional filters.
 *
 * @param {object} filters  - patient_id, barangay_id, result, month,
 *                            overdue_only, from, to, page, limit
 */
async function listSputumTests({
  patient_id,
  barangay_id,
  result,
  month,
  overdue_only,
  from,
  to,
  page,
  limit,
}) {
  const filter = {};
  if (patient_id) filter.patient_id = patient_id;
  if (barangay_id) filter.barangay_id = barangay_id;
  if (result) filter.result = result;
  if (month) filter.month = month;

  if (overdue_only) {
    // Overdue = Pending result AND due_date is in the past
    filter.result = "Pending";
    filter.due_date = { $lt: new Date() };
  } else if (from || to) {
    filter.due_date = {};
    if (from) filter.due_date.$gte = new Date(from);
    if (to) filter.due_date.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    SputumTest.find(filter)
      .sort({ due_date: 1 })
      .skip(skip)
      .limit(limit),
    SputumTest.countDocuments(filter),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

/**
 * Fetches a single sputum test by test_id.
 *
 * @param {string} testId
 * @returns {SputumTest}
 */
async function getSputumTestById(testId) {
  const test = await SputumTest.findOne({ test_id: testId });
  if (!test) throw new Error("Sputum test not found");
  return test;
}

/**
 * Returns all sputum tests due within the next N days.
 * Used by sputumReminder.job.js to send push reminders
 * and by the nurse's upcoming tests dashboard panel.
 *
 * @param {string} barangayId    - optional scope
 * @param {number} daysAhead     - default 7
 * @returns {SputumTest[]}
 */
async function getUpcomingTests(barangayId, daysAhead = 7) {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const filter = {
    result: "Pending",
    due_date: { $gte: now, $lte: cutoff },
  };
  if (barangayId) filter.barangay_id = barangayId;

  const tests = await SputumTest.find(filter)
    .sort({ due_date: 1 })
    .lean();

  // Enrich with patient name for display
  const patientIds = [...new Set(tests.map((t) => t.patient_id))];
  const patients = await Patient.find({
    patient_id: { $in: patientIds },
  }).select("patient_id full_name assigned_nurse_id");

  const patientMap = Object.fromEntries(
    patients.map((p) => [p.patient_id, p])
  );

  return tests.map((t) => ({
    ...t,
    patient_name: patientMap[t.patient_id]?.full_name ?? null,
    assigned_nurse_id: patientMap[t.patient_id]?.assigned_nurse_id ?? null,
  }));
}

/**
 * Returns all overdue sputum tests (Pending + past due_date).
 * Scoped to a barangay for nurses and barangay admins.
 *
 * @param {string} barangayId  - optional
 * @returns {SputumTest[]}
 */
async function getOverdueTests(barangayId) {
  const filter = {
    result: "Pending",
    due_date: { $lt: new Date() },
  };
  if (barangayId) filter.barangay_id = barangayId;

  const tests = await SputumTest.find(filter)
    .sort({ due_date: 1 })
    .lean();

  const patientIds = [...new Set(tests.map((t) => t.patient_id))];
  const patients = await Patient.find({
    patient_id: { $in: patientIds },
  }).select("patient_id full_name assigned_nurse_id compliance.risk_level");

  const patientMap = Object.fromEntries(
    patients.map((p) => [p.patient_id, p])
  );

  return tests.map((t) => ({
    ...t,
    patient_name: patientMap[t.patient_id]?.full_name ?? null,
    assigned_nurse_id: patientMap[t.patient_id]?.assigned_nurse_id ?? null,
    patient_risk_level: patientMap[t.patient_id]?.compliance?.risk_level ?? null,
    days_overdue: Math.floor(
      (new Date() - new Date(t.due_date)) / (1000 * 60 * 60 * 24)
    ),
  }));
}

/**
 * Returns a summary of sputum test results for a patient.
 * Powers the sputum test tracker screen on the mobile app (Module 7).
 *
 * @param {string} patientId
 * @returns {object}
 */
async function getPatientSputumSummary(patientId) {
  const patient = await Patient.findOne({ patient_id: patientId }).select(
    "patient_id tb_case_number sputum_test_schedule treatment_phase"
  );
  if (!patient) throw new Error("Patient not found");

  const tests = await SputumTest.find({ patient_id: patientId }).sort({
    month: 1,
  });

  const summary = {
    patient_id: patientId,
    tb_case_number: patient.tb_case_number,
    treatment_phase: patient.treatment_phase,
    scheduled_tests: patient.sputum_test_schedule,
    completed: tests.filter((t) => t.result === "Negative" || t.result === "Positive").length,
    pending: tests.filter((t) => t.result === "Pending").length,
    not_done: tests.filter((t) => t.result === "Not Done").length,
    positive_results: tests.filter((t) => t.result === "Positive").length,
    tests,
  };

  return summary;
}

module.exports = {
  createSputumTest,
  enterResult,
  updateSputumTest,
  listSputumTests,
  getSputumTestById,
  getUpcomingTests,
  getOverdueTests,
  getPatientSputumSummary,
};