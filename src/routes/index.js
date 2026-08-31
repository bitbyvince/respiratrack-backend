import authRoutes from "../modules/auth/auth.routes.js";
import patientRoutes from "../modules/patients/patient.routes.js";
import inventoryRoutes from "../modules/inventory/inventory.routes.js";
import notificationRoutes from "../modules/notifications/notification.routes.js";
import medicationLogRoutes from "../modules/medication-logs/medication-log.routes.js";
import sputumTestRoutes from "../modules/sputum-tests/sputum-test.routes.js";
import escalationRoutes from "../modules/escalations/escalation.routes.js";
import reportRoutes from "../modules/reports/report.routes.js";
import dispensingRoutes from "../modules/dispensing/dispensing.routes.js";
import appointmentRoutes from "../modules/appointments/appointment.routes.js";
import symptomLogRoutes from "../modules/symptom-logs/symptom-log.routes.js";
import alertRoutes from "../modules/alerts/alert.routes.js";
import barangayRoutes from "../modules/barangays/barangay.routes.js";
import heatmapRoutes from "../modules/heatmap/heatmap.routes.js";
import userRoutes from "../modules/users/user.routes.js";  // 👈 add

export default (app) => {
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);                       // 👈 add
  app.use("/api/patients", patientRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/medication-logs", medicationLogRoutes);
  app.use("/api/sputum-tests", sputumTestRoutes);
  app.use("/api/escalations", escalationRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/dispensing", dispensingRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/symptom-logs", symptomLogRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/barangays", barangayRoutes);
  app.use("/api/heatmap", heatmapRoutes);
};