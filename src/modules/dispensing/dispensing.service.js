import DispensingRecord from "../../models/DispensingRecord.model.js";
import Patient from "../../models/Patient.model.js";
import Inventory from "../../models/Inventory.model.js";

function normalizeDateRange(from, to) {
  const query = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) query.$gte = start;
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setUTCHours(23, 59, 59, 999);
      query.$lte = end;
    }
  }
  return Object.keys(query).length ? query : null;
}

function buildQuery(filters = {}) {
  const query = {};
  if (filters.patient_id) query.patient_id = filters.patient_id;
  if (filters.barangay_id) query.barangay_id = filters.barangay_id;
  if (filters.drug_name) query.drug_name = filters.drug_name;
  const dateRange = normalizeDateRange(filters.from_date, filters.to_date);
  if (dateRange) query.dispense_date = dateRange;
  return query;
}

async function generateRecordId() {
  const count = await DispensingRecord.countDocuments();
  return `DISP-${String(count + 1).padStart(4, "0")}`;
}

export async function createDispensingRecord(data, user) {
  const {
    patient_id,
    inventory_id,
    drug_name,
    strength,
    unit,
    quantity_dispensed,
    dispense_date,
    dispense_id,
    dispensed_by,
    notes,
  } = data;

  const patient = await Patient.findOne({ patient_id });
  if (!patient) throw new Error("Patient not found.");
  if (!patient.tb_case_number) throw new Error("Patient is missing tb_case_number.");
  if (!patient.barangay_id) throw new Error("Patient is missing barangay_id.");

  const recordId = dispense_id?.trim() || (await generateRecordId());

  const record = await DispensingRecord.create({
    dispense_id: recordId,
    patient_id,
    tb_case_number: patient.tb_case_number,
    barangay_id: patient.barangay_id,
    health_center_id: patient.health_center_id || null,
    drug_name,
    strength,
    unit: unit || "tablet",
    quantity_dispensed,
    dispense_date: new Date(dispense_date),
    dispensed_at: new Date(),
    dispensed_by,
    notes: notes || "",
    created_by: user?.user_id ?? null,
  });

  if (inventory_id) {
    await Inventory.findOneAndUpdate(
      { inventory_id },
      {
        $inc: {
          total_dispensed: quantity_dispensed,
          remaining_stock: -quantity_dispensed,
        },
        last_dispensed_at: new Date(),
        last_updated_at: new Date(),
      }
    );
  }

  return record;
}

export async function getDispensingRecords(filters, { page = 1, limit = 20 }) {
  const query = buildQuery(filters);
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [records, total] = await Promise.all([
    DispensingRecord.find(query).sort({ dispense_date: -1 }).skip(skip).limit(parsedLimit),
    DispensingRecord.countDocuments(query),
  ]);

  return { records, total, page: parsedPage, limit: parsedLimit };
}

export async function getDispensingRecord(recordId) {
  const record = await DispensingRecord.findOne({ dispense_id: recordId });
  if (!record) throw new Error("Dispensing record not found.");
  return record;
}

export async function getPatientDispensingRecords(patientId, filters = {}, { page = 1, limit = 20 }) {
  const query = buildQuery({ ...filters, patient_id: patientId });
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [records, total] = await Promise.all([
    DispensingRecord.find(query).sort({ dispense_date: -1 }).skip(skip).limit(parsedLimit),
    DispensingRecord.countDocuments(query),
  ]);

  return { records, total, page: parsedPage, limit: parsedLimit };
}

export async function getBarangayDispensingRecords(barangayId, filters = {}, { page = 1, limit = 20 }) {
  const query = buildQuery({ ...filters, barangay_id: barangayId });
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [records, total] = await Promise.all([
    DispensingRecord.find(query).sort({ dispense_date: -1 }).skip(skip).limit(parsedLimit),
    DispensingRecord.countDocuments(query),
  ]);

  return { records, total, page: parsedPage, limit: parsedLimit };
}