// One-time backfill — run once, right after the phone_verified field is
// deployed, before any new patient registrations happen. Marks every
// patient that existed BEFORE the SMS OTP first-login feature as already
// verified, so only genuinely new registrations get the OTP gate.
//
// Usage: node src/scripts/backfillPhoneVerified.js
import mongoose from 'mongoose';
import 'dotenv/config';

const { MONGODB_URI } = process.env;

await mongoose.connect(MONGODB_URI);

const result = await mongoose.connection.collection('users').updateMany(
  { role: 'patient', phone_verified: { $exists: false } },
  { $set: { phone_verified: true } },
);

console.log(`✅ Backfilled phone_verified=true for ${result.modifiedCount} existing patient(s).`);
await mongoose.connection.close();
