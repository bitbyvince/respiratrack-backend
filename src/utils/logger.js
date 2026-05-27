const { createLogger, format, transports } = require('winston');

const { combine, timestamp, printf, colorize, errors } = format;

const ENV = process.env.NODE_ENV || 'development';

// Custom log line format
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return stack
    ? `[${timestamp}] ${level}: ${message}\n${stack}`
    : `[${timestamp}] ${level}: ${message}`;
});

const logger = createLogger({
  level: ENV === 'production' ? 'warn' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // captures stack traces on Error objects
    logFormat
  ),
  transports: [
    // Console — colored in development
    new transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
      ),
    }),

    // Persistent error log
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),

    // All logs (debug and above)
    new transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});

module.exports = logger;