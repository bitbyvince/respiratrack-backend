import Patient from "../../models/Patient.model.js";
import MedicationLog from "../../models/MedicationLog.model.js";
import SymptomLog from "../../models/SymptomLog.model.js";
import Appointment from "../../models/Appointment.model.js";
import SputumTest from "../../models/SputumTest.model.js";
import DispensingRecord from "../../models/DispensingRecord.model.js";
import ComplianceSnapshot from "../../models/ComplianceSnapshot.model.js";
import EscalationLog from "../../models/EscalationLog.model.js";
import Inventory from "../../models/Inventory.model.js";
import Barangay from "../../models/Barangay.model.js";
import HeatmapSnapshot from "../../models/HeatmapSnapshot.model.js";

import {
  generatePatientPDF,
  generateBarangayPDF,
  generateCityPDF,
  generateInventoryPDF,
  generateOutcomePDF,
} from "../../utils/pdfExporter.js";

function buildDateRange(from, to, field = "created_at") {
  const filter = {};
  if (from || to) {
    filter[field] = {};
    if (from) filter[field].$gte = new Date(from);
    if (to) filter[field].$lte = new Date(to);
  }
  return filter;
}

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
          (
            ((summary.taken + summary.partial * 0.5) / summary.total) *
            100
          ).toFixed(2),
        )
      : 0;
  return summary;
}

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

function aggregateRiskLevels(patients) {
  return patients.reduce(
    (acc, p) => {
      const level = p.compliance?.risk_level ?? "Compliant";
      if (level === "Compliant") acc.compliant++;
      else if (level === "At Risk") acc.at_risk++;
      else if (level === "Defaulter") acc.defaulter++;
      return acc;
    },
    { compliant: 0, at_risk: 0, defaulter: 0 },
  );
}

export async function buildPatientReport(patientId, options = {}) {
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
      ? MedicationLog.find({ patient_id: patientId, ...logDateFilter }).sort({
          log_date: 1,
        })
      : [],
    include_symptom_logs
      ? SymptomLog.find({
          patient_id: patientId,
          ...buildDateRange(from, to, "logged_at"),
        }).sort({ logged_at: 1 })
      : [],
    include_sputum_tests
      ? SputumTest.find({ patient_id: patientId }).sort({ due_date: 1 })
      : [],
    include_appointments
      ? Appointment.find({
          patient_id: patientId,
          ...buildDateRange(from, to, "scheduled_date"),
        }).sort({ scheduled_date: 1 })
      : [],
    include_dispensing
      ? DispensingRecord.find({
          patient_id: patientId,
          ...buildDateRange(from, to, "dispense_date"),
        }).sort({ dispense_date: 1 })
      : [],
    EscalationLog.find({ patient_id: patientId }).sort({ triggered_at: -1 }),
  ]);

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
    medication_summary: summariseMedicationLogs(medicationLogs),
    medication_logs: medicationLogs,
    symptom_logs: symptomLogs,
    sputum_tests: sputumTests,
    appointments,
    dispensing_records: dispensingRecords,
    escalation_history: escalationLogs,
    date_range: { from: from ?? null, to: to ?? null },
  };
}

