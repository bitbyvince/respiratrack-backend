import BarangayModule from "../../models/Barangay.model.js";
import Patient from "../../models/Patient.model.js";

const Barangay = BarangayModule.default || BarangayModule;

// ── Compute real stats from patients collection ────────────
const computeBarangayStats = async (barangayId) => {
  const [total_patients, at_risk_count, defaulter_count, compliant_count, level_1, level_2, level_3] = await Promise.all([
    Patient.countDocuments({ barangay_id: barangayId, is_active: true }),
    Patient.countDocuments({ barangay_id: barangayId, is_active: true, 'compliance.risk_level': 'At Risk' }),
    Patient.countDocuments({ barangay_id: barangayId, is_active: true, 'compliance.risk_level': 'Defaulter' }),
    Patient.countDocuments({ barangay_id: barangayId, is_active: true, 'compliance.risk_level': 'Compliant' }),
    Patient.countDocuments({ barangay_id: barangayId, is_active: true, 'escalation.level': 1 }),
    Patient.countDocuments({ barangay_id: barangayId, is_active: true, 'escalation.level': 2 }),
    Patient.countDocuments({ barangay_id: barangayId, is_active: true, 'escalation.level': 3 }),
  ]);

  const compliance_percentage = total_patients > 0
    ? parseFloat(((compliant_count / total_patients) * 100).toFixed(2))
    : 0;

  return {
    total_patients,
    at_risk_count,
    defaulter_count,
    compliant_count,
    compliance_percentage,
    escalation_counts: { level_1, level_2, level_3 },
  };
};

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
      .sort({ barangay_id: 1 })
      .skip(skip)
      .limit(parsedLimit),
    Barangay.countDocuments(query),
  ]);

  // Attach real computed stats to each barangay
  const barangaysWithStats = await Promise.all(
    barangays.map(async (b) => {
      const liveStats = await computeBarangayStats(b.barangay_id);
      const obj = b.toObject();
      obj.stats = {
        ...obj.stats,
        ...liveStats,
      };
      return obj;
    })
  );

  return { barangays: barangaysWithStats, total, page: parsedPage, limit: parsedLimit };
}

export async function getBarangay(barangayId) {
  const barangay = await Barangay.findOne({ barangay_id: barangayId });
  if (!barangay) {
    throw new Error("Barangay not found.");
  }

  const liveStats = await computeBarangayStats(barangayId);
  const obj = barangay.toObject();
  obj.stats = { ...obj.stats, ...liveStats };
  return obj;
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

