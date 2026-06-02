import * as allocationService from "./stock-allocation.service.js";
import { sendSuccess } from "../../utils/apiResponse.js";

export const createAllocation = async (req, res, next) => {
  try {
    const allocation = await allocationService.allocateStock(
      req.body,
      req.user.user_id,
    );
    return sendSuccess(res, "Stock allocated successfully", allocation, 201);
  } catch (err) {
    next(err);
  }
};

export const getAllocations = async (req, res, next) => {
  try {
    const result = await allocationService.getAllocations(req.query);
    return sendSuccess(res, "Allocations retrieved successfully", result, 200);
  } catch (err) {
    next(err);
  }
};

export const getAllocationById = async (req, res, next) => {
  try {
    const allocation = await allocationService.getAllocationById(
      req.params.allocation_id,
    );
    return sendSuccess(
      res,
      200,
      "Allocation retrieved successfully",
      allocation,
    );
  } catch (err) {
    next(err);
  }
};

export const getAllocationSummary = async (req, res, next) => {
  try {
    const summary = await allocationService.getAllocationSummaryByBarangay(
      req.params.barangay_id,
    );
    return sendSuccess(
      res,
      200,
      "Allocation summary retrieved successfully",
      summary,
    );
  } catch (err) {
    next(err);
  }
};