export async function buildBarangayReport(barangayId, options = {}) {
  const { from, to } = options;
  const barangay = await Barangay.findOne({ barangay_id: barangayId });
  if (!barangay) throw new Error("Barangay not found");

  const patients = await Patient.find({
    barangay_id: barangayId,
    is_active: true,
  }).select(
    "patient_id tb_case_number full_name sex age treatment_phase " +
      "compliance.risk_level compliance.compliance_percentage " +
      "compliance.consecutive_missed_doses treatment_outcome escalation.level date_started risk_score.score",
  );

  const [complianceTrend, openEscalations, inventory] = await Promise.all([
    ComplianceSnapshot.find({
      barangay_id: barangayId,
      period: "monthly",
      ...buildDateRange(from, to, "snapshot_date"),
    })
      .sort({ snapshot_date: 1 })
      .select(
        "snapshot_date compliance_percentage compliant_count at_risk_count defaulter_count average_risk_score",
      ),
    EscalationLog.find({ barangay_id: barangayId, resolved: false }).select(
      "escalation_id level patient_id tb_case_number triggered_at",
    ),
    Inventory.find({ barangay_id: barangayId }).select(
      "drug_name strength remaining_stock stock_status active_patients_on_this_drug",
    ),
  ]);

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
      ...aggregateRiskLevels(patients),
      average_compliance_percentage:
        patients.length > 0
          ? parseFloat(
              (
                patients.reduce(
                  (sum, p) => sum + (p.compliance?.compliance_percentage ?? 0),
                  0,
                ) / patients.length
              ).toFixed(2),
            )
          : 0,
    },
    treatment_outcomes: aggregateOutcomes(patients),
    patients,
    compliance_trend: complianceTrend,
    open_escalations: openEscalations,
    inventory_summary: inventory,
    date_range: { from: from ?? null, to: to ?? null },
  };
}

export async function buildCityReport(options = {}) {
  const { from, to } = options;
  const [barangays, allPatients] = await Promise.all([
    Barangay.find({}),
    Patient.find({ is_active: true }).select(
      "patient_id tb_case_number barangay_id barangay_name sex age treatment_phase " +
        "compliance.risk_level compliance.compliance_percentage treatment_outcome " +
        "escalation.level risk_score.score date_started patient_type bacteriological_status classification",
    ),
  ]);

  const [allSnapshots, inventory] = await Promise.all([
    ComplianceSnapshot.find({
      period: "monthly",
      ...buildDateRange(from, to, "snapshot_date"),
    })
      .sort({ snapshot_date: 1, barangay_id: 1 })
      .select(
        "barangay_id barangay_name snapshot_date compliance_percentage compliant_count at_risk_count defaulter_count average_risk_score",
      ),
    Inventory.find({}).select(
      "barangay_id drug_name strength remaining_stock stock_status",
    ),
  ]);

  return {
    generated_at: new Date(),
    report_type: "city",
    city: "Pasig City",
    total_active_patients: allPatients.length,
    risk_summary: aggregateRiskLevels(allPatients),
    treatment_outcomes: aggregateOutcomes(allPatients),
    classification_breakdown: allPatients.reduce(
      (acc, p) => {
        if (p.classification === "Pulmonary") acc.pulmonary++;
        else acc.extra_pulmonary++;
        return acc;
      },
      { pulmonary: 0, extra_pulmonary: 0 },
    ),
    bacteriological_breakdown: allPatients.reduce(
      (acc, p) => {
        if (p.bacteriological_status === "Bacteriologically Confirmed")
          acc.bacteriologically_confirmed++;
        else acc.clinically_diagnosed++;
        return acc;
      },
      { bacteriologically_confirmed: 0, clinically_diagnosed: 0 },
    ),
    patient_type_breakdown: allPatients.reduce(
      (acc, p) => {
        if (p.patient_type?.is_new) acc.new_cases++;
        if (p.patient_type?.is_retreatment) acc.retreatment++;
        if (p.patient_type?.is_drug_resistant) acc.drug_resistant++;
        return acc;
      },
      { new_cases: 0, retreatment: 0, drug_resistant: 0 },
    ),
    barangay_breakdown: barangays.map((brgy) => {
      const brgyPatients = allPatients.filter(
        (p) => p.barangay_id === brgy.barangay_id,
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
    }),
    compliance_snapshots: allSnapshots,
    critical_stock_items: inventory.filter(
      (i) => i.stock_status === "Critical" || i.stock_status === "Stockout",
    ),
    date_range: { from: from ?? null, to: to ?? null },
  };
}

export async function getComplianceTrend(barangayId, period = "monthly", from, to, limit = 30) {
  const filter = { period };
  if (barangayId) filter.barangay_id = barangayId;
  if (from || to) {
    filter.snapshot_date = {};
    if (from) filter.snapshot_date.$gte = new Date(from);
    if (to) filter.snapshot_date.$lte = new Date(to);
  }

  const snapshots = await HeatmapSnapshot.find(filter)
    .sort({ snapshot_date: -1 })
    .limit(limit)
    .select("barangay_id barangay_name snapshot_date compliance_rate at_risk_count defaulter_count active_cases");

  return snapshots.reverse();
}

export async function buildInventoryReport(barangayId) {
  const filter = {};
  if (barangayId) filter.barangay_id = barangayId;
  const inventory = await Inventory.find(filter).sort({
    barangay_id: 1,
    drug_name: 1,
  });

  const grouped = inventory.reduce((acc, item) => {
    if (!acc[item.barangay_id])
      acc[item.barangay_id] = {
        barangay_id: item.barangay_id,
        health_center_id: item.health_center_id,
        drugs: [],
      };
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
      estimated_days_remaining:
        item.active_patients_on_this_drug > 0
          ? Math.floor(item.remaining_stock / item.active_patients_on_this_drug)
          : null,
      expiry_date: item.expiry_date,
      last_dispensed_at: item.last_dispensed_at,
    });
    
    return acc;
  }, {});

    const barangayIds = Object.keys(grouped);
  const barangayDocs = await Barangay.find({ barangay_id: { $in: barangayIds } }).select('barangay_id name');
  const nameMap = Object.fromEntries(barangayDocs.map((b) => [b.barangay_id, b.name]));

  Object.values(grouped).forEach((group) => {
    group.barangay_name = nameMap[group.barangay_id] || group.barangay_id;
  });


  return {
    generated_at: new Date(),
    report_type: "inventory",
    barangay_id: barangayId ?? "all",
    grouped_by_barangay: Object.values(grouped),
    critical_items: inventory.filter(
      (i) => i.stock_status === "Critical" || i.stock_status === "Stockout",
    ),
    total_records: inventory.length,
  };
}

