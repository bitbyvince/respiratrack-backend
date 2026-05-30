const ESCALATION_LEVELS = {
  NONE: 0,
  LEVEL_1: 1,
  LEVEL_2: 2,
  LEVEL_3: 3,

  L1_THRESHOLD: 2,   // 2–6 missed doses
  L2_THRESHOLD: 7,   // 7–29 missed doses
  L3_THRESHOLD: 30,  // 30+ missed doses

  LABELS: {
    0: "None",
    1: "Missed Dose Alert",
    2: "At Risk of Interruption",
    3: "Lost to Follow-Up",
  },
  ALL: [0, 1, 2, 3],
};

export { ESCALATION_LEVELS };
export default ESCALATION_LEVELS;