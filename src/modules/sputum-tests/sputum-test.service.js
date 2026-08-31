import SputumTest from "../../models/SputumTest.model.js";
import Patient from "../../models/Patient.model.js";
import Alert from "../../models/Alert.model.js";
import { ALERT_TYPES } from "../../constants/alertTypes.js";
import { ROLES } from "../../constants/roles.js";

async function generateTestId() {
  const latest = await SputumTest.findOne()
    .sort({ test_id: -1 })
    .select("test_id");
  if (!latest) return "SPT-0001";
  const num = parseInt(latest.test_id.replace("SPT-", ""), 10) + 1;
  return `SPT-${String(num).padStart(4, "0")}`;
}

async function syncPatientSchedule(patientId, month, status) {
  await Patient.updateOne(
    { patient_id: patientId, "sputum_test_schedule.month": month },
    {
      $set: { "sputum_test_schedule.$.status": status, updated_at: new Date() },
    },
  );
}

async function syncSputumAlert(testDoc, resolvedByUserId = null) {
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
      },
    );
    return;
  }
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
        message: `Sputum test (Month ${testDoc.month}) is due for patient ${testDoc.tb_case_number} on ${testDoc.due_date.toISOString().split("T")[0]}.`,
        severity: "Warning",
        status: "Active",
        target_roles: [ROLES.NURSE, ROLES.BARANGAY_ADMIN],
        resolved_at: null,
        resolved_by: null,
      },
    },
    { upsert: true },
  );
}

export async function createSputumTest(payload, createdByUserId) {
  const { patient_id, month, due_date, date_collected, notes } = payload;
  const patient = await Patient.findOne({ patient_id }).select(
    "patient_id tb_case_number barangay_id",
  );
  if (!patient) throw new Error("Patient not found");

  const existing = await SputumTest.findOne({ patient_id, month });
  if (existing)
    throw new Error(
      `A sputum test for Month ${month} already exists for this patient`,
    );

  const test = await SputumTest.create({
    test_id: await generateTestId(),
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

  await syncPatientSchedule(patient_id, month, "Pending");
  await syncSputumAlert(test);
  return test;
}

export async function enterResult(testId, payload, enteredByUserId) {
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

  await syncPatientSchedule(
    test.patient_id,
    test.month,
    result === "Not Done" ? "Not Done" : "Completed",
  );
  await syncSputumAlert(test, enteredByUserId);
  return test;
}

export async function updateSputumTest(testId, payload) {
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

export async function listSputumTests({
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
    filter.result = "Pending";
    filter.due_date = { $lt: new Date() };
  } else if (from || to) {
    filter.due_date = {};
    if (from) filter.due_date.$gte = new Date(from);
    if (to) filter.due_date.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    SputumTest.find(filter).sort({ due_date: 1 }).skip(skip).limit(limit),
    SputumTest.countDocuments(filter),
  ]);
  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getSputumTestById(testId) {
  const test = await SputumTest.findOne({ test_id: testId });
  if (!test) throw new Error("Sputum test not found");
  return test;
}

export async function getUpcomingTests(barangayId, daysAhead = 7) {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  const filter = { result: "Pending", due_date: { $gte: now, $lte: cutoff } };
  if (barangayId) filter.barangay_id = barangayId;

  const tests = await SputumTest.find(filter).sort({ due_date: 1 }).lean();
  const patientIds = [...new Set(tests.map((t) => t.patient_id))];
  const patients = await Patient.find({
    patient_id: { $in: patientIds },
  }).select("patient_id full_name assigned_nurse_id");
  const patientMap = Object.fromEntries(patients.map((p) => [p.patient_id, p]));

  return tests.map((t) => ({
    ...t,
    patient_name: patientMap[t.patient_id]?.full_name ?? null,
    assigned_nurse_id: patientMap[t.patient_id]?.assigned_nurse_id ?? null,
  }));
}

export async function getOverdueTests(barangayId) {
  const filter = { result: "Pending", due_date: { $lt: new Date() } };
  if (barangayId) filter.barangay_id = barangayId;

  const tests = await SputumTest.find(filter).sort({ due_date: 1 }).lean();
  const patientIds = [...new Set(tests.map((t) => t.patient_id))];
  const patients = await Patient.find({
    patient_id: { $in: patientIds },
  }).select("patient_id full_name assigned_nurse_id compliance.risk_level");
  const patientMap = Object.fromEntries(patients.map((p) => [p.patient_id, p]));

  return tests.map((t) => ({
    ...t,
    patient_name: patientMap[t.patient_id]?.full_name ?? null,
    assigned_nurse_id: patientMap[t.patient_id]?.assigned_nurse_id ?? null,
    patient_risk_level:
      patientMap[t.patient_id]?.compliance?.risk_level ?? null,
    days_overdue: Math.floor(
      (new Date() - new Date(t.due_date)) / (1000 * 60 * 60 * 24),
    ),
  }));
}

export async function getPatientSputumSummary(patientId) {
  const patient = await Patient.findOne({ patient_id: patientId }).select(
    "patient_id tb_case_number sputum_test_schedule treatment_phase",
  );
  if (!patient) throw new Error("Patient not found");

  const tests = await SputumTest.find({ patient_id: patientId }).sort({
    month: 1,
  });

  return {
    patient_id: patientId,
    tb_case_number: patient.tb_case_number,
    treatment_phase: patient.treatment_phase,
    scheduled_tests: patient.sputum_test_schedule,
    completed: tests.filter(
      (t) => t.result === "Negative" || t.result === "Positive",
    ).length,
    pending: tests.filter((t) => t.result === "Pending").length,
    not_done: tests.filter((t) => t.result === "Not Done").length,
    positive_results: tests.filter((t) => t.result === "Positive").length,
    tests,
  };
}