export const exportInventoryReportPdf = async ({ barangay_id } = {}) => {
  const params = new URLSearchParams();
  if (barangay_id) params.set('barangay_id', barangay_id);
  params.set('format', 'pdf');

  const res = await fetch(`${BASE_URL}/api/reports/inventory?${params}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || `Export failed with status ${res.status}`);
  }

  return res.blob();
};

export async function buildTreatmentOutcomeReport(barangayId, year, from, to) {
  const allFilter = { ...(barangayId ? { barangay_id: barangayId } : {}) };
  if (from || to) {
    allFilter.date_started = {};
    if (from) allFilter.date_started.$gte = new Date(from);
    if (to) allFilter.date_started.$lte = new Date(to);
  } else if (year) {
    allFilter.date_started = {
      $gte: new Date(`${year}-01-01`),
      $lte: new Date(`${year}-12-31`),
    };
  }

  const patients = await Patient.find(allFilter).select(
    "patient_id tb_case_number full_name barangay_name treatment_phase " +
      "treatment_outcome date_started end_date compliance.compliance_percentage patient_type classification bacteriological_status",
  );

  const outcomeSummary = aggregateOutcomes(patients);
  const total = patients.length;

  return {
    generated_at: new Date(),
    report_type: "treatment_outcome",
    barangay_id: barangayId ?? "all",
    year: year ?? "all",
    date_range: { from: from ?? null, to: to ?? null },
    total_patients: total,
    outcome_summary: Object.fromEntries(
      Object.entries(outcomeSummary).map(([k, v]) => [
        k,
        {
          count: v,
          percentage:
            total > 0 ? parseFloat(((v / total) * 100).toFixed(2)) : 0,
        },
      ]),
    ),
    patients_by_outcome: patients.reduce((acc, p) => {
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
    }, {}),
  };
}


