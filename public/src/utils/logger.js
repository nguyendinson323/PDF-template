const winston = require('winston');
const config = require('../config/config');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Define format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? `\n${info.stack}` : ''}`,
  ),
);

// Define transports
const transports = [];

// Console transport for all environments
if (config.isDevelopment) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    }),
  );
} else {
  transports.push(
    new winston.transports.Console({
      format,
    }),
  );
}

// File transports for production
if (config.isProduction) {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format,
    }),
  );
  transports.push(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format,
    }),
  );
}

// Create logger
const logger = winston.createLogger({
  level: config.isDevelopment ? 'debug' : 'info',
  levels,
  format,
  transports,
  exitOnError: false,
});

// Helper functions for structured logging
logger.logJobStart = (jobId, docId, operation) => {
  logger.info('Job started', {
    jobId,
    docId,
    operation,
    timestamp: new Date().toISOString(),
  });
};

logger.logJobComplete = (jobId, docId, operation, durationMs) => {
  logger.info('Job completed', {
    jobId,
    docId,
    operation,
    durationMs,
    timestamp: new Date().toISOString(),
  });
};

logger.logJobError = (jobId, docId, operation, error) => {
  logger.error('Job failed', {
    jobId,
    docId,
    operation,
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  });
};

logger.logStage = (jobId, stage, status, durationMs) => {
  logger.info('Job stage', {
    jobId,
    stage,
    status,
    durationMs,
    timestamp: new Date().toISOString(),
  });
};

logger.logMetric = (metric, value, labels = {}) => {
  logger.debug('Metric', {
    metric,
    value,
    labels,
    timestamp: new Date().toISOString(),
  });
};

module.exports = logger;
