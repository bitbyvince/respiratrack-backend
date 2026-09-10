// ============================================================
// scripts/regenerateHeatmapSnapshots.js
//
// Replaces whatever is in heatmap_snapshots with snapshots computed
// by the REAL production builder (heatmap.service.js's buildSnapshots),
// which reads actual Patient/Inventory/EscalationLog data — not
// fabricated numbers. With 0 patients currently seeded, this honestly
// produces 0 active cases / 100% compliance / "low" risk for every
// health center, which is correct: there's simply nothing to report
// yet. Once real patients exist, re-running this (or the nightly
// heatmapSnapshot cron job) will reflect their real numbers.
//
// Run with: node src/scripts/regenerateHeatmapSnapshots.js
// ============================================================

import mongoose from "mongoose";
import "dotenv/config";
import HeatmapSnapshot from "../models/HeatmapSnapshot.model.js";
import { buildSnapshots } from "../modules/heatmap/heatmap.service.js";

const { MONGODB_URI } = process.env;

async function run() {
  await mongoose.connect(MONGODB_URI);

  console.log("── Clearing existing heatmap snapshots (including any mock data) ──");
  const { deletedCount } = await HeatmapSnapshot.deleteMany({});
  console.log(`  🗑️  Removed ${deletedCount} snapshot(s).`);

  for (const period of ["daily", "monthly", "all_time"]) {
    const built = await buildSnapshots(period);
    console.log(`✅ Built ${built.length} real "${period}" snapshots (from actual patient/inventory data).`);
  }

  await mongoose.connection.close();
}

run().catch((err) => {
  console.error("❌ Regenerate failed:", err);
  process.exit(1);
});
