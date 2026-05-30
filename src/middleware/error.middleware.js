// src/middleware/error.middleware.js

const formatValidationError = (error) => {
  if (!error || !Array.isArray(error.details)) {
    return [];
  }

  return error.details.map((detail) => ({
    message: detail.message,
    path: detail.path,
    type: detail.type,
  }));
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = 500;
  let payload = {
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
  };

  if (err?.isJoi || err?.name === "ValidationError") {
    statusCode = 400;
    payload = {
      success: false,
      code: "VALIDATION_ERROR",
      message: err.message || "Request validation failed.",
      errors: formatValidationError(err),
    };
  } else if (err?.name === "SyntaxError" && err.status === 400 && "body" in err) {
    statusCode = 400;
    payload = {
      success: false,
      code: "INVALID_JSON",
      message: "Malformed JSON payload.",
    };
  } else if (typeof err?.statusCode === "number") {
    statusCode = err.statusCode;
    payload = {
      success: false,
      code: err.code || "APPLICATION_ERROR",
      message: err.message || "A server error occurred.",
    };
  } else if (typeof err?.status === "number") {
    statusCode = err.status;
    payload = {
      success: false,
      code: err.code || "APPLICATION_ERROR",
      message: err.message || "A server error occurred.",
    };
  }

  if (process.env.NODE_ENV !== "production" && err?.stack) {
    payload.stack = err.stack;
  }

  console.error("[error.middleware]", err);
  console.error('[error.middleware] STACK:', err?.stack);
  return res.status(statusCode).json(payload);
};
