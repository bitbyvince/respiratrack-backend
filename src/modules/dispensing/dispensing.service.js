const DispensingRecord = require("../../models/DispensingRecord.model");
const Patient = require("../../models/Patient.model");

const normalizeDateRange = (from, to) => {
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
};

const buildQuery = (filters = {}) => {
  const query = {};

  if (filters.patient_id) query.patient_id = filters.patient_id;
  if (filters.barangay_id) query.barangay_id = filters.barangay_id;
  if (filters.medication_name) query.medication_name = filters.medication_name;

  const dateRange = normalizeDateRange(filters.from_date, filters.to_date);
  if (dateRange) query.dispensed_date = dateRange;

  return query;
};

const generateRecordId = async () => {
  const count = await DispensingRecord.countDocuments();
  return `DISP-${String(count + 1).padStart(4, "0")}`;
};

exports.createDispensingRecord = async (data, user) => {
  const {
    patient_id,
    medication_name,
    dosage,
    quantity,
    dispensed_date,
    dispensed_by,
    notes,
  } = data;

  const patient = await Patient.findOne({ patient_id });
  if (!patient) {
    throw new Error("Patient not found.");
  }

  const recordId = await generateRecordId();
  const dispensedDate = new Date(dispensed_date);

  const record = await DispensingRecord.create({
    record_id: recordId,
    patient_id,
    tb_case_number: patient.tb_case_number || null,
    barangay_id: patient.barangay_id || null,
    health_center_id: patient.health_center_id || null,
    medication_name,
    dosage: dosage || "",
    quantity,
    dispensed_date: dispensedDate,
    dispensed_by,
    notes: notes || "",
    created_at: new Date(),
    updated_at: new Date(),
    created_by: user && user.user_id ? user.user_id : null,
  });

  return record;
};

exports.getDispensingRecords = async (filters, { page = 1, limit = 20 }) => {
  const query = buildQuery(filters);
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [records, total] = await Promise.all([
    DispensingRecord.find(query)
      .sort({ dispensed_date: -1 })
      .skip(skip)
      .limit(parsedLimit),
    DispensingRecord.countDocuments(query),
  ]);

  return { records, total, page: parsedPage, limit: parsedLimit };
};

exports.getDispensingRecord = async (recordId) => {
  const record = await DispensingRecord.findOne({ record_id: recordId });
  if (!record) {
    throw new Error("Dispensing record not found.");
  }
  return record;
};

exports.getPatientDispensingRecords = async (
  patientId,
  filters = {},
  { page = 1, limit = 20 },
) => {
  const query = buildQuery({ ...filters, patient_id: patientId });
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [records, total] = await Promise.all([
    DispensingRecord.find(query)
      .sort({ dispensed_date: -1 })
      .skip(skip)
      .limit(parsedLimit),
    DispensingRecord.countDocuments(query),
  ]);

  return { records, total, page: parsedPage, limit: parsedLimit };
};

exports.getBarangayDispensingRecords = async (
  barangayId,
  filters = {},
  { page = 1, limit = 20 },
) => {
  const query = buildQuery({ ...filters, barangay_id: barangayId });
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [records, total] = await Promise.all([
    DispensingRecord.find(query)
      .sort({ dispensed_date: -1 })
      .skip(skip)
      .limit(parsedLimit),
    DispensingRecord.countDocuments(query),
  ]);

  return { records, total, page: parsedPage, limit: parsedLimit };
};
