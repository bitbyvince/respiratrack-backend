import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

const app = express();

// ─── SECURITY MIDDLEWARE ──────────────────────────────────────────────────────

app.use(helmet()); // sets secure HTTP headers
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    credentials: true,
  }),
);

// ─── REQUEST PARSING ──────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── LOGGING ─────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", environment: process.env.NODE_ENV });
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Uncomment each route as you create the corresponding route file:

import authRoutes         from './routes/auth.routes.js';
import userRoutes         from './routes/user.routes.js';
import patientRoutes      from './routes/patients.routes.js';
import complianceRoutes   from './routes/compliance.routes.js';
import heatmapRoutes      from './routes/heatmap.routes.js';
import educationRoutes    from './routes/education.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import inventoryRoutes    from './routes/inventory.routes.js';

app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/patients',      patientRoutes);
app.use('/api/compliance',    complianceRoutes);
app.use('/api/heatmap',       heatmapRoutes);
app.use('/api/education',     educationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/inventory',     inventoryRoutes);

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res
    .status(404)
    .json({ message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export default app;
