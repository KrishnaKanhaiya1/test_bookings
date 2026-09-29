/**
 * Application logger using Winston.
 * Provides colorized, human-readable logging in development
 * and structured JSON logging in production.
 */
const winston = require('winston');
const config = require('./config');

const logLevel = process.env.LOG_LEVEL || (config.isProduction ? 'info' : 'debug');

// Custom format for development: colorized timestamp, level, message, and metadata
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}]: ${message}${metaStr}`;
  })
);

// Production format: structured JSON with timestamp and full error stacks
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Winston logger instance configured for the active environment.
 */
const logger = winston.createLogger({
  level: logLevel,
  format: config.isProduction ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console({
      silent: config.isTest,
    }),
  ],
});

// Stream object compatible with HTTP request loggers (e.g. morgan)
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = logger;
