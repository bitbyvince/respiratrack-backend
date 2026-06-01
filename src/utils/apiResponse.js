const sendResponse = (res, statusCode, success, message, data = null) =>
  res.status(statusCode).json({ success, message, data });

export const createError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

export const sendSuccess = (res, messageOrStatusCode = 200, dataOrMessage = null, data = null) => {
  if (typeof messageOrStatusCode === "string") {
    return sendResponse(res, 200, true, messageOrStatusCode, dataOrMessage);
  }
  return sendResponse(res, messageOrStatusCode, true, dataOrMessage ?? "Success", data);
};

export const sendError = (res, statusCodeOrErr = 500, message = "Something went wrong") => {
  if (typeof statusCodeOrErr === "object") {
    const code = statusCodeOrErr?.statusCode ?? 500;
    const msg  = statusCodeOrErr?.message ?? message;
    return sendResponse(res, code, false, msg, null);
  }
  return sendResponse(res, statusCodeOrErr, false, message, null);
};

export const success = (res, message = "Success", data = null, statusCode = 200) =>
  sendResponse(res, statusCode, true, message, data);

export const error = (res, message = "Something went wrong", statusCode = 500, data = null) =>
  sendResponse(res, statusCode, false, message, data);

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

export default ApiResponse;