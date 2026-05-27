const Patient = require("../../models/Patient.model");
const MedicationLog = require("../../models/MedicationLog.model");
const SymptomLog = require("../../models/SymptomLog.model");
const Appointment = require("../../models/Appointment.model");
const SputumTest = require("../../models/SputumTest.model");
const DispensingRecord = require("../../models/DispensingRecord.model");
const ComplianceSnapshot = require("../../models/ComplianceSnapshot.model");
const EscalationLog = require("../../models/EscalationLog.model");
const Inventory = require("../../models/Inventory.model");
const Barangay = require("../../models/Barangay.model");
const { generatePatientPDF, generateBarangayPDF, generateCityPDF, generateInventoryPDF, generateOutcomePDF } = require("../../utils/pdfExporter");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a date range filter for MongoDB queries.
 * Defaults to all time if neither bound is provided.
 */
function buildDateRange(from, to, field = "created_at") {
  const filter = {};
  if (from || to) {
    filter[field] = {};
    if (from) filter[field].$gte = new Date(from);
    if (to) filter[field].$lte = new Date(to);
  }
  return filter;
}

/**
 * Computes a compliance summary object from an array of medication logs.
 *   taken    = logs where overall_status === "Taken"
 *   partial  = logs where overall_status === "Partial"
 *   missed   = logs where overall_status === "Missed"
 */
function summariseMedicationLogs(logs) {
  const summary = { taken: 0, partial: 0, missed: 0, total: logs.length };
  for (const log of logs) {
    if (log.overall_status === "Taken") summary.taken++;
    else if (log.overall_status === "Partial") summary.partial++;
    else if (log.overall_status === "Missed") summary.missed++;
  }
  summary.compliance_percentage =
    summary.total > 0
      ? parseFloat(
          (((summary.taken + summary.partial * 0.5) / summary.total) * 100).toFixed(2)
        )
      : 0;
  return summary;
}

/**
 * Aggregates treatment outcome counts from a list of patient records.
 */
function aggregateOutcomes(patients) {
  const outcomes = {
    "On Treatment": 0,
    Cured: 0,
    "Treatment Completed": 0,
    "Treatment Failed": 0,
    Died: 0,
    "Lost to Follow-Up": 0,
    "Not Evaluated": 0,
  };
  for (const p of patients) {
    const status = p.treatment_outcome?.status ?? "Not Evaluated";
    if (outcomes[status] !== undefined) outcomes[status]++;
    else outcomes["Not Evaluated"]++;
  }
  return outcomes;
}

/**
 * Aggregates risk level counts from a list of patient records.
 */
function aggregateRiskLevels(patients) {
  return patients.reduce(
    (acc, p) => {
      const level = p.compliance?.risk_level ?? "Compliant";
      if (level === "Compliant") acc.compliant++;
      else if (level === "At Risk") acc.at_risk++;
      else if (level === "Defaulter") acc.defaulter++;
      return acc;
    },
    { compliant: 0, at_risk: 0, defaulter: 0 }
  );
}

// ─── Report Builders ──────────────────────────────────────────────────────────

/**
 * Builds a full individual patient report.
 * Aggregates all linked records within an optional date range.
 *
 * @param {string}  patientId
 * @param {object}  options   - include flags and date range
 * @returns {object} report data
 */
async function buildPatientReport(patientId, options = {}) {
  const {
    include_medication_logs = true,
    include_symptom_logs = true,
    include_sputum_tests = true,
    include_appointments = true,
    include_dispensing = true,
    from,
    to,
  } = options;

  const patient = await Patient.findOne({ patient_id: patientId });
  if (!patient) throw new Error("Patient not found");

  const dateFilter = buildDateRange(from, to, "created_at");
  const logDateFilter = buildDateRange(from, to, "log_date");

  const [
    medicationLogs,
    symptomLogs,
    sputumTests,
    appointments,
    dispensingRecords,
    escalationLogs,
  ] = await Promise.all([
    include_medication_logs
      ? MedicationLog.find({ patient_id: patientId, ...logDateFilter }).sort({ log_date: 1 })
      : [],
    include_symptom_logs
      ? SymptomLog.find({ patient_id: patientId, ...buildDateRange(from, to, "logged_at") }).sort({ logged_at: 1 })
      : [],
    include_sputum_tests
      ? SputumTest.find({ patient_id: patientId }).sort({ due_date: 1 })
      : [],
    include_appointments
      ? Appointment.find({ patient_id: patientId, ...buildDateRange(from, to, "scheduled_date") }).sort({ scheduled_date: 1 })
      : [],
    include_dispensing
      ? DispensingRecord.find({ patient_id: patientId, ...buildDateRange(from, to, "dispense_date") }).sort({ dispense_date: 1 })
      : [],
    EscalationLog.find({ patient_id: patientId }).sort({ triggered_at: -1 }),
  ]);

  const medicationSummary = summariseMedicationLogs(medicationLogs);

  return {
    generated_at: new Date(),
    report_type: "patient",
    patient: {
      patient_id: patient.patient_id,
      tb_case_number: patient.tb_case_number,
      full_name: patient.full_name,
      age: patient.age,
      sex: patient.sex,
      barangay_name: patient.barangay_name,
      health_center_name: patient.health_center_name,
      diagnosis: patient.diagnosis,
      classification: patient.classification,
      bacteriological_status: patient.bacteriological_status,
      treatment_phase: patient.treatment_phase,
      regimen_type: patient.regimen_type,
      drug_regimen: patient.drug_regimen,
      date_started: patient.date_started,
      end_date: patient.end_date,
      treatment_outcome: patient.treatment_outcome,
      compliance: patient.compliance,
      risk_score: patient.risk_score,
      escalation: patient.escalation,
      sputum_test_schedule: patient.sputum_test_schedule,
      contact_tracing: patient.contact_tracing,
    },
    medication_summary: medicationSummary,
    medication_logs: medicationLogs,
    symptom_logs: symptomLogs,
    sputum_tests: sputumTests,
    appointments: appointments,
    dispensing_records: dispensingRecords,
    escalation_history: escalationLogs,
    date_range: { from: from ?? null, to: to ?? null },
  };
}

/**
 * Builds a barangay-level aggregate report.
 * Includes patient breakdown, compliance trend, outcomes, and stock status.
 *
 * @param {string} barangayId
 * @param {object} options     - from, to date range
 * @returns {object} report data
 */
async function buildBarangayReport(barangayId, options = {}) {
  const { from, to } = options;

  const barangay = await Barangay.findOne({ barangay_id: barangayId });
  if (!barangay) throw new Error("Barangay not found");

  const patients = await Patient.find({
    barangay_id: barangayId,
    is_active: true,
  }).select(
    "patient_id tb_case_number full_name sex age treatment_phase " +
    "compliance.risk_level compliance.compliance_percentage " +
    "compliance.consecutive_missed_doses treatment_outcome escalation.level " +
    "date_started risk_score.score"
  );

  const riskSummary = aggregateRiskLevels(patients);
  const outcomeSummary = aggregateOutcomes(patients);

  // Compliance trend from snapshots
  const snapshotFilter = {
    barangay_id: barangayId,
    period: "monthly",
    ...buildDateRange(from, to, "snapshot_date"),
  };

  const complianceTrend = await ComplianceSnapshot.find(snapshotFilter)
    .sort({ snapshot_date: 1 })
    .select(
      "snapshot_date compliance_percentage compliant_count " +
      "at_risk_count defaulter_count average_risk_score"
    );

  // Open escalations
  const openEscalations = await EscalationLog.find({
    barangay_id: barangayId,
    resolved: false,
  }).select("escalation_id level patient_id tb_case_number triggered_at");

  // Inventory summary
  const inventory = await Inventory.find({ barangay_id: barangayId }).select(
    "drug_name strength remaining_stock stock_status active_patients_on_this_drug"
  );

  return {
    generated_at: new Date(),
    report_type: "barangay",
    barangay: {
      barangay_id: barangay.barangay_id,
      name: barangay.name,
      municipality: barangay.municipality,
      health_center: barangay.health_center,
      stats: barangay.stats,
    },
    patient_summary: {
      total_active: patients.length,
      ...riskSummary,
      average_compliance_percentage:
        patients.length > 0
          ? parseFloat(
              (
                patients.reduce(
                  (sum, p) => sum + (p.compliance?.compliance_percentage ?? 0),
                  0
                ) / patients.length
              ).toFixed(2)
            )
          : 0,
    },
    treatment_outcomes: outcomeSummary,
    patients,
    compliance_trend: complianceTrend,
    open_escalations: openEscalations,
    inventory_summary: inventory,
    date_range: { from: from ?? null, to: to ?? null },
  };
}

/**
 * Builds a city-wide aggregate report across all barangays.
 * Used by super admin for the NTP quarterly/annual submission.
 *
 * @param {object} options  - from, to date range
 * @returns {object} report data
 */
