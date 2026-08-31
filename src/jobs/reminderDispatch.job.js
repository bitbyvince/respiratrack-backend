import { runSputumReminderJob } from "./sputumReminder.job.js";
import logger from "../utils/logger.js";

export const runReminderDispatch = async () => {
  logger.info("[reminderDispatch.job] Dispatching reminder jobs...");
  try {
    await runSputumReminderJob();
    logger.info("[reminderDispatch.job] Reminder dispatch completed.");
  } catch (err) {
    logger.error(`[reminderDispatch.job] Error: ${err.message}`);
  }
};
