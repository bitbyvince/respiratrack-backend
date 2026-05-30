// server.js
import app from "./src/app.js";
import cron from "node-cron";

import { runEscalationJob } from "./src/jobs/escalations.job.js";
import { runComplianceSnapshot } from "./src/jobs/complianceSnapshot.job.js";
import { runHeatmapSnapshot } from "./src/jobs/heatmapSnapshot.job.js";
import { runReminderDispatch } from "./src/jobs/reminderDispatch.job.js";



const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ RespiraTrack API running on port ${PORT}`);

  // Add 2: Escalation sweep — every hour
  cron.schedule("0 * * * *", runEscalationJob);

  // Daily snapshots — midnight
  cron.schedule("0 0 * * *", runComplianceSnapshot);
  cron.schedule("0 0 * * *", runHeatmapSnapshot);

  // Reminder dispatch — every 15 minutes
  cron.schedule("*/15 * * * *", runReminderDispatch);

  console.log("✅ Cron jobs registered");
});