async function buildCityReport(options = {}) {
  const { from, to } = options;

  const barangays = await Barangay.find({});
  const allPatients = await Patient.find({ is_active: true }).select(
    "patient_id tb_case_number barangay_id barangay_name sex age " +
    "treatment_phase compliance.risk_level compliance.compliance_percentage " +
    "treatment_outcome escalation.level risk_score.score date_started " +
    "patient_type bacteriological_status classification"
  );

  const totalPatients = allPatients.length;
  const riskSummary = aggregateRiskLevels(allPatients);
  const outcomeSummary = aggregateOutcomes(allPatients);

  // Per-barangay breakdown
  const barangayBreakdown = barangays.map((brgy) => {
    const brgyPatients = allPatients.filter(
      (p) => p.barangay_id === brgy.barangay_id
    );
    return {
      barangay_id: brgy.barangay_id,
      name: brgy.name,
      health_center_name: brgy.health_center?.name,
      total_active: brgyPatients.length,
      risk_summary: aggregateRiskLevels(brgyPatients),
      compliance_percentage: brgy.stats?.compliance_percentage ?? 0,
      risk_level: brgy.stats?.risk_level ?? "low",
    };
  });

  // City-wide compliance trend
  const snapshotFilter = {
    period: "monthly",
    ...buildDateRange(from, to, "snapshot_date"),
  };

  const allSnapshots = await ComplianceSnapshot.find(snapshotFilter)
    .sort({ snapshot_date: 1, barangay_id: 1 })
    .select(
      "barangay_id barangay_name snapshot_date compliance_percentage " +
      "compliant_count at_risk_count defaulter_count average_risk_score"
    );

  // City-wide inventory overview
  const inventory = await Inventory.find({}).select(
    "barangay_id drug_name strength remaining_stock stock_status"
  );

  const criticalStock = inventory.filter(
    (i) => i.stock_status === "Critical" || i.stock_status === "Stockout"
  );

  // Classification breakdown
  const classificationBreakdown = allPatients.reduce(
    (acc, p) => {
      if (p.classification === "Pulmonary") acc.pulmonary++;
      else acc.extra_pulmonary++;
      return acc;
    },
    { pulmonary: 0, extra_pulmonary: 0 }
  );

  // Bacteriological status breakdown
  const bacteriologicalBreakdown = allPatients.reduce(
    (acc, p) => {
      if (p.bacteriological_status === "Bacteriologically Confirmed")
        acc.bacteriologically_confirmed++;
      else acc.clinically_diagnosed++;
      return acc;
    },
    { bacteriologically_confirmed: 0, clinically_diagnosed: 0 }
  );

  // Patient type breakdown
  const patientTypeBreakdown = allPatients.reduce(
    (acc, p) => {
      if (p.patient_type?.is_new) acc.new_cases++;
      if (p.patient_type?.is_retreatment) acc.retreatment++;
      if (p.patient_type?.is_drug_resistant) acc.drug_resistant++;
      return acc;
    },
    { new_cases: 0, retreatment: 0, drug_resistant: 0 }
  );

  return {
    generated_at: new Date(),
    report_type: "city",
    city: "Pasig City",
    total_active_patients: totalPatients,
    risk_summary: riskSummary,
    treatment_outcomes: outcomeSummary,
    classification_breakdown: classificationBreakdown,
    bacteriological_breakdown: bacteriologicalBreakdown,
    patient_type_breakdown: patientTypeBreakdown,
    barangay_breakdown: barangayBreakdown,
    compliance_snapshots: allSnapshots,
    critical_stock_items: criticalStock,
    date_range: { from: from ?? null, to: to ?? null },
  };
}

/**
 * Returns time-series compliance trend data.
 * Scoped to a single barangay or city-wide.
 * Powers the trend chart on the dashboard and reports screen.
 *
 * @param {string} barangayId  - optional; omit for city-wide
 * @param {string} period
 * @param {Date}   from
 * @param {Date}   to
 * @param {number} limit
 */
async function getComplianceTrend(
  barangayId,
  period = "monthly",
  from,
  to,
  limit = 30
) {
  const filter = { period };
  if (barangayId) filter.barangay_id = barangayId;
  if (from || to) {
    filter.snapshot_date = {};
    if (from) filter.snapshot_date.$gte = new Date(from);
    if (to) filter.snapshot_date.$lte = new Date(to);
  }

  const snapshots = await ComplianceSnapshot.find(filter)
    .sort({ snapshot_date: -1 })
    .limit(limit)
    .select(
      "barangay_id barangay_name snapshot_date compliance_percentage " +
      "compliant_count at_risk_count defaulter_count average_risk_score total_patients"
    );

  return snapshots.reverse(); // ascending for charting
}

/**
 * Builds an inventory report for a single barangay or all barangays.
 * Includes current stock levels, status, and estimated days remaining.
 *
 * @param {string} barangayId  - optional
 * @returns {object} report data
 */
async function buildInventoryReport(barangayId) {
  const filter = {};
  if (barangayId) filter.barangay_id = barangayId;

  const inventory = await Inventory.find(filter).sort({
    barangay_id: 1,
    drug_name: 1,
  });

  // Group by barangay for report structure
  const grouped = inventory.reduce((acc, item) => {
    if (!acc[item.barangay_id]) {
      acc[item.barangay_id] = {
        barangay_id: item.barangay_id,
        health_center_id: item.health_center_id,
        drugs: [],
      };
    }
    const daysRemaining =
      item.active_patients_on_this_drug > 0
        ? Math.floor(
            item.remaining_stock / item.active_patients_on_this_drug
          )
        : null;

    acc[item.barangay_id].drugs.push({
      inventory_id: item.inventory_id,
      drug_name: item.drug_name,
      strength: item.strength,
      unit: item.unit,
      total_allocated: item.total_allocated,
      total_dispensed: item.total_dispensed,
      remaining_stock: item.remaining_stock,
      active_patients_on_this_drug: item.active_patients_on_this_drug,
      stock_status: item.stock_status,
      estimated_days_remaining: daysRemaining,
      expiry_date: item.expiry_date,
      last_dispensed_at: item.last_dispensed_at,
    });
    return acc;
  }, {});

  const criticalItems = inventory.filter(
    (i) => i.stock_status === "Critical" || i.stock_status === "Stockout"
  );

  return {
    generated_at: new Date(),
    report_type: "inventory",
    barangay_id: barangayId ?? "all",
    grouped_by_barangay: Object.values(grouped),
    critical_items: criticalItems,
    total_records: inventory.length,
  };
}

/**
 * Builds a treatment outcome report grouped by outcome status.
 * Optionally filtered by barangay and/or year.
 * Mirrors NTP quarterly outcome reporting requirements.
 *
 * @param {string} barangayId  - optional
 * @param {number} year        - optional; filters by date_started year
 * @returns {object} report data
 */
async function buildTreatmentOutcomeReport(barangayId, year) {
  const filter = { is_active: false }; // outcomes are on completed patients
  if (barangayId) filter.barangay_id = barangayId;
  if (year) {
    filter.date_started = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };
  }

  // Include active patients too for "On Treatment" count
  const allFilter = { ...(barangayId ? { barangay_id: barangayId } : {}) };
  if (year) {
    allFilter.date_started = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };
  }

  const patients = await Patient.find(allFilter).select(
    "patient_id tb_case_number full_name barangay_name treatment_phase " +
    "treatment_outcome date_started end_date compliance.compliance_percentage " +
    "patient_type classification bacteriological_status"
  );

  const outcomeSummary = aggregateOutcomes(patients);
  const total = patients.length;

  // Build percentage breakdown
  const outcomePercentages = Object.fromEntries(
    Object.entries(outcomeSummary).map(([k, v]) => [
      k,
      {
        count: v,
        percentage:
          total > 0 ? parseFloat(((v / total) * 100).toFixed(2)) : 0,
      },
    ])
  );

  // Group individual patients by outcome for drill-down
  const patientsByOutcome = patients.reduce((acc, p) => {
    const status = p.treatment_outcome?.status ?? "Not Evaluated";
    if (!acc[status]) acc[status] = [];
    acc[status].push({
      patient_id: p.patient_id,
      tb_case_number: p.tb_case_number,
      full_name: p.full_name,
      barangay_name: p.barangay_name,
      classification: p.classification,
      bacteriological_status: p.bacteriological_status,
      treatment_phase: p.treatment_phase,
      date_started: p.date_started,
      end_date: p.end_date,
      compliance_percentage: p.compliance?.compliance_percentage ?? 0,
    });
    return acc;
  }, {});

  return {
    generated_at: new Date(),
    report_type: "treatment_outcome",
    barangay_id: barangayId ?? "all",
    year: year ?? "all",
    total_patients: total,
    outcome_summary: outcomePercentages,
    patients_by_outcome: patientsByOutcome,
  };
}

module.exports = {
  buildPatientReport,
  buildBarangayReport,
  buildCityReport,
  getComplianceTrend,
  buildInventoryReport,
  buildTreatmentOutcomeReport,
};