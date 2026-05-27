/**
 * Sends a standardized JSON response.
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {boolean} success
 * @param {string} message
 * @param {*} data
 */
const sendResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
  });
};

const ApiResponse = {
  success: (res, message = 'Success', data = null, statusCode = 200) => {
    return sendResponse(res, statusCode, true, message, data);
  },

  created: (res, message = 'Resource created successfully', data = null) => {
    return sendResponse(res, 201, true, message, data);
  },

  error: (res, message = 'Something went wrong', statusCode = 500, data = null) => {
    return sendResponse(res, statusCode, false, message, data);
  },

  badRequest: (res, message = 'Bad request', data = null) => {
    return sendResponse(res, 400, false, message, data);
  },

  unauthorized: (res, message = 'Unauthorized') => {
    return sendResponse(res, 401, false, message, null);
  },

  forbidden: (res, message = 'Forbidden') => {
    return sendResponse(res, 403, false, message, null);
  },

  notFound: (res, message = 'Resource not found') => {
    return sendResponse(res, 404, false, message, null);
  },

  conflict: (res, message = 'Conflict', data = null) => {
    return sendResponse(res, 409, false, message, data);
  },
};

module.exports = ApiResponse;