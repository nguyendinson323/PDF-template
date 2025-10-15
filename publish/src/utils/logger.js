// ==================================================================================
// Structured Logger
// ==================================================================================
// Provides structured JSON logging with different levels
// Includes timestamp, service name, and context
// ==================================================================================

import config from '../config/index.js';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SERVICE_NAME = 'document-publisher';

/**
 * Get current log level from config
 */
function getCurrentLogLevel() {
  return LOG_LEVELS[config.logging.level] || LOG_LEVELS.debug;
}

/**
 * Format log message as JSON
 */
function formatLog(level, message, context = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    message,
    ...context,
  });
}

/**
 * Log at debug level
 */
export function debug(message, context = {}) {
  if (getCurrentLogLevel() <= LOG_LEVELS.debug) {
    console.log(formatLog('debug', message, context));
  }
}

/**
 * Log at info level
 */
export function info(message, context = {}) {
  if (getCurrentLogLevel() <= LOG_LEVELS.info) {
    console.log(formatLog('info', message, context));
  }
}

/**
 * Log at warn level
 */
export function warn(message, context = {}) {
  if (getCurrentLogLevel() <= LOG_LEVELS.warn) {
    console.warn(formatLog('warn', message, context));
  }
}

/**
 * Log at error level
 */
export function error(message, context = {}) {
  if (getCurrentLogLevel() <= LOG_LEVELS.error) {
    console.error(formatLog('error', message, context));
  }
}

/**
 * Log HTTP request
 */
export function logRequest(req, duration = null) {
  const context = {
    method: req.method,
    path: req.path,
    endpoint: `${req.method} ${req.path}`,
  };

  if (duration !== null) {
    context.duration_ms = duration;
  }

  info('HTTP request', context);
}

/**
 * Log HTTP response
 */
export function logResponse(req, res, duration) {
  const context = {
    method: req.method,
    path: req.path,
    endpoint: `${req.method} ${req.path}`,
    status: res.statusCode,
    duration_ms: duration,
  };

  if (res.statusCode >= 400) {
    error('HTTP request failed', context);
  } else {
    info('HTTP request completed', context);
  }
}

export default {
  debug,
  info,
  warn,
  error,
  logRequest,
  logResponse,
};
