// ============================================================
// scripts/seedPasigHealthCenters.js
//
// Full reset of Pasig City's geographic/organizational data ahead of
// the defense: wipes every barangay + everything that hung off the
// old 3-barangay placeholder data (staff, patients, inventory,
// appointments, alerts, logs...) and reseeds all 30 real Pasig
// barangays with their real health centers, grouped by district.
//
// Two health centers are deliberately left OUT of the seed so they
// can be added live through the "Add Health Center" UI as a demo:
//   - Bagong Ilog Health Center II  (Bagong Ilog already has HC I)
//   - Santa Lucia Mini Health Center (Santa Lucia already has HC)
//
// Contact numbers are NOT in the source list (only names + street
// addresses were provided) — placeholders in valid PH mobile format
// are generated so the data satisfies the schema and can still be
// edited later through the app once real numbers are available.
//
// Run with: node src/scripts/seedPasigHealthCenters.js
// ============================================================

import mongoose from "mongoose";
import "dotenv/config";

const { MONGODB_URI } = process.env;

// name, address, [flag if flagship "Super Health Center"]
const DISTRICT_1 = [
  { barangay: "Bagong Ilog", centers: [
    { name: "Bagong Ilog Health Center I", address: "Sgt. Pascua Street, Bagong Ilog, Pasig City" },
    { name: "Bagong Ilog Health Center II", address: "Maximo Flores Street, Bagong Ilog, Pasig City", holdBack: true },
  ]},
  { barangay: "Bagong Katipunan", centers: [
    { name: "Bagong Katipunan Health Center", address: "Barangay Hall Compound, Bagong Katipunan, Pasig City" },
  ]},
  { barangay: "Bambang", centers: [
    { name: "Bambang Health Center", address: "F. Sandoval Avenue, Bambang, Pasig City" },
  ]},
  { barangay: "Buting", centers: [
    { name: "Buting Health Center", address: "2 Coching Street, Buting, Pasig City" },
  ]},
  { barangay: "Caniogan", centers: [
    { name: "Caniogan Health Center", address: "13 Kalinangan Street, Caniogan, Pasig City" },
  ]},
  { barangay: "Kalawaan", centers: [
    { name: "Kalawaan Health Center", address: "F. Soriano Street, Kalawaan, Pasig City" },
  ]},
  { barangay: "Kapasigan", centers: [
    { name: "Kapasigan Health Center", address: "Industria Street, Kapasigan, Pasig City" },
  ]},
  { barangay: "Kapitolyo", centers: [
    { name: "Kapitolyo Health Center", address: "West Capitol Drive, Kapitolyo, Pasig City" },
  ]},
  { barangay: "Malinao", centers: [
    { name: "Malinao Health Center", address: "Market Avenue, Malinao, Pasig City" },
  ]},
  { barangay: "Oranbo", centers: [
    { name: "Oranbo Health Center", address: "Oranbo Drive Compound, Oranbo, Pasig City" },
  ]},
  { barangay: "Palatiw", centers: [
    { name: "Palatiw Health Center", address: "Market Avenue, Palatiw, Pasig City" },
    { name: "E. Santos Health Center", address: "Palatiw Extension, Palatiw, Pasig City" },
  ]},
  { barangay: "Pineda", centers: [
    { name: "Pineda Health Center", address: "Velasquez Street, Pineda, Pasig City" },
  ]},
  { barangay: "Sagad", centers: [
    { name: "Sagad Health Center", address: "E. Angeles Street, Sagad, Pasig City" },
  ]},
  { barangay: "San Antonio", centers: [
    { name: "San Antonio Health Center", address: "7 Gen. Malvar Street, San Antonio, Pasig City" },
  ]},
  { barangay: "San Joaquin", centers: [
    { name: "San Joaquin Super Health Center", address: "Elizco Road, San Joaquin, Pasig City" },
  ]},
  { barangay: "San Jose", centers: [
    { name: "San Jose Health Center", address: "P. Gomez Street, San Jose, Pasig City" },
  ]},
  { barangay: "San Nicolas", centers: [
    { name: "San Nicolas Health Center", address: "Caruncho Avenue / City Hall Compound, San Nicolas, Pasig City" },
  ]},
  { barangay: "Santa Cruz", centers: [
    { name: "Santa Cruz Health Center", address: "S. Castillo Street, Santa Cruz, Pasig City" },
  ]},
  { barangay: "Santa Rosa", centers: [
    { name: "Santa Rosa Health Center", address: "Lopez Jaena Street, Santa Rosa, Pasig City" },
  ]},
  { barangay: "Santo Tomas", centers: [
    { name: "Santo Tomas Health Center", address: "Dr. Sixto Antonio Avenue, Santo Tomas, Pasig City" },
  ]},
  { barangay: "Sumilang", centers: [
    { name: "Sumilang Super Health Center", address: "Dr. Garcia Street, Sumilang, Pasig City" },
  ]},
  { barangay: "Ugong", centers: [
    { name: "Ugong Health Center", address: "Barangay Hall Compound, Ugong, Pasig City" },
  ]},
];

const DISTRICT_2 = [
  { barangay: "Dela Paz", centers: [
    { name: "Dela Paz Health Center", address: "F. Mariano Avenue, Dela Paz, Pasig City" },
  ]},
  { barangay: "Manggahan", centers: [
    { name: "Manggahan Super Health Center", address: "East Bank Road, Manggahan, Pasig City" },
  ]},
  { barangay: "Maybunga", centers: [
    { name: "Maybunga Health Center", address: "Kawilihan Street, Maybunga, Pasig City" },
  ]},
  { barangay: "Pinagbuhatan", centers: [
    { name: "Pinagbuhatan Health Center", address: "M.H. Del Pilar Street, Pinagbuhatan, Pasig City" },
    { name: "Nagpayong Super Health Center", address: "Centennial 2, Nagpayong, Pinagbuhatan, Pasig City" },
  ]},
  { barangay: "Rosario", centers: [
    { name: "Rosario Health Center", address: "C. Raymundo Avenue, Rosario, Pasig City" },
  ]},
  { barangay: "San Miguel", centers: [
    { name: "San Miguel Health Center", address: "M. Eusebio Avenue, San Miguel, Pasig City" },
  ]},
  { barangay: "Santa Lucia", centers: [
    { name: "Santa Lucia Health Center", address: "Barkadahan Street, Santa Lucia, Pasig City" },
    { name: "Santa Lucia Mini Health Center", address: "Satellite Office, Santa Lucia, Pasig City", holdBack: true },
  ]},
  { barangay: "Santolan", centers: [
    { name: "Santolan Health Center", address: "E. Amang Rodriguez Avenue, Santolan, Pasig City" },
  ]},
];

// Deterministic placeholder grid coordinates within Pasig City's real
// bounding box, laid out by district — NOT surveyed GPS. Good enough
// to spread pins across the heatmap; replace with real coordinates if
// the paper needs geographic precision.
const gridCoords = (index, count, bounds) => {
  const cols = Math.ceil(Math.sqrt(count));
  const row = Math.floor(index / cols);
  const col = index % cols;
  const rows = Math.ceil(count / cols);
  const lat = bounds.latMin + (rows <= 1 ? 0 : (row / (rows - 1)) * (bounds.latMax - bounds.latMin));
  const lng = bounds.lngMin + (cols <= 1 ? 0 : (col / (cols - 1)) * (bounds.lngMax - bounds.lngMin));
  return { lat, lng };
};

const DISTRICT_1_BOUNDS = { latMin: 14.555, latMax: 14.600, lngMin: 121.055, lngMax: 121.095 };
const DISTRICT_2_BOUNDS = { latMin: 14.560, latMax: 14.610, lngMin: 121.095, lngMax: 121.125 };

