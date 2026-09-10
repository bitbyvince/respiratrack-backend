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

// ── GENERATE SEQUENTIAL BARANGAY ID ─────────────────────
// "BRG-XXX" format, matching existing seed data (BRG-001, BRG-002, ...)
const generateBarangayId = async () => {
  const latest = await Barangay.findOne(
    { barangay_id: { $regex: "^BRG-" } },
    { barangay_id: 1 }
  ).sort({ barangay_id: -1 });

  if (!latest) return "BRG-001";
  const num = parseInt(latest.barangay_id.split("-")[1], 10);
  return `BRG-${String(num + 1).padStart(3, "0")}`;
};

export async function createBarangay(data) {
  const barangay_id = await generateBarangayId();

  const health_centers = [];
  for (const hc of data.health_centers) {
    health_centers.push({
      ...hc,
      health_center_id: hc.health_center_id || (await generateHealthCenterId()),
    });
  }

  return Barangay.create({ ...data, barangay_id, health_centers });
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

  // Live stats cost 7 Patient.countDocuments() queries PER barangay —
  // real work against Atlas, not something an ETag/304 can shortcut.
  // Most callers (dropdowns, transfer targets, patient forms) only
  // need id/name/health_centers, so this is opt-in via include_stats
  // instead of always paying for every barangay's stats on every call.
  const barangaysWithStats = filters.includeStats
    ? await Promise.all(
        barangays.map(async (b) => {
          const liveStats = await computeBarangayStats(b.barangay_id);
          const obj = b.toObject();
          obj.stats = {
            ...obj.stats,
            ...liveStats,
          };
          return obj;
        })
      )
    : barangays.map((b) => b.toObject());

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

// ── GENERATE SEQUENTIAL HEALTH CENTER ID ────────────────────
// "HC-XXX" format, matching existing seed data (HC-001, HC-002, ...).
// Scanned across ALL barangays' health_centers arrays, since IDs
// must be unique city-wide, not just within one barangay.
const generateHealthCenterId = async () => {
  const barangays = await Barangay.find(
    {},
    { "health_centers.health_center_id": 1 }
  ).lean();

  const nums = barangays
    .flatMap((b) => b.health_centers || [])
    .map((hc) => parseInt(hc.health_center_id?.split("-")[1], 10))
    .filter((n) => !isNaN(n));

  const max = nums.length ? Math.max(...nums) : 0;
  return `HC-${String(max + 1).padStart(3, "0")}`;
};

// Adds one more health center to an existing barangay, rather than
// creating a brand-new barangay — used when a barangay already has
// one health center and needs another (e.g. a Super Health Center).
export async function addHealthCenter(barangayId, healthCenterData) {
  const health_center_id =
    healthCenterData.health_center_id || (await generateHealthCenterId());

  const barangay = await Barangay.findOneAndUpdate(
    { barangay_id: barangayId },
    {
      $push: { health_centers: { ...healthCenterData, health_center_id } },
      $set: { updated_at: new Date() },
    },
    { new: true }
  );

  if (!barangay) {
    throw new Error("Barangay not found.");
  }

  return barangay;
}

