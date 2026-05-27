const allocationService = require('./stock-allocation.service');
const { sendSuccess }   = require('../../utils/apiResponse');

/**
 * POST /stock-allocations
 * Super admin allocates stock to a barangay health center.
 */
const createAllocation = async (req, res, next) => {
  try {
    const allocation = await allocationService.allocateStock(req.body, req.user.user_id);
    return sendSuccess(res, allocation, 'Stock allocated successfully', 201);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /stock-allocations
 * List all allocations with optional query filters.
 */
const getAllocations = async (req, res, next) => {
  try {
    const result = await allocationService.getAllocations(req.query);
    return sendSuccess(res, result, 'Allocations retrieved successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /stock-allocations/:allocation_id
 * Get a single allocation record.
 */
const getAllocationById = async (req, res, next) => {
  try {
    const allocation = await allocationService.getAllocationById(req.params.allocation_id);
    return sendSuccess(res, allocation, 'Allocation retrieved successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /stock-allocations/summary/:barangay_id
 * Aggregated allocation summary per drug for a barangay.
 */
const getAllocationSummary = async (req, res, next) => {
  try {
    const summary = await allocationService.getAllocationSummaryByBarangay(req.params.barangay_id);
    return sendSuccess(res, summary, 'Allocation summary retrieved successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = { createAllocation, getAllocations, getAllocationById, getAllocationSummary };