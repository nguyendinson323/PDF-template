// ==================================================================================
// Custom Error Classes
// ==================================================================================
// Defines custom error types with appropriate HTTP status codes
// ==================================================================================

/**
 * Base application error
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details = null) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(message, details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

/**
 * 422 Validation Error
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends AppError {
  constructor(message = 'Internal server error', details = null) {
    super(message, 500, 'INTERNAL_ERROR', details);
  }
}

/**
 * 502 Bad Gateway (TSA unavailable)
 */
export class BadGatewayError extends AppError {
  constructor(message = 'External service unavailable', details = null) {
    super(message, 502, 'BAD_GATEWAY', details);
  }
}

/**
 * 503 Service Unavailable (S3 unavailable)
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details = null) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}
