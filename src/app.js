// src/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/db.js";
import { initFirebase } from "./config/firebase.js";

import authRoutes from "./modules/auth/auth.routes.js";
import patientRoutes from "./modules/patients/patient.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import barangayRoutes from "./modules/barangays/barangay.routes.js";
import complianceRoutes from "./modules/compliance/compliance.routes.js";
import medicationRoutes from "./modules/medication-logs/medication-log.routes.js";
import symptomRoutes from "./modules/symptom-logs/symptom-log.routes.js";
import appointmentRoutes from "./modules/appointments/appointment.routes.js";
import sputumRoutes from "./modules/sputum-tests/sputum-test.routes.js";
import inventoryRoutes from "./modules/inventory/inventory.routes.js";
import escalationRoutes from "./modules/escalations/escalation.routes.js";
import alertRoutes from "./modules/alerts/alert.routes.js";
import heatmapRoutes from "./modules/heatmap/heatmap.routes.js";
import reportRoutes from "./modules/reports/report.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";

import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

// ── Init connections ───────────────────────────────────────
await connectDB();
initFirebase();

// ── Global middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/users", userRoutes);
app.use("/api/barangays", barangayRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/medication", medicationRoutes);
app.use("/api/symptoms", symptomRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/sputum", sputumRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/escalations", escalationRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/heatmap", heatmapRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);

// ── Global error handler (must be last) ───────────────────
app.use(errorHandler);

export default app;
