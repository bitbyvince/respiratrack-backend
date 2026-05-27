/**
 * Calculates compliance percentage.
 * Formula: (doses_taken / total_doses_required) * 100
 *
 * @param {number} dosesTaken
 * @param {number} totalDosesRequired
 * @returns {number} Rounded to 2 decimal places, capped at 100
 */
const calculateCompliancePercentage = (dosesTaken, totalDosesRequired) => {
  if (!totalDosesRequired || totalDosesRequired <= 0) return 0;
  const percentage = (dosesTaken / totalDosesRequired) * 100;
  return Math.min(parseFloat(percentage.toFixed(2)), 100);
};

/**
 * Determines risk level based on consecutive missed doses.
 * Thresholds mirror escalation levels in escalationLevels.js
 *
 * @param {number} consecutiveMissed
 * @returns {'Compliant' | 'At Risk' | 'Defaulter'}
 */
const getRiskLevel = (consecutiveMissed) => {
  if (consecutiveMissed >= 14) return 'Defaulter';
  if (consecutiveMissed >= 2)  return 'At Risk';
  return 'Compliant';
};

/**
 * Determines adherence label based on compliance percentage.
 *
 * @param {number} compliancePercentage
 * @returns {'Regular' | 'Irregular' | 'Pending'}
 */
const getAdherenceLabel = (compliancePercentage) => {
  if (compliancePercentage === 0)   return 'Pending';
  if (compliancePercentage >= 90)   return 'Regular';
  return 'Irregular';
};

/**
 * Returns a full compliance summary object ready to be
 * merged into patient.compliance.
 *
 * @param {object} params
 * @param {number} params.totalDosesRequired
 * @param {number} params.dosesTaken
 * @param {number} params.dosesMissed
 * @param {number} params.consecutiveMissedDoses
 * @param {Date|null} params.lastDoseTaken
 * @returns {object}
 */
const computeComplianceSummary = ({
  totalDosesRequired,
  dosesTaken,
  dosesMissed,
  consecutiveMissedDoses,
  lastDoseTaken = null,
}) => {
  const dosesRemaining = Math.max(totalDosesRequired - dosesTaken - dosesMissed, 0);
  const compliancePercentage = calculateCompliancePercentage(dosesTaken, totalDosesRequired);

  return {
    total_doses_required:      totalDosesRequired,
    doses_taken:               dosesTaken,
    doses_missed:              dosesMissed,
    doses_remaining:           dosesRemaining,
    compliance_percentage:     compliancePercentage,
    adherence:                 getAdherenceLabel(compliancePercentage),
    consecutive_missed_doses:  consecutiveMissedDoses,
    last_dose_taken:           lastDoseTaken,
    risk_level:                getRiskLevel(consecutiveMissedDoses),
  };
};

module.exports = {
  calculateCompliancePercentage,
  getRiskLevel,
  getAdherenceLabel,
  computeComplianceSummary,
};