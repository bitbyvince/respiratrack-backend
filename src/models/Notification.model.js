import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    notification_id: {
      type: String,
      required: true,
      unique: true,
    },
    user_id: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      default: "GENERAL",
    },
    data: {
      type: Map,
      of: String,
      default: {},
    },
    is_read: {
      type: Boolean,
      default: false,
      index: true,
    },
    read_at: {
      type: Date,
      default: null,
    },
    fcm_success: {
      type: Boolean,
      default: false,
    },
    fcm_error: {
      type: String,
      default: null,
    },
    sent_at: {
      type: Date,
      default: Date.now,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;