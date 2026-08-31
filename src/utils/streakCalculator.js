import MedicationLog from "../models/MedicationLog.model.js";

const dateOnly = (d) => {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export async function computeStreaks(patientId, dateStarted) {
  const today = dateOnly(new Date());
  const start = dateOnly(dateStarted);

  const logs = await MedicationLog.find({ patient_id: patientId })
    .select("log_date overall_status")
    .sort({ log_date: -1 })
    .limit(400);

  const statusByDate = new Map();
  for (const log of logs) {
    statusByDate.set(dateOnly(log.log_date).getTime(), log.overall_status);
  }

  const walk = (matches) => {
    let streak = 0;
    const cursor = new Date(today);

    if (!statusByDate.has(cursor.getTime())) {
      cursor.setDate(cursor.getDate() - 1);
    }

    while (cursor.getTime() >= start.getTime()) {
      const status = statusByDate.get(cursor.getTime());
      if (!matches(status)) break;
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  };

  const consecutiveDaysTaken = walk((status) => status === "Taken");
  const consecutiveMissedDoses = walk(
    (status) => status === "Missed" || status === undefined,
  );

  return { consecutiveDaysTaken, consecutiveMissedDoses };
}
