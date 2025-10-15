// ==================================================================================
// Error Handler Middleware
// ==================================================================================
// Catches all errors and formats consistent error responses
// ==================================================================================

import { AppError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Error handler middleware
 * Must be registered as the last middleware in the app
 */
export default function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Error occurred', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
    code: err.code,
  });

  // If it's our custom AppError, use its JSON representation
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // For unknown errors, return generic 500
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    },
  });
}
