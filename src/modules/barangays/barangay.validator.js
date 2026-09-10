import Joi from "joi";

const pointSchema = Joi.object({
  type: Joi.string().valid("Point").required(),
  coordinates: Joi.array()
    .items(Joi.number())
    .length(2)
    .required()
    .messages({
      "array.length": "coordinates must contain exactly 2 numeric values [lng, lat]",
    }),
});

const polygonSchema = Joi.object({
  type: Joi.string().valid("Polygon").required(),
  coordinates: Joi.array()
    .items(
      Joi.array()
        .items(
          Joi.array().items(Joi.number().required()).length(2).required()
        )
        .min(4)
        .required()
    )
    .min(1)
    .required(),
});

const healthCenterSchema = Joi.object({
  // Server-generated (HC-XXX) when omitted — same pattern as barangay_id.
  health_center_id: Joi.string().trim().optional(),
  name: Joi.string().trim().max(150).required(),
  address: Joi.string().trim().max(300).required(),
  contact_number: Joi.string()
    .pattern(/^(\+63|0)9\d{9}$/)
    .required()
    .messages({
      "string.pattern.base": "contact_number must be a valid Philippine mobile number.",
    }),
  // Optional exact facility location — the heatmap uses this pin
  // instead of the barangay centroid when present.
  coordinates: pointSchema.optional(),
});

export const createBarangaySchema = Joi.object({
  // barangay_id is generated server-side (BRG-XXX), not accepted from clients.
  name: Joi.string().trim().max(150).required(),
  municipality: Joi.string().trim().max(100).required(),
  province: Joi.string().trim().max(100).required(),
  province_code: Joi.string().trim().pattern(/^\d{4}$/).optional().allow(null, ""),
  municipality_code: Joi.string().trim().pattern(/^\d{3}$/).optional().allow(null, ""),
  health_centers: Joi.array().items(healthCenterSchema).min(1).required(),
  coordinates: pointSchema.required(),
  boundary_geojson: polygonSchema.required(),
  is_active: Joi.boolean().optional(),
});

export const updateBarangaySchema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  municipality: Joi.string().trim().max(100).optional(),
  province: Joi.string().trim().max(100).optional(),
  province_code: Joi.string().pattern(/^\d{4}$/).optional(),
  municipality_code: Joi.string().pattern(/^\d{3}$/).optional(),
  health_centers: Joi.array().items(healthCenterSchema).min(1).optional(),
  coordinates: pointSchema.optional(),
  boundary_geojson: polygonSchema.optional(),
  is_active: Joi.boolean().optional(),
});

// Adding one more health center to an existing barangay.
export const addHealthCenterSchema = healthCenterSchema;