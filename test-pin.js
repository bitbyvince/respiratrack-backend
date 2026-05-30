// test-pin.js
import bcrypt from "bcryptjs";

const inputPin = "4826"; // the PIN you're trying to log in with
const hashFromDb =
  "$2b$12$uI41irUfVzT3a0rPhy4iZu6pIv816vpEbAbJhuzUvYC3NCoTKBtMm"; // paste the actual pin_hash from your Atlas document here

const isMatch = await bcrypt.compare(inputPin, hashFromDb);
console.log("PIN matches:", isMatch);