const buildSquareBoundary = (lat, lng, delta = 0.003) => ({
  type: "Polygon",
  coordinates: [[
    [lng - delta, lat - delta],
    [lng + delta, lat - delta],
    [lng + delta, lat + delta],
    [lng - delta, lat + delta],
    [lng - delta, lat - delta],
  ]],
});

// Placeholder PH mobile-format contact number, deterministic per index
// (real numbers weren't provided) — e.g. +639170000012
const placeholderContact = (n) => `+63917${String(n).padStart(7, "0")}`;

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection;

  console.log("── Wiping barangays and everything hung off them ──");
  const collectionsToWipe = [
    "barangays", "patients", "users", "medicine_inventory", "appointments",
    "alerts", "compliance_snapshots", "dispensing_records", "escalation_logs",
    "heatmap_snapshots", "medication_logs", "notifications", "sputum_tests",
    "stock_allocations", "stockallocations", "symptom_logs", "symptomlogs",
  ];
  for (const name of collectionsToWipe) {
    try {
      const { deletedCount } = await db.collection(name).deleteMany({});
      console.log(`  🗑️  ${name}: removed ${deletedCount}`);
    } catch (err) {
      console.log(`  ⚠️  ${name}: ${err.message}`);
    }
  }

  console.log("\n── Seeding 30 Pasig barangays ──");
  const barangays = db.collection("barangays");

  let barangaySeq = 1;
  let healthCenterSeq = 1;
  const heldBack = [];
  const summary = [];

  for (const [districtName, list, bounds] of [
    ["District 1", DISTRICT_1, DISTRICT_1_BOUNDS],
    ["District 2", DISTRICT_2, DISTRICT_2_BOUNDS],
  ]) {
    for (let i = 0; i < list.length; i++) {
      const { barangay, centers } = list[i];
      const barangay_id = `BRG-${String(barangaySeq++).padStart(3, "0")}`;
      const { lat, lng } = gridCoords(i, list.length, bounds);

      const health_centers = [];
      for (const c of centers) {
        if (c.holdBack) {
          heldBack.push({ barangay, barangay_id, name: c.name, address: c.address });
          continue;
        }
        const health_center_id = `HC-${String(healthCenterSeq++).padStart(3, "0")}`;
        health_centers.push({
          health_center_id,
          name: c.name,
          address: c.address,
          contact_number: placeholderContact(healthCenterSeq),
        });
      }

      await barangays.insertOne({
        barangay_id,
        name: barangay,
        municipality: "Pasig City",
        province: "Metro Manila",
        health_centers,
        coordinates: { type: "Point", coordinates: [lng, lat] },
        boundary_geojson: buildSquareBoundary(lat, lng),
        stats: {
          total_patients: 0, active_patients: 0, compliant_count: 0,
          at_risk_count: 0, defaulter_count: 0, compliance_percentage: 0,
          heat_intensity: 0, risk_level: "low",
          escalation_counts: { level_1: 0, level_2: 0, level_3: 0 },
          stock_status: "OK", last_computed: new Date(),
        },
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      summary.push({ district: districtName, barangay_id, name: barangay, centers: health_centers.length });
    }
  }

  console.log(`\n✅ Seeded ${summary.length} barangays.`);
  for (const s of summary) {
    console.log(`  [${s.district}] ${s.barangay_id}  ${s.name}  (${s.centers} health center${s.centers === 1 ? "" : "s"})`);
  }

  console.log(`\n📌 Held back for you to add via "Add Health Center" in the UI:`);
  for (const h of heldBack) {
    console.log(`  - "${h.name}" (${h.address}) → add to ${h.barangay} [${h.barangay_id}]`);
  }

  console.log(`\nNote: health center contact numbers are placeholders (+639170000XXX) — the source list only had names/addresses. Edit them later once real numbers are available.`);

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
