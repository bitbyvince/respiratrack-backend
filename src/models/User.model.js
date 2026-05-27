const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    user_id: { type: String, required: true, unique: true },
    role: {
      type: String,
      enum: ['super_admin', 'barangay_admin', 'nurse', 'patient'],
      required: true,
    },
    first_name: { type: String, required: true },
    last_name:  { type: String, required: true },

    // Staff login
    email:         { type: String, sparse: true, default: null },
    password_hash: { type: String, default: null },

    // Patient login
    tb_case_number: { type: String, sparse: true, unique: true, default: null },
    phone_number:   { type: String, sparse: true, default: null },
    pin_hash:       { type: String, default: null },

    // Device token — used by both patients and nurses for FCM push notifications
    fcm_token: { type: String, default: null },  // 👈 add this line

    // Patient reference
    patient_id: { type: String, sparse: true, default: null },

    // Assignment
    barangay_id:      { type: String, default: null },
    health_center_id: { type: String, default: null },

    is_active:  { type: Boolean, default: true },
    last_login: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

userSchema.index({ email: 1 },          { sparse: true });
userSchema.index({ phone_number: 1 },   { sparse: true });
userSchema.index({ tb_case_number: 1 }, { sparse: true, unique: true });
userSchema.index({ patient_id: 1 },     { sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ barangay_id: 1 });

module.exports = mongoose.model('User', userSchema);