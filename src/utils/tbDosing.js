// ============================================================
// WHO / Philippines NTP weight-band dosing for the standard
// 6-month Category I regimen (2mo intensive HRZE + 4mo
// continuation HR), counted in 28-day treatment months —
// matching this app's own compliance engine (168 total doses).
// ============================================================

export const TOTAL_COURSE_DOSES = 168; // 6 months x 28 days

// Tablets per dose, by patient weight in kg. Approximate — a
// suggestion for health workers to confirm/override, not a
// substitute for clinical judgment.
const WEIGHT_BANDS = [
  { max: 7.9, tablets: 1 },
  { max: 11.9, tablets: 2 },
  { max: 15.9, tablets: 3 },
  { max: 24.9, tablets: 4 },
  { max: 37, tablets: 2 }, // adult band restarts at the FDC (larger tablet) strength
  { max: 54, tablets: 3 },
  { max: 70, tablets: 4 },
  { max: Infinity, tablets: 5 },
];

export const suggestTabletsPerDose = (weightKg) => {
  const weight = Number(weightKg);
  if (!weight || weight <= 0) return null;
  const band = WEIGHT_BANDS.find((b) => weight <= b.max);
  return band ? band.tablets : null;
};
