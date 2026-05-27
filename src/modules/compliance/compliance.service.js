import mongoose from "mongoose";

const getCollection = () => mongoose.connection.collection("compliance_snapshots");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDateFilter(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);

  return { $gte: start, $lte: end };
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function getComplianceSnapshots(filters, { page = 1, limit = 20 }) {
  const query = {};

  if (filters.barangay_id) query.barangay_id = filters.barangay_id;
  if (filters.period) query.period = filters.period;
  if (filters.snapshot_date) {
    const dateRange = normalizeDateFilter(filters.snapshot_date);
    if (dateRange) query.snapshot_date = dateRange;
  }

  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;
  const skip = (parsedPage - 1) * parsedLimit;

  const collection = getCollection();
  const [snapshots, total] = await Promise.all([
    collection
      .find(query)
      .sort({ snapshot_date: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .toArray(),
    collection.countDocuments(query),
  ]);

  return { snapshots, total, page: parsedPage, limit: parsedLimit };
}

export async function getLatestSnapshots(filters = {}) {
  const query = {};
  if (filters.period) query.period = filters.period;

  const collection = getCollection();
  return collection.find(query).sort({ snapshot_date: -1 }).toArray();
}

export async function getBarangaySnapshot(barangayId, filters = {}) {
  const query = { barangay_id: barangayId };
  if (filters.period) query.period = filters.period;

  const collection = getCollection();
  const snapshot = await collection
    .find(query)
    .sort({ snapshot_date: -1 })
    .limit(1)
    .next();

  if (!snapshot) throw new Error("Barangay compliance snapshot not found.");

  return snapshot;
}

export async function getComplianceSummary(filters = {}) {
  const match = {};
  if (filters.period) match.period = filters.period;
  if (filters.barangay_id) match.barangay_id = filters.barangay_id;
  if (filters.snapshot_date) {
    const dateRange = normalizeDateFilter(filters.snapshot_date);
    if (dateRange) match.snapshot_date = dateRange;
  }

  const collection = getCollection();
  const result = await collection
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total_patients: { $sum: "$total_patients" },
          compliant_count: { $sum: "$compliant_count" },
          at_risk_count: { $sum: "$at_risk_count" },
          defaulter_count: { $sum: "$defaulter_count" },
          average_compliance_percentage: { $avg: "$compliance_percentage" },
          average_risk_score: { $avg: "$average_risk_score" },
        },
      },
    ])
    .toArray();

  return result[0] ?? {
    total_patients: 0,
    compliant_count: 0,
    at_risk_count: 0,
    defaulter_count: 0,
    average_compliance_percentage: 0,
    average_risk_score: 0,
  };
}