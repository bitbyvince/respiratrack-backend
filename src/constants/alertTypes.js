const ALERT_TYPES = {
  MISSED_DOSE: "Missed Dose",
  ESCALATION_L1: "Escalation L1",
  ESCALATION_L2: "Escalation L2",
  ESCALATION_L3: "Escalation L3",
  LOW_STOCK: "Low Stock",
  SPUTUM_TEST_DUE: "Sputum Test Due",
  APPOINTMENT_REMINDER: "Appointment Reminder",
  ALL: [
    "Missed Dose",
    "Escalation L1",
    "Escalation L2",
    "Escalation L3",
    "Low Stock",
    "Sputum Test Due",
    "Appointment Reminder",
  ],
};

export { ALERT_TYPES };
export default ALERT_TYPES;
