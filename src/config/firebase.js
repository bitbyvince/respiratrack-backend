import admin from "firebase-admin";
import { readFileSync } from "fs";

let serviceAccount;

// Supports both Render (env variable) and local (serviceAccountKey.json file)
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  serviceAccount = JSON.parse(readFileSync("./serviceAccountKey.json", "utf8"));
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const db = admin.firestore();
export const messaging = admin.messaging();
export const auth = admin.auth();

console.log("Firebase Admin initialized");

export default admin;
