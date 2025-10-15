// ==================================================================================
// Authentication Middleware
// ==================================================================================
// Validates Bearer token for protected endpoints
// Skips authentication for /health endpoint
// ==================================================================================

import config from '../config/index.js';
import { UnauthorizedError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Authentication middleware
 * Validates Bearer token in Authorization header
 */
export default function authMiddleware(req, res, next) {
  // Skip auth if disabled in config
  if (!config.auth.enabled) {
    logger.debug('Authentication disabled, skipping', { path: req.path });
    return next();
  }

  // Skip auth for health endpoint
  if (req.path === '/health') {
    return next();
  }

  // Get Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing Authorization header', { path: req.path });
    throw new UnauthorizedError('Missing Authorization header');
  }

  // Check Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('Invalid Authorization header format', { path: req.path });
    throw new UnauthorizedError('Invalid Authorization header format. Expected: Bearer <token>');
  }

  const token = parts[1];

  // Validate token
  if (token !== config.auth.bearerToken) {
    logger.warn('Invalid token', { path: req.path });
    throw new UnauthorizedError('Invalid token');
  }

  logger.debug('Authentication successful', { path: req.path });
  next();
}
