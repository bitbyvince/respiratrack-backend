import env from "./config/env.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/db.js";
import { initFirebase } from "./config/firebase.js";
import { errorHandler } from "./middleware/error.middleware.js";
import setupRoutes from "./routes/index.js";

const app = express();

// ── Init connections ───────────────────────────────────────
await connectDB();
initFirebase();

// ── Global middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// ── Routes (single source of truth) ───────────────────────
setupRoutes(app);

// ── Global error handler (must be last) ───────────────────
app.use(errorHandler);

export default app;
