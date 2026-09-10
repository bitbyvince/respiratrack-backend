import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import { PATC_FACILITY_NAME } from "../constants/roles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "../assets/pasig-seal.png");

const INK = "#1a1a2e";
const MUTED = "#666666";
const FAINT = "#999999";
const RULE = "#cccccc";

// ── Document shell ────────────────────────────────────────────────────────

const buildPdfBuffer = (buildFn) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    buildFn(doc);
    addFooters(doc);
    doc.end();
  });
};

// Stamped on every page once the document is otherwise complete, so page
// counts are accurate even when content spills across several pages.
const addFooters = (doc) => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottomY = doc.page.height - doc.page.margins.bottom + 12;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    // Drawing inside the bottom margin normally makes PDFKit's text()
    // think the content overflows the page and silently start a new one —
    // temporarily lift the margin so the footer can live in that space.
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .moveTo(left, bottomY - 6)
      .lineTo(right, bottomY - 6)
      .strokeColor(RULE)
      .lineWidth(0.5)
      .stroke();
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor(FAINT)
      .text(
        "System-generated report — RespiraTrack TB Monitoring System, City of Pasig",
        left,
        bottomY,
        { width: right - left - 70, align: "left", lineBreak: false },
      );
    doc
      .fontSize(7)
      .fillColor(FAINT)
      .text(`Page ${i - range.start + 1} of ${range.count}`, right - 70, bottomY, {
        width: 70,
        align: "right",
        lineBreak: false,
      });

    doc.page.margins.bottom = originalBottomMargin;
  }
};

