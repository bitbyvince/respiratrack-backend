import { createLogger, format, transports } from "winston";

const { combine, timestamp, printf, colorize, errors } = format;

const ENV = process.env.NODE_ENV || "development";

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return stack
    ? `[${timestamp}] ${level}: ${message}\n${stack}`
    : `[${timestamp}] ${level}: ${message}`;
});

const logger = createLogger({
  level: ENV === "production" ? "warn" : "debug",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat,
  ),
  transports: [
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        logFormat,
      ),
    }),
    new transports.File({ filename: "logs/error.log", level: "error" }),
    new transports.File({ filename: "logs/combined.log" }),
  ],
});

export default logger;
