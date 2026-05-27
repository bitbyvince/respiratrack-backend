import Patient from "../models/Patient.model.js";

export const generateCaseNumber = async () => {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const prefix = `PHNT-137-071-S${year}`;

  const latest = await Patient.findOne(
    { tb_case_number: { $regex: `^${prefix}-` } },
    { tb_case_number: 1 },
  ).sort({ tb_case_number: -1 });

  let nextSequence = 1;
  if (latest) {
    const parts = latest.tb_case_number.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    nextSequence = lastSeq + 1;
  }

  return `${prefix}-${String(nextSequence).padStart(4, "0")}`;
};
