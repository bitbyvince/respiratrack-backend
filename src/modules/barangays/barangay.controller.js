import * as service from "./barangay.service.js";

export async function createBarangay(req, res) {
  try {
    const barangay = await service.createBarangay(req.body);
    return res.status(201).json({
      success: true,
      message: "Barangay created.",
      barangay,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to create barangay.",
    });
  }
}

export async function getBarangays(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      barangay_id,
      name,
      municipality,
      province,
      risk_level,
      is_active,
      include_stats,
    } = req.query;

    const activeFilter = typeof is_active !== "undefined" ? is_active === "true" : undefined;
    const queryFilters = {
      barangay_id, name, municipality, province, risk_level,
      is_active: activeFilter,
      includeStats: include_stats === "true",
    };

    const result = await service.getBarangays(queryFilters, { page, limit });
    return res.status(200).json({
      success: true,
      message: "Barangay list retrieved.",
      ...result,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to retrieve barangays.",
    });
  }
}

export async function getBarangay(req, res) {
  try {
    const { barangayId } = req.params;
    const barangay = await service.getBarangay(barangayId);
    return res.status(200).json({
      success: true,
      message: "Barangay retrieved.",
      barangay,
    });
  } catch (err) {
    return res.status(404).json({
      success: false,
      message: err.message || "Barangay not found.",
    });
  }
}

export async function addHealthCenter(req, res) {
  try {
    const { barangayId } = req.params;
    const barangay = await service.addHealthCenter(barangayId, req.body);
    return res.status(201).json({
      success: true,
      message: "Health center added.",
      barangay,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to add health center.",
    });
  }
}

export async function updateBarangay(req, res) {
  try {
    const { barangayId } = req.params;
    const barangay = await service.updateBarangay(barangayId, req.body);
    return res.status(200).json({
      success: true,
      message: "Barangay updated.",
      barangay,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to update barangay.",
    });
  }
}