import Joi from "joi";

const NOTIFICATION_TYPES = [
  "MISSED_DOSE",
  "ESCALATION_L1",
  "ESCALATION_L2",
  "ESCALATION_L3",
  "LOW_STOCK",
  "SPUTUM_TEST_DUE",
  "APPOINTMENT_REMINDER",
  "GENERAL",
];

export const sendNotificationSchema = Joi.object({
  user_ids: Joi.array().items(Joi.string()).min(1).required(),
  title: Joi.string().max(100).required(),
  body: Joi.string().max(500).required(),
  data: Joi.object().optional(),
  type: Joi.string().valid(...NOTIFICATION_TYPES).default("GENERAL"),
});

export const sendBroadcastSchema = Joi.object({
  roles: Joi.array()
    .items(Joi.string().valid("super_admin", "barangay_admin", "nurse", "patient"))
    .min(1)
    .required(),
  barangay_id: Joi.string().optional(),
  title: Joi.string().max(100).required(),
  body: Joi.string().max(500).required(),
  data: Joi.object().optional(),
  type: Joi.string().valid(...NOTIFICATION_TYPES).default("GENERAL"),
});

export const getNotificationsSchema = Joi.object({
  user_id: Joi.string().optional(),
  type: Joi.string().optional(),
  is_read: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const markReadSchema = Joi.object({
  notification_ids: Joi.array().items(Joi.string()).min(1).required(),
});

export const registerTokenSchema = Joi.object({
  fcm_token: Joi.string().required(),
});