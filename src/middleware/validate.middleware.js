// src/middleware/validate.middleware.js

import Joi from "joi";

const VALID_SOURCES = ["body", "query", "params", "headers"];

export const validate = (schema, source = "body") => {
  const location = VALID_SOURCES.includes(source) ? source : "body";

  return (req, res, next) => {
    const payload = req[location] ?? {};
    const { error, value } = schema.validate(payload, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        code: "VALIDATION_FAILED",
        message: "Request validation failed.",
        errors: error.details.map((detail) => ({
          message: detail.message,
          path: detail.path,
          type: detail.type,
        })),
      });
    }

    req[location] = value;
    return next();
  };
};
