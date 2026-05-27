// src/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/db.js";
import { initFirebase } from "./config/firebase.js";

import authRoutes from "./routes/auth.routes.js";
import patientRoutes from "./routes/patients.routes.js";
import userRoutes from "./routes/users.routes.js";
import barangayRoutes from "./routes/barangays.routes.js";
import complianceRoutes from "./routes/compliance.routes.js";
import medicationRoutes from "./routes/medication.routes.js";
import symptomRoutes from "./routes/symptoms.routes.js";
import appointmentRoutes from "./routes/appointments.routes.js";
import sputumRoutes from "./routes/sputum.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import escalationRoutes from "./routes/escalation.routes.js";
import alertRoutes from "./routes/alerts.routes.js";
import heatmapRoutes from "./routes/heatmap.routes.js";
import reportRoutes from "./routes/reports.routes.js";
import notificationRoutes from "./routes/notifications.routes.js";
import otpRoutes from "./routes/otp.routes.js";

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
app.use("/api/otp", otpRoutes);

// ── Global error handler (must be last) ───────────────────
app.use(errorHandler);

export default app;
