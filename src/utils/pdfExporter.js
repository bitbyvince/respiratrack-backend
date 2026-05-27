import PDFDocument from "pdfkit";

const buildPdfBuffer = (buildFn) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    buildFn(doc);
    doc.end();
  });
};

const drawSectionHeader = (doc, title) => {
  doc
    .moveDown(0.5)
    .fontSize(11)
    .fillColor("#1a1a2e")
    .font("Helvetica-Bold")
    .text(title.toUpperCase())
    .moveDown(0.2);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#cccccc")
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

const drawPageHeader = (doc, title) => {
  doc
    .fontSize(16)
    .font("Helvetica-Bold")
    .fillColor("#1a1a2e")
    .text("TB Monitoring System — Pasig City", { align: "center" })
    .fontSize(12)
    .fillColor("#444444")
    .text(title, { align: "center" })
    .moveDown(0.5)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor("#1a1a2e")
    .lineWidth(1)
    .stroke()
    .moveDown(1);
};

export const generatePatientPdf = async (patient) => {
  return buildPdfBuffer((doc) => {
    drawPageHeader(doc, "Patient Profile Report");

    drawSectionHeader(doc, "Patient Information");
    drawRow(doc, "Full Name:", patient.full_name);
    drawRow(doc, "TB Case Number:", patient.tb_case_number);
    drawRow(doc, "Patient ID:", patient.patient_id);
    drawRow(doc, "Date of Birth:", patient.birth_date?.toDateString());
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
    drawRow(
      doc,
      "Date of Diagnosis:",
      patient.date_of_diagnosis?.toDateString(),
    );
    drawRow(doc, "Classification:", patient.classification);
    drawRow(doc, "Bacteriological Status:", patient.bacteriological_status);
    drawRow(doc, "Treatment Phase:", patient.treatment_phase);
    drawRow(doc, "Regimen:", patient.regimen_type);
    drawRow(doc, "Date Started:", patient.date_started?.toDateString());
    drawRow(doc, "End Date:", patient.end_date?.toDateString());
    drawRow(doc, "DAT Support:", patient.dat_support);
    drawRow(doc, "Outcome Status:", patient.treatment_outcome?.status);

    drawSectionHeader(doc, "Drug Regimen");
    (patient.drug_regimen || []).forEach((drug, i) => {
      drawRow(
        doc,
        `Drug ${i + 1}:`,
        `${drug.drug_name} ${drug.strength} — ${drug.number_to_be_taken} ${drug.unit}(s)`,
      );
    });

    drawSectionHeader(doc, "Compliance Summary");
    drawRow(
      doc,
      "Total Doses Required:",
      patient.compliance?.total_doses_required,
    );
    drawRow(doc, "Doses Taken:", patient.compliance?.doses_taken);
    drawRow(doc, "Doses Missed:", patient.compliance?.doses_missed);
    drawRow(
      doc,
      "Compliance %:",
      `${patient.compliance?.compliance_percentage}%`,
    );
    drawRow(doc, "Adherence:", patient.compliance?.adherence);
    drawRow(doc, "Risk Level:", patient.compliance?.risk_level);
    drawRow(
      doc,
      "Consecutive Missed:",
      patient.compliance?.consecutive_missed_doses,
    );

    drawSectionHeader(doc, "Risk Score");
    drawRow(doc, "Score (0–100):", patient.risk_score?.score);
    drawRow(
      doc,
      "Last Computed:",
      patient.risk_score?.last_computed?.toDateString(),
    );

    doc
      .moveDown(2)
      .fontSize(8)
      .fillColor("#aaaaaa")
      .text(
        `Generated on ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
        { align: "right" },
      );
  });
};

export const generateBarangayReportPdf = async (barangay, patients = []) => {
  return buildPdfBuffer((doc) => {
    drawPageHeader(doc, `Barangay Report — ${barangay.name}`);

    drawSectionHeader(doc, "Barangay Overview");
    drawRow(doc, "Barangay:", barangay.name);
    drawRow(doc, "Municipality:", barangay.municipality);
    drawRow(doc, "Health Center:", barangay.health_center?.name);
    drawRow(doc, "Contact:", barangay.health_center?.contact_number);

    drawSectionHeader(doc, "Statistics");
    drawRow(doc, "Total Patients:", barangay.stats?.total_patients);
    drawRow(doc, "Active Patients:", barangay.stats?.active_patients);
    drawRow(doc, "Compliant:", barangay.stats?.compliant_count);
    drawRow(doc, "At Risk:", barangay.stats?.at_risk_count);
    drawRow(doc, "Defaulters:", barangay.stats?.defaulter_count);
    drawRow(doc, "Compliance %:", `${barangay.stats?.compliance_percentage}%`);
    drawRow(doc, "Risk Level:", barangay.stats?.risk_level);

    drawSectionHeader(doc, "Patient List");
    patients.forEach((p, i) => {
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#333333")
        .text(`${i + 1}. ${p.full_name} (${p.tb_case_number})`, {
          continued: true,
        })
        .font("Helvetica")
        .fillColor("#777777")
        .text(
          `  — ${p.compliance?.risk_level} | ${p.compliance?.compliance_percentage}%`,
        );
    });

    doc
      .moveDown(2)
      .fontSize(8)
      .fillColor("#aaaaaa")
      .text(
        `Generated on ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`,
        { align: "right" },
      );
  });
};
