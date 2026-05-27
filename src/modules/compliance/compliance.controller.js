const service = require("./compliance.service");

exports.getComplianceSnapshots = async (req, res) => {
  try {
    const { page = 1, limit = 20, barangay_id, period, snapshot_date } = req.query;
    const result = await service.getComplianceSnapshots(
      { barangay_id, period, snapshot_date },
      { page, limit },
    );

    return res.status(200).json({
      success: true,
      message: "Compliance snapshots retrieved.",
      ...result,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to retrieve compliance snapshots.",
    });
  }
};

exports.getLatestSnapshots = async (req, res) => {
  try {
    const { period } = req.query;
    const snapshots = await service.getLatestSnapshots({ period });

    return res.status(200).json({
      success: true,
      message: "Latest compliance snapshots retrieved.",
      snapshots,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to retrieve latest snapshots.",
    });
  }
};

exports.getBarangaySnapshot = async (req, res) => {
  try {
    const { barangayId } = req.params;
    const { period } = req.query;
    const snapshot = await service.getBarangaySnapshot(barangayId, { period });

    return res.status(200).json({
      success: true,
      message: "Barangay compliance snapshot retrieved.",
      snapshot,
    });
  } catch (err) {
    return res.status(404).json({
      success: false,
      message: err.message || "Snapshot not found.",
    });
  }
};

exports.getComplianceSummary = async (req, res) => {
  try {
    const { barangay_id, period, snapshot_date } = req.query;
    const summary = await service.getComplianceSummary({ barangay_id, period, snapshot_date });

    return res.status(200).json({
      success: true,
      message: "Compliance summary retrieved.",
      summary,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to retrieve compliance summary.",
    });
  }
};
