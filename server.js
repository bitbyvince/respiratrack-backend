// server.js
import app from "./src/app.js";
import cron from "node-cron";

import { runEscalationJob } from "./src/jobs/escalations.job.js";
import { runComplianceSnapshot } from "./src/jobs/complianceSnapshot.job.js";
import { runHeatmapSnapshot } from "./src/jobs/heatmapSnapshot.job.js";
import { runReminderDispatch } from "./src/jobs/reminderDispatch.job.js";
import { runMedicationReminderJob } from "./src/jobs/medicationReminder.job.js";
import { runAppointmentReminderJob } from "./src/jobs/appointmentReminder.job.js";
import { runAppointmentAutoCancelJob } from "./src/jobs/appointmentAutoCancel.job.js";
import { runMissedDoseJob } from "./src/jobs/missedDose.job.js";
import { runSupplyReminderJob } from "./src/jobs/supplyReminder.job.js";



const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ RespiraTrack API running on port ${PORT}`);

  // Add 2: Escalation sweep — every hour
  cron.schedule("0 * * * *", runEscalationJob);

  // Daily snapshots — midnight
  cron.schedule("0 0 * * *", runComplianceSnapshot);
  cron.schedule("0 0 * * *", runHeatmapSnapshot);

  // Reminder dispatch (sputum tests) — every 15 minutes
  cron.schedule("*/15 * * * *", runReminderDispatch);

  cron.schedule("0 * * * *", runMedicationReminderJob, { timezone: "Asia/Manila" });

  // Appointment reminder — every 15 minutes, ~24h before the visit
  cron.schedule("*/15 * * * *", runAppointmentReminderJob);

  // Appointment auto-cancel — runs once on startup, then every 15 minutes
  runAppointmentAutoCancelJob();
  cron.schedule("*/15 * * * *", runAppointmentAutoCancelJob, { timezone: "Asia/Manila" });

  // Missed dose detection — runs once on startup, then daily, end of day
  runMissedDoseJob();
  cron.schedule("0 21 * * *", runMissedDoseJob, { timezone: "Asia/Manila" });

  cron.schedule("0 8 * * *", runSupplyReminderJob, { timezone: "Asia/Manila" });

  console.log("✅ Cron jobs registered");
});
