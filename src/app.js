import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { connectDB } from "./config/db.js";
import { initFirebase } from "./config/firebase.js";
import registerRoutes from "./routes/index.js";
import { errorHandler } from "./middleware/error.middleware.js";

const app = express();

await connectDB();
initFirebase();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

registerRoutes(app);

app.use(errorHandler);

export default app;