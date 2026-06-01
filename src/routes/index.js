import appointmentRoutes from "../modules/appointments/appointment.routes.js";
import symptomLogRoutes from "../modules/symptom-logs/symptom-log.routes.js";
import alertRoutes from "../modules/alerts/alert.routes.js";
import medicationLogRoutes from "../modules/medication-logs/medication-log.routes.js";

export default (app) => {
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/symptom-logs", symptomLogRoutes);
  app.use("/api/alerts", alertRoutes);
  app.use("/api/medication-logs", medicationLogRoutes);
};