const Patient = require('../models/Patient.model');

/**
 * Generates a TB case number in the format: PHNT-137-071-S{YY}-XXXX
 *  PHNT = Philippines National Tuberculosis Program
 *  137  = NCR Region 13, sub-code 7 (Pasig)
 *  071  = Pasig City municipality code
 *  S{YY} = Screened year (e.g. S26 for 2026)
 *  XXXX = Zero-padded sequential number
 *
 * @returns {Promise<string>} e.g. "PHNT-137-071-S26-0042"
 */
const generateCaseNumber = async () => {
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2); // e.g. "26"
  const prefix = `PHNT-137-071-S${year}`;

  // Find the latest case number for the current year
  const latest = await Patient.findOne(
    { tb_case_number: { $regex: `^${prefix}-` } },
    { tb_case_number: 1 }
  ).sort({ tb_case_number: -1 });

  let nextSequence = 1;

  if (latest) {
    const parts = latest.tb_case_number.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    nextSequence = lastSeq + 1;
  }

  const paddedSeq = String(nextSequence).padStart(4, '0');
  return `${prefix}-${paddedSeq}`;
};

module.exports = { generateCaseNumber };