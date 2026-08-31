import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);

const hash = await bcrypt.hash("password123", 12);
await mongoose.connection.collection("users").updateOne(
  { email: "ana.cruz@caniogan.pasig.gov.ph" },
  { $set: { password_hash: hash } }
);

console.log("Password updated!");
process.exit(0);