// ── Formal letterhead ────────────────────────────────────────────────────
// healthCenterName present  -> report is scoped to that health center.
// healthCenterName absent   -> report is municipal/city-wide.
const drawLetterhead = (doc, { reportTitle, healthCenterName, healthCenterAddress }) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const pageWidth = right - left;
  const logoWidth = 55;
  const startY = doc.y;

  try {
    doc.image(LOGO_PATH, left, startY, { width: logoWidth });
  } catch {
    // Logo is optional — a missing/unreadable asset shouldn't break report generation.
  }

  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor(MUTED)
    .text("Republic of the Philippines", left, startY, { width: pageWidth, align: "center" })
    .text("City of Pasig", left, doc.y, { width: pageWidth, align: "center" })
    .text("City Health Office — TB Monitoring Program", left, doc.y, { width: pageWidth, align: "center" });

  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .fillColor(INK)
    .text("RespiraTrack", left, doc.y + 2, { width: pageWidth, align: "center" });

  doc.y = Math.max(doc.y, startY + logoWidth) + 10;

  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(1.5).strokeColor(INK).stroke();
  doc.y += 2;
  doc.moveTo(left, doc.y).lineTo(right, doc.y).lineWidth(0.5).strokeColor(INK).stroke();
  doc.moveDown(0.8);

  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .fillColor(INK)
    .text(reportTitle.toUpperCase(), { align: "center" });

  if (healthCenterName) {
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#333333")
      .text(healthCenterName, { align: "center" });
    if (healthCenterAddress) {
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(FAINT)
        .text(healthCenterAddress, { align: "center" });
    }
  } else {
    doc
      .fontSize(9)
      .font("Helvetica-Oblique")
      .fillColor(FAINT)
      .text("Municipal-Wide Report — All Health Centers", { align: "center" });
  }

  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor(FAINT)
    .text(
      `Generated: ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
      { align: "center" },
    );

  doc.moveDown(1);
};

const drawSectionHeader = (doc, title) => {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
  doc
    .moveDown(0.4)
    .fontSize(11)
    .fillColor(INK)
    .font("Helvetica-Bold")
    .text(title.toUpperCase())
    .moveDown(0.2);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor(RULE)
    .lineWidth(0.5)
    .stroke()
    .moveDown(0.4);
};

const drawRow = (doc, label, value) => {
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor("#333333")
    .text(label, { continued: true, width: 200 })
    .font("Helvetica")
    .fillColor("#555555")
    .text(String(value ?? "—"));
};

// ── Table renderer ───────────────────────────────────────────────────────
// PDFKit has no built-in table support, so rows/columns are hand-drawn.
// `columnWidths` must sum to the usable page width (page width minus
// margins) for the grid lines to line up.
const drawTable = (doc, { headers, rows, columnWidths }) => {
  const left = doc.page.margins.left;
  const tableWidth = columnWidths.reduce((a, b) => a + b, 0);
  const headerHeight = 20;
  const rowHeight = 18;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  const drawHeaderRow = (y) => {
    doc.rect(left, y, tableWidth, headerHeight).fill(INK);
    let x = left;
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#ffffff");
    headers.forEach((h, i) => {
      doc.text(h, x + 4, y + 6, { width: columnWidths[i] - 6, height: headerHeight - 6, ellipsis: true });
      x += columnWidths[i];
    });
    return y + headerHeight;
  };

  let y = drawHeaderRow(doc.y);

  if (rows.length === 0) {
    doc.rect(left, y, tableWidth, rowHeight).stroke(RULE);
    doc
      .fontSize(8)
      .font("Helvetica-Oblique")
      .fillColor(FAINT)
      .text("No records found.", left + 4, y + 5, { width: tableWidth - 8 });
    y += rowHeight;
  }

  rows.forEach((row, rowIndex) => {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = drawHeaderRow(doc.page.margins.top);
    }
    if (rowIndex % 2 === 1) {
      doc.rect(left, y, tableWidth, rowHeight).fill("#f4f4f8");
    }
    let x = left;
    doc.fontSize(7.5).font("Helvetica").fillColor("#333333");
    row.forEach((cell, i) => {
      doc.text(String(cell ?? "—"), x + 4, y + 5, {
        width: columnWidths[i] - 6,
        height: rowHeight - 6,
        ellipsis: true,
      });
      x += columnWidths[i];
    });
    doc
      .moveTo(left, y + rowHeight)
      .lineTo(left + tableWidth, y + rowHeight)
      .strokeColor(RULE)
      .lineWidth(0.5)
      .stroke();
    y += rowHeight;
  });

  doc
    .rect(left, doc.y, tableWidth, y - doc.y)
    .strokeColor(RULE)
    .lineWidth(0.5)
    .stroke();

  doc.y = y + 12;
  doc.x = left;
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—");

// ================================================================
// SINGLE PATIENT PROFILE
// ================================================================
export const generatePatientPdf = async (patient) => {
  return buildPdfBuffer((doc) => {
    drawLetterhead(doc, {
      reportTitle: "Patient Profile Report",
      healthCenterName: patient.health_center_name,
    });

    drawSectionHeader(doc, "Patient Information");
    drawRow(doc, "Full Name:", patient.full_name);
    drawRow(doc, "TB Case Number:", patient.tb_case_number);
    drawRow(doc, "Patient ID:", patient.patient_id);
    drawRow(doc, "Date of Birth:", formatDate(patient.birth_date));
    drawRow(doc, "Age:", patient.age);
    drawRow(doc, "Sex:", patient.sex);
    drawRow(doc, "PhilHealth No.:", patient.philhealth_number);
    drawRow(doc, "Phone Number:", patient.phone_number);
    drawRow(doc, "Email:", patient.email);

    drawSectionHeader(doc, "Assignment");
    drawRow(doc, "Barangay:", patient.barangay_name);
    drawRow(doc, "Health Center:", patient.health_center_name);
    drawRow(doc, "Assigned Nurse ID:", patient.assigned_nurse_id);

    drawSectionHeader(doc, "Diagnosis & Treatment");
    drawRow(doc, "Diagnosis:", patient.diagnosis);
    drawRow(doc, "Date of Diagnosis:", formatDate(patient.date_of_diagnosis));
    drawRow(doc, "Classification:", patient.classification);
    drawRow(doc, "Bacteriological Status:", patient.bacteriological_status);
    drawRow(doc, "Treatment Phase:", patient.treatment_phase);
    drawRow(doc, "Regimen:", patient.regimen_type);
    drawRow(doc, "Date Started:", formatDate(patient.date_started));
    drawRow(doc, "End Date:", formatDate(patient.end_date));
    drawRow(doc, "DAT Support:", patient.dat_support);
    drawRow(doc, "Outcome Status:", patient.treatment_outcome?.status);

    drawSectionHeader(doc, "Drug Regimen");
    (patient.drug_regimen || []).forEach((drug, i) => {
      drawRow(
        doc,
        `Drug ${i + 1}:`,
        `${drug.drug_name}${drug.strength ? " " + drug.strength : ""} — ${drug.number_to_be_taken} ${drug.unit}(s)`,
      );
    });

    drawSectionHeader(doc, "Compliance Summary");
    drawRow(doc, "Total Doses Required:", patient.compliance?.total_doses_required);
    drawRow(doc, "Doses Taken:", patient.compliance?.doses_taken);
    drawRow(doc, "Doses Missed:", patient.compliance?.doses_missed);
    drawRow(doc, "Compliance %:", `${patient.compliance?.compliance_percentage ?? 0}%`);
    drawRow(doc, "Adherence:", patient.compliance?.adherence);
    drawRow(doc, "Risk Level:", patient.compliance?.risk_level);
    drawRow(doc, "Consecutive Missed:", patient.compliance?.consecutive_missed_doses);

    drawSectionHeader(doc, "Risk Score");
    drawRow(doc, "Score (0–100):", patient.risk_score?.score);
    drawRow(doc, "Last Computed:", formatDate(patient.risk_score?.last_computed));
  });
};

// ================================================================
// BARANGAY / HEALTH CENTER REPORT
// ================================================================
// A barangay can have more than one health center. If the requester
// belongs to one specific facility (options.healthCenterId), use that
// one on the letterhead; otherwise (e.g. a super admin/PATC pulling a
// whole-barangay report) list every facility name for that barangay.
const resolveHealthCenterLabel = (barangay, healthCenterId) => {
  const centers = barangay.health_centers || [];
  if (healthCenterId) {
    const match = centers.find((hc) => hc.health_center_id === healthCenterId);
    if (match) return { name: match.name, address: match.address, contact_number: match.contact_number };
  }
  if (centers.length === 1) {
    return { name: centers[0].name, address: centers[0].address, contact_number: centers[0].contact_number };
  }
  return {
    name: centers.map((hc) => hc.name).join(" / "),
    address: null,
    contact_number: centers.map((hc) => hc.contact_number).join(" / "),
  };
};

export const generateBarangayReportPdf = async (barangay, patients = [], options = {}) => {
  const healthCenter = resolveHealthCenterLabel(barangay, options.healthCenterId);

  return buildPdfBuffer((doc) => {
    drawLetterhead(doc, {
      reportTitle: "Health Center Compliance Report",
      healthCenterName: options.isPatc ? PATC_FACILITY_NAME : healthCenter.name,
      healthCenterAddress: healthCenter.address,
    });

    drawSectionHeader(doc, "Overview");
    drawRow(doc, "Barangay:", barangay.name);
    drawRow(doc, "Municipality:", barangay.municipality);
    drawRow(doc, "Contact:", healthCenter.contact_number);

    drawSectionHeader(doc, "Statistics");
    drawRow(doc, "Total Patients:", barangay.stats?.total_patients);
    drawRow(doc, "Active Patients:", barangay.stats?.active_patients);
    drawRow(doc, "Compliant:", barangay.stats?.compliant_count);
    drawRow(doc, "At Risk:", barangay.stats?.at_risk_count);
    drawRow(doc, "Defaulters:", barangay.stats?.defaulter_count);
    drawRow(doc, "Compliance %:", `${barangay.stats?.compliance_percentage ?? 0}%`);
    drawRow(doc, "Risk Level:", barangay.stats?.risk_level);

    drawSectionHeader(doc, `Patient List (${patients.length})`);
    drawTable(doc, {
      headers: ["#", "TB Case No.", "Name", "Age", "Sex", "Phase", "Risk Level", "Compliance %"],
      columnWidths: [18, 95, 120, 25, 32, 60, 65, 80],
      rows: patients.map((p, i) => [
        i + 1,
        p.tb_case_number,
        p.full_name,
        p.age,
        p.sex,
        p.treatment_phase,
        p.compliance?.risk_level ?? "—",
        `${p.compliance?.compliance_percentage ?? 0}%`,
      ]),
    });
  });
};

// ─── Aliases ──────────────────────────────────────────────────────────────

export const exportPatientListPdf = generatePatientPdf;
export const generatePatientPDF = generatePatientPdf;
export const generateBarangayPDF = generateBarangayReportPdf;

// ================================================================
// CITY-WIDE REPORT
// ================================================================
export const generateCityPDF = async (data, options = {}) =>
  buildPdfBuffer((doc) => {
    drawLetterhead(doc, {
      reportTitle: "Municipal Compliance Report",
      healthCenterName: options.isPatc ? PATC_FACILITY_NAME : null,
    });

    drawSectionHeader(doc, "Summary");
    drawRow(doc, "Total Active Patients:", data.total_active_patients);
    drawRow(doc, "Compliant:", data.risk_summary?.compliant);
    drawRow(doc, "At Risk:", data.risk_summary?.at_risk);
    drawRow(doc, "Defaulters:", data.risk_summary?.defaulter);

    drawSectionHeader(doc, `Barangay / Health Center Breakdown (${data.barangay_breakdown?.length ?? 0})`);
    drawTable(doc, {
      headers: ["Barangay", "Health Center", "Active", "Compliant", "At Risk", "Defaulter", "Compliance %", "Risk"],
      columnWidths: [70, 100, 45, 60, 55, 60, 65, 40],
      rows: (data.barangay_breakdown || []).map((brgy) => [
        brgy.name,
        brgy.health_center_name,
        brgy.total_active,
        brgy.risk_summary?.compliant ?? 0,
        brgy.risk_summary?.at_risk ?? 0,
        brgy.risk_summary?.defaulter ?? 0,
        `${brgy.compliance_percentage ?? 0}%`,
        brgy.risk_level,
      ]),
    });
  });

// ================================================================
// INVENTORY / STOCK REPORT
// ================================================================
export const generateInventoryPDF = async (data, options = {}) =>
  buildPdfBuffer((doc) => {
    const groups = data.grouped_by_barangay || [];
    const scoped = groups.length === 1 ? groups[0] : null;

    drawLetterhead(doc, {
      reportTitle: "Medicine Inventory Report",
      healthCenterName: scoped?.barangay_name ?? (options.isPatc ? PATC_FACILITY_NAME : null),
    });

    const drugColumnWidths = [90, 55, 60, 55, 55, 60, 55, 65];
    const drugHeaders = ["Drug", "Strength", "Unit", "Allocated", "Dispensed", "Remaining", "Status", "Expiry"];
    const drugRows = (drugs) =>
      (drugs || []).map((d) => [
        d.drug_name,
        d.strength || "—",
        d.unit,
        d.total_allocated,
        d.total_dispensed,
        d.remaining_stock,
        d.stock_status,
        formatDate(d.expiry_date),
      ]);

    if (scoped) {
      drawSectionHeader(doc, `Stock on Hand (${scoped.drugs?.length ?? 0} items)`);
      drawTable(doc, { headers: drugHeaders, columnWidths: drugColumnWidths, rows: drugRows(scoped.drugs) });
    } else {
      groups.forEach((brgy) => {
        drawSectionHeader(doc, `${brgy.barangay_name || brgy.barangay_id} (${brgy.drugs?.length ?? 0} items)`);
        drawTable(doc, { headers: drugHeaders, columnWidths: drugColumnWidths, rows: drugRows(brgy.drugs) });
      });
    }
  });

// ================================================================
// TREATMENT OUTCOME / DEFAULTER REPORT
// ================================================================
export const generateOutcomePDF = async (data, options = {}) =>
  buildPdfBuffer((doc) => {
    drawLetterhead(doc, {
      reportTitle: "Treatment Outcome Report",
      healthCenterName: data.health_center_name ?? (options.isPatc ? PATC_FACILITY_NAME : null),
    });

    if (data.year && data.year !== "all") {
      drawRow(doc, "Year:", data.year);
      doc.moveDown(0.5);
    }

    drawSectionHeader(doc, `Outcome Summary (${data.total_patients} patients)`);
    drawTable(doc, {
      headers: ["Status", "Count", "Percentage"],
      columnWidths: [300, 100, 95],
      rows: Object.entries(data.outcome_summary || {}).map(([status, v]) => [
        status,
        v.count,
        `${v.percentage}%`,
      ]),
    });

    const scoped = Boolean(data.barangay_name);
    Object.entries(data.patients_by_outcome || {}).forEach(([status, patients]) => {
      if (!patients.length) return;
      drawSectionHeader(doc, `${status} (${patients.length})`);
      const headers = scoped
        ? ["TB Case No.", "Name", "Classification", "Phase", "Started", "Compliance %"]
        : ["TB Case No.", "Name", "Barangay", "Classification", "Phase", "Compliance %"];
      const columnWidths = scoped
        ? [95, 120, 90, 60, 65, 65]
        : [95, 100, 65, 80, 55, 100];
      drawTable(doc, {
        headers,
        columnWidths,
        rows: patients.map((p) =>
          scoped
            ? [p.tb_case_number, p.full_name, p.classification, p.treatment_phase, formatDate(p.date_started), `${p.compliance_percentage ?? 0}%`]
            : [p.tb_case_number, p.full_name, p.barangay_name, p.classification, p.treatment_phase, `${p.compliance_percentage ?? 0}%`],
        ),
      });
    });
  });

// ================================================================
// PATIENT LIST (all patients or filtered by barangay/health center)
// ================================================================
export const generatePatientListPdf = async (patients = [], options = {}) => {
  const { barangayName, healthCenterName, isPatc } = options;
  const scoped = Boolean(healthCenterName || barangayName);

  return buildPdfBuffer((doc) => {
    drawLetterhead(doc, {
      reportTitle: "Patient List Report",
      healthCenterName: healthCenterName ?? (isPatc ? PATC_FACILITY_NAME : null),
    });

    drawSectionHeader(doc, `Patients (${patients.length})`);

    const headers = scoped
      ? ["#", "TB Case No.", "Name", "Age", "Sex", "Risk Level", "Compliance %"]
      : ["#", "TB Case No.", "Name", "Age", "Sex", "Barangay", "Risk Level", "Compliance %"];
    const columnWidths = scoped
      ? [24, 95, 156, 30, 40, 75, 75]
      : [24, 95, 109, 25, 32, 80, 65, 65];

    drawTable(doc, {
      headers,
      columnWidths,
      rows: patients.map((p, i) =>
        scoped
          ? [i + 1, p.tb_case_number, p.full_name, p.age, p.sex, p.compliance?.risk_level ?? "—", `${p.compliance?.compliance_percentage ?? 0}%`]
          : [i + 1, p.tb_case_number, p.full_name, p.age, p.sex, p.barangay_name ?? p.barangay_id, p.compliance?.risk_level ?? "—", `${p.compliance?.compliance_percentage ?? 0}%`],
      ),
    });
  });
};

const SEVERITY_LABEL = { 1: "Mild", 2: "Moderate", 3: "Severe" };

export const generateSymptomLogsPdf = async (logs = [], options = {}) => {
  const { barangayName, healthCenterName, isPatc } = options;
  const scoped = Boolean(healthCenterName || barangayName);

  return buildPdfBuffer((doc) => {
    drawLetterhead(doc, {
      reportTitle: "Symptom Log Report",
      healthCenterName: healthCenterName ?? (isPatc ? PATC_FACILITY_NAME : null),
    });

    drawSectionHeader(doc, `Symptom Logs (${logs.length})`);

    const symptomsText = (log) =>
      (log.symptoms || [])
        .map((s) => `${s.symptom} (${SEVERITY_LABEL[s.severity] ?? s.severity})`)
        .join(", ");

    const headers = scoped
      ? ["#", "TB Case No.", "Patient", "Symptoms", "Date", "Status"]
      : ["#", "TB Case No.", "Patient", "Barangay", "Symptoms", "Date", "Status"];
    const columnWidths = scoped
      ? [22, 100, 120, 156, 55, 42]
      : [24, 95, 95, 65, 134, 45, 37];

    drawTable(doc, {
      headers,
      columnWidths,
      rows: logs.map((log, i) =>
        scoped
          ? [
              i + 1,
              log.tb_case_number,
              log.patient_name ?? log.patient_id,
              symptomsText(log),
              formatDate(log.logged_at),
              log.reviewed_by ? "Reviewed" : "Pending",
            ]
          : [
              i + 1,
              log.tb_case_number,
              log.patient_name ?? log.patient_id,
              log.barangay_name ?? log.barangay_id,
              symptomsText(log),
              formatDate(log.logged_at),
              log.reviewed_by ? "Reviewed" : "Pending",
            ],
      ),
    });
  });
};
