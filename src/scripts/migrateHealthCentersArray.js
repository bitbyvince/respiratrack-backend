// ============================================================
// scripts/migrateHealthCentersArray.js
//
// One-time migration: Barangay.health_center (single embedded doc)
// -> Barangay.health_centers (array), since a barangay can now have
// more than one designated health center. Wraps each existing
// barangay's single health_center into a 1-item array; no data is
// lost or changed, just the field name/shape.
//
// Run with: node src/scripts/migrateHealthCentersArray.js
// Safe to run more than once — barangays already migrated (no
// `health_center` field, or already carrying `health_centers`) are
// left untouched.
// ============================================================

import mongoose from "mongoose";
import "dotenv/config";

const { MONGODB_URI } = process.env;

async function run() {
  await mongoose.connect(MONGODB_URI);
  const barangays = mongoose.connection.collection("barangays");

  const toMigrate = await barangays.find({ health_center: { $exists: true } }).toArray();
  console.log(`Found ${toMigrate.length} barangay(s) with the old single health_center field.`);

  for (const b of toMigrate) {
    await barangays.updateOne(
      { _id: b._id },
      {
        $set: { health_centers: [b.health_center] },
        $unset: { health_center: "" },
      }
    );
    console.log(`  ✅ ${b.barangay_id} (${b.name}) — wrapped "${b.health_center?.name}" into health_centers[]`);
  }

  console.log("Migration complete.");
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
