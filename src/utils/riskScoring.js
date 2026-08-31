/**
 * Risk Scoring Utility — TB Monitoring System (Pasig City)
 *
 * Score range: 0–100
 *
 * Factors & weights:
 *  1. Consecutive missed doses  — highest weight (drives escalation)
 *  2. Symptom frequency         — moderate weight
 *  3. Days into treatment       — contextual weight (early = more critical)
 *  4. Treatment phase           — multiplier (Intensive = 1.2, Continuation = 1.0)
 *
 * Thresholds (mirrors escalationLevels.js):
 *  Compliant  → score 0–29
 *  At Risk    → score 30–59
 *  Defaulter  → score 60–100
 *
 * Escalation levels (mirrors escalationLevels.js):
 *  Level 1 → consecutive_missed >= 2
 *  Level 2 → consecutive_missed >= 7
 *  Level 3 → consecutive_missed >= 30
 */

// ─── Weight Configuration ─────────────────────────────────────────────────────

const WEIGHTS = {
  CONSECUTIVE_MISSED:  0.50,
  SYMPTOM_FREQUENCY:   0.25,
  DAYS_INTO_TREATMENT: 0.25,
};

const PHASE_MULTIPLIER = {
  Intensive:    1.2,
  Continuation: 1.0,
};

// ─── Sub-scorers (each returns 0–100 before weighting) ───────────────────────

/**
 * Scores based on consecutive missed doses.
 * Caps at 30 (Lost to Follow-Up / Defaulter threshold).
 *
 * @param {number} consecutiveMissed
 * @returns {number} 0–100
 */
const scoreConsecutiveMissed = (consecutiveMissed) => {
  if (consecutiveMissed <= 0)  return 0;
  if (consecutiveMissed >= 30) return 100;
  return Math.round((consecutiveMissed / 30) * 100);
};

/**
 * Scores based on number of distinct symptom reports in recent period.
 * Caps at 7 symptom log entries (considered severely frequent).
 *
 * @param {number} symptomFrequency - count of symptom log entries in last 14 days
 * @returns {number} 0–100
 */
const scoreSymptomFrequency = (symptomFrequency) => {
  if (symptomFrequency <= 0) return 0;
  if (symptomFrequency >= 7) return 100;
  return Math.round((symptomFrequency / 7) * 100);
};

/**
 * Scores based on days into treatment.
 * Earlier in treatment = higher risk weight (patient still adjusting).
 * Peaks at day 1 (score 100), declines to 0 at day 180 (end of treatment).
 *
 * @param {number} daysIntoTreatment
 * @returns {number} 0–100
 */
const scoreDaysIntoTreatment = (daysIntoTreatment) => {
  if (daysIntoTreatment <= 0)   return 100;
  if (daysIntoTreatment >= 180) return 0;
  return Math.round(((180 - daysIntoTreatment) / 180) * 100);
};

// ─── Main Scorer ──────────────────────────────────────────────────────────────

/**
 * Computes the patient's overall risk score (0–100).
 *
 * @param {object} params
 * @param {number}  params.consecutiveMissedDoses   - consecutive days with no dose taken
 * @param {number}  params.symptomFrequency         - symptom log entries in last 14 days
 * @param {number}  params.daysIntoTreatment        - days elapsed since treatment start
 * @param {string}  params.treatmentPhase           - 'Intensive' | 'Continuation'
 * @returns {{ score: number, factors: object }}
 */
const computeRiskScore = ({
  consecutiveMissedDoses = 0,
  symptomFrequency       = 0,
  daysIntoTreatment      = 0,
  treatmentPhase         = 'Intensive',
}) => {
  const s1 = scoreConsecutiveMissed(consecutiveMissedDoses);
  const s2 = scoreSymptomFrequency(symptomFrequency);
  const s3 = scoreDaysIntoTreatment(daysIntoTreatment);

  const phaseMultiplier = PHASE_MULTIPLIER[treatmentPhase] ?? 1.0;

  const rawScore =
    s1 * WEIGHTS.CONSECUTIVE_MISSED +
    s2 * WEIGHTS.SYMPTOM_FREQUENCY  +
    s3 * WEIGHTS.DAYS_INTO_TREATMENT;

  const finalScore = Math.min(Math.round(rawScore * phaseMultiplier), 100);

  return {
    score: finalScore,
    factors: {
      consecutive_missed:  consecutiveMissedDoses,
      symptom_frequency:   symptomFrequency,
      days_into_treatment: daysIntoTreatment,
      phase_weight:        phaseMultiplier,
    },
  };
};

// ─── Risk Label ───────────────────────────────────────────────────────────────

/**
 * Returns a human-readable risk label from a score.
 *
 * @param {number} score
 * @returns {'Compliant' | 'At Risk' | 'Defaulter'}
 */
const getRiskLabel = (score) => {
  if (score >= 60) return 'Defaulter';
  if (score >= 30) return 'At Risk';
  return 'Compliant';
};

// ─── Escalation Level Resolver ────────────────────────────────────────────────

/**
 * Resolves escalation level directly from consecutive missed doses.
 * This is the authoritative source — mirrors escalationLevels.js constants.
 *
 * Level 0 → no escalation
 * Level 1 → consecutive_missed >= 2  (assigned nurse notified)
 * Level 2 → consecutive_missed >= 7  (barangay admin notified)
 * Level 3 → consecutive_missed >= 30 (super admin notified, mark Lost to Follow-Up)
 *
 * @param {number} consecutiveMissedDoses
 * @returns {0 | 1 | 2 | 3}
 */
const resolveEscalationLevel = (consecutiveMissedDoses) => {
  if (consecutiveMissedDoses >= 30) return 3;
  if (consecutiveMissedDoses >= 7)  return 2;
  if (consecutiveMissedDoses >= 2)  return 1;
  return 0;
};

export {
  computeRiskScore,
  getRiskLabel,
  resolveEscalationLevel,
  scoreConsecutiveMissed,
  scoreSymptomFrequency,
  scoreDaysIntoTreatment,
};