// utils/apiResponse.js

const sendResponse = (res, statusCode, success, message, data = null) =>
  res.status(statusCode).json({ success, message, data });

// ── Named exports (used via import { x } from ...) ────────────────────────────

export const createError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};



export const sendSuccess = (res, message = "Success", data = null, statusCode = 200) =>
  sendResponse(res, statusCode, true, message, data);

export const sendError = (res, err, defaultMessage = "Something went wrong") =>
  sendResponse(res, err.statusCode || 500, false, err.message || defaultMessage, null);

// ── Default export (used via import ApiResponse from ...) ─────────────────────

const ApiResponse = {
  success: (res, message = "Success", data = null, statusCode = 200) =>
    sendResponse(res, statusCode, true, message, data),

  created: (res, message = "Resource created successfully", data = null) =>
    sendResponse(res, 201, true, message, data),

  error: (res, message = "Something went wrong", statusCode = 500, data = null) =>
    sendResponse(res, statusCode, false, message, data),

  badRequest: (res, message = "Bad request", data = null) =>
    sendResponse(res, 400, false, message, data),

  unauthorized: (res, message = "Unauthorized") =>
    sendResponse(res, 401, false, message, null),

  forbidden: (res, message = "Forbidden") =>
    sendResponse(res, 403, false, message, null),

  notFound: (res, message = "Resource not found") =>
    sendResponse(res, 404, false, message, null),

  conflict: (res, message = "Conflict", data = null) =>
    sendResponse(res, 409, false, message, data),
};

export const success = ApiResponse.success.bind(ApiResponse);
export const error = ApiResponse.error.bind(ApiResponse);
export default ApiResponse;