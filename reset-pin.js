// reset-pin.js
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "./src/models/User.model.js";
import "dotenv/config";

await mongoose.connect(process.env.MONGODB_URI);

const newHash = await bcrypt.hash("4826", 12);
await User.findOneAndUpdate(
  { tb_case_number: "PHNT-1304-071-S26-0005" },
  { pin_hash: newHash },
);

console.log("PIN reset to 4826");
process.exit(0);
