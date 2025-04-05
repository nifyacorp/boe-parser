/**
 * Standard application error class
 */
export class AppError extends Error {
  /**
   * Create a new AppError
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code for client
   * @param {Object} [details={}] - Additional error details
   */
  constructor(message, statusCode, code, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Used to distinguish operational vs programming errors
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error types
export const ErrorTypes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  SERVICE_ERROR: 'SERVICE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
};

/**
 * Create a validation error
 * @param {string} message - Error message
 * @param {Object} [details={}] - Validation error details
 * @returns {AppError} - Validation error
 */
export function createValidationError(message, details = {}) {
  return new AppError(message, 400, ErrorTypes.VALIDATION_ERROR, details);
}

/**
 * Create an authentication error
 * @param {string} message - Error message
 * @returns {AppError} - Authentication error
 */
export function createAuthenticationError(message) {
  return new AppError(message, 401, ErrorTypes.AUTHENTICATION_ERROR);
}

/**
 * Create a not found error
 * @param {string} message - Error message
 * @returns {AppError} - Not found error
 */
export function createNotFoundError(message) {
  return new AppError(message, 404, ErrorTypes.NOT_FOUND_ERROR);
}

/**
 * Create a service error
 * @param {string} message - Error message
 * @param {Object} [details={}] - Service error details
 * @returns {AppError} - Service error
 */
export function createServiceError(message, details = {}) {
  return new AppError(message, 500, ErrorTypes.SERVICE_ERROR, details);
}

/**
 * Create an internal error
 * @param {string} message - Error message
 * @returns {AppError} - Internal error
 */
export function createInternalError(message) {
  return new AppError(message, 500, ErrorTypes.INTERNAL_ERROR);
}

/**
 * Create an external API error
 * @param {string} message - Error message
 * @param {Object} [details={}] - External API error details
 * @returns {AppError} - External API error
 */
export function createExternalApiError(message, details = {}) {
  return new AppError(message, 502, ErrorTypes.EXTERNAL_API_ERROR, details);
}