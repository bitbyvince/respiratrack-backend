import mongoose from "mongoose";
import DispensingRecord from "../../models/DispensingRecord.model.js";
import Patient from "../../models/Patient.model.js";
import Inventory from "../../models/Inventory.model.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDateRange(from, to) {
  const query = {};

  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      query.$gte = start;
    }
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

async function generateDispenseId(session) {
  const count = await DispensingRecord.countDocuments({}).session(session);
  return `DISP-${String(count + 1).padStart(4, "0")}`;
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function createDispensingRecord(data, user) {
  const { patient_id, days_supplied, dispense_date, medicines, notes } = data;

  const patient = await Patient.findOne({ patient_id });
  if (!patient) throw new Error("Patient not found.");

  if (!medicines || medicines.length === 0) {
    throw new Error("Select at least one medicine to dispense.");
  }

  const dispensedDate = new Date(dispense_date);
  const dispensedAt = new Date();
  const records = [];

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const med of medicines) {
        const inventoryDoc = await Inventory.findOne({
          barangay_id: patient.barangay_id,
          drug_name: med.drug_name,
          strength: med.strength,
        }).session(session);

        if (!inventoryDoc) {
          throw new Error(
            `${med.drug_name} ${med.strength} is not in this barangay's inventory.`
          );
        }

        if (inventoryDoc.remaining_stock < med.quantity_dispensed) {
          throw new Error(
            `Not enough stock of ${med.drug_name} ${med.strength}. Only ${inventoryDoc.remaining_stock} ${inventoryDoc.unit}(s) remaining.`
          );
        }

        // Atomic check-and-decrement — the $gte guard protects against a race
        // condition with another dispense happening at the same moment.
        const updatedInventory = await Inventory.findOneAndUpdate(
          {
            inventory_id: inventoryDoc.inventory_id,
            remaining_stock: { $gte: med.quantity_dispensed },
          },
          {
            $inc: {
              remaining_stock: -med.quantity_dispensed,
              total_dispensed: med.quantity_dispensed,
            },
            $set: { last_dispensed_at: dispensedAt, last_updated_at: dispensedAt },
          },
          { new: true, session }
        );

        if (!updatedInventory) {
          throw new Error(
            `Not enough stock of ${med.drug_name} ${med.strength} to complete this dispense.`
          );
        }

        const dispenseId = await generateDispenseId(session);

        const [record] = await DispensingRecord.create(
          [
            {
              dispense_id: dispenseId,
              patient_id,
              tb_case_number: patient.tb_case_number,
              barangay_id: patient.barangay_id,
              dispensed_by: user.user_id,
              drug_name: med.drug_name,
              strength: med.strength,
              unit: inventoryDoc.unit,
              quantity_dispensed: med.quantity_dispensed,
              days_supplied,
              dispense_date: dispensedDate,
              dispensed_at: dispensedAt,
              notes: notes || "",
            },
          ],
          { session }
        );

        records.push(record);
      }
    });
  } finally {
    session.endSession();
  }

  return records;
}

export async function getActivePatientsForDispensing(barangayId) {
  const match = { "treatment_outcome.status": "On Treatment" };
  if (barangayId) match.barangay_id = barangayId;

  const patients = await Patient.find(match).select(
    "patient_id full_name regimen_type tb_case_number drug_regimen barangay_id barangay_name"
  );

  const today = new Date();

  const summaries = await Promise.all(
    patients.map(async (patient) => {
      const lastRecord = await DispensingRecord.findOne({
        patient_id: patient.patient_id,
      }).sort({ dispense_date: -1 });

      const base = {
        patient_id: patient.patient_id,
        full_name: patient.full_name,
        regimen_type: patient.regimen_type,
        tb_case_number: patient.tb_case_number,
        drug_regimen: patient.drug_regimen,
        barangay_id: patient.barangay_id,
        barangay_name: patient.barangay_name,
      };

      if (!lastRecord) {
        return {
          ...base,
          last_dispensed_date: null,
          days_supplied: null,
          next_pickup_due: null,
          remaining_days: null,
          status: "New",
        };
      }

      const nextPickupDue = new Date(lastRecord.dispense_date);
      nextPickupDue.setDate(nextPickupDue.getDate() + lastRecord.days_supplied);

      const remainingDays = Math.ceil(
        (nextPickupDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      let status = "Normal";
      if (remainingDays < 0) status = "Critical";
      else if (remainingDays <= 2) status = "Low";

      return {
        ...base,
        last_dispensed_date: lastRecord.dispense_date,
        days_supplied: lastRecord.days_supplied,
        next_pickup_due: nextPickupDue,
        remaining_days: remainingDays,
        status,
      };
    })
  );

  return summaries;
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