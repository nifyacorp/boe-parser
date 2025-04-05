/**
 * Global error handler module
 */
import { AppError } from './AppError.js';
import logger from '../logger.js';
import { publishError } from '../pubsub.js';

/**
 * Send error response to client
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function sendErrorResponse(err, req, res) {
  const statusCode = err.statusCode || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';
  
  const errorResponse = {
    status: 'error',
    error: {
      code: errorCode,
      message: err.message,
    },
  };
  
  // Include error details for operational errors in development
  if (process.env.NODE_ENV === 'development' && err.isOperational) {
    errorResponse.error.details = err.details || {};
    errorResponse.error.stack = err.stack;
  }
  
  res.status(statusCode).json(errorResponse);
}

/**
 * Log error details
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 */
export function logError(err, req) {
  const context = {
    requestId: req.id,
    path: req.path,
    method: req.method,
    statusCode: err.statusCode || 500,
    errorCode: err.code,
  };

  if (err.isOperational) {
    logger.error(context, `Operational error: ${err.message}`);
  } else {
    logger.error(context, `Unhandled error: ${err.message}`);
    logger.error({ ...context, stack: err.stack }, 'Error stack trace');
  }
}

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export default function errorHandler(err, req, res, next) {
  // Normalize error to AppError
  let normalizedError = err;
  
  if (!(err instanceof AppError)) {
    normalizedError = new AppError(
      err.message || 'Internal server error',
      err.statusCode || 500,
      err.code || 'INTERNAL_ERROR'
    );
    
    // Preserve stack trace
    normalizedError.stack = err.stack;
    normalizedError.isOperational = false;
  }
  
  // Log error
  logError(normalizedError, req);
  
  // Publish error to PubSub for monitoring (non-blocking)
  publishError(normalizedError, req).catch(pubsubErr => {
    logger.error({ error: pubsubErr }, 'Failed to publish error to PubSub');
  });
  
  // Send error response
  sendErrorResponse(normalizedError, req, res);
}