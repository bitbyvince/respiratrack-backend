const appointmentRoutes = require("../modules/appointments/appointment.routes");
app.use("/api/appointments", appointmentRoutes);

const symptomLogRoutes = require("../modules/symptom-logs/symptom-log.routes");
app.use("/api/symptom-logs", symptomLogRoutes);

const alertRoutes = require("../modules/alerts/alert.routes");
app.use("/api/alerts", alertRoutes);
