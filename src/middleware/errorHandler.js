/**
 * Error handling middleware
 */
import config from '../config/config.js';

/**
 * Centralized error handler
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function errorHandler(err, req, res, next) {
  // Determine status code
  const statusCode = err.statusCode || (err.status >= 400 && err.status < 600 ? err.status : 500);

  // Log the error
  console.error(`Error occurred - Request ID: ${req.id}, Status: ${statusCode}, Message: ${err.message}, Code: ${err.code || 'UNKNOWN'}`, {
    error: {
      message: err.message,
      name: err.name,
      stack: config.env.NODE_ENV !== 'production' ? err.stack : undefined, // Include stack only in non-prod
      code: err.code,
      details: err.details,
    },
    request: {
      id: req.id,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      headers: req.headers,
      body: req.body, // Be careful logging full bodies in production
    }
  });

  // Prevent sending response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  // Send error response
  res.status(statusCode).json({
    status: 'error',
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.expose ? err.message : 'An internal server error occurred',
    ...(config.env.NODE_ENV !== 'production' && { details: err.details }), // Include details only in non-prod
    requestId: req.id
  });
} 