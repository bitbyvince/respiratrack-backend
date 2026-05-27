import BarangayModule from "../../models/Barangay.model.js";

// Handles both default and named exports from the model
const Barangay = BarangayModule.default || BarangayModule;

export async function createBarangay(data) {
  const existing = await Barangay.findOne({ barangay_id: data.barangay_id });
  if (existing) {
    throw new Error("Barangay ID already exists.");
  }

  return Barangay.create(data);
}

export async function getBarangays(filters, { page = 1, limit = 20 }) {
  const query = {};

  if (filters.barangay_id) query.barangay_id = filters.barangay_id;
  if (filters.name) query.name = new RegExp(filters.name, "i");
  if (filters.municipality) query.municipality = filters.municipality;
  if (filters.province) query.province = filters.province;
  if (typeof filters.is_active !== "undefined") query.is_active = filters.is_active;
  if (filters.risk_level) query["stats.risk_level"] = filters.risk_level;

  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const [barangays, total] = await Promise.all([
    Barangay.find(query)
      .sort({ "stats.compliance_percentage": 1, barangay_id: 1 })
      .skip(skip)
      .limit(parsedLimit),
    Barangay.countDocuments(query),
  ]);

  return { barangays, total, page: parsedPage, limit: parsedLimit };
}

export async function getBarangay(barangayId) {
  const barangay = await Barangay.findOne({ barangay_id: barangayId });
  if (!barangay) {
    throw new Error("Barangay not found.");
  }
  return barangay;
}

export async function updateBarangay(barangayId, data) {
  const barangay = await Barangay.findOneAndUpdate(
    { barangay_id: barangayId },
    { $set: data, updated_at: new Date() },
    { new: true }
  );

  if (!barangay) {
    throw new Error("Barangay not found.");
  }

  return barangay;
}