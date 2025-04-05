/**
 * Error handling middleware
 */
import config from '../../config/config.js';
import { publishError } from '../pubsub.js'; // Import PubSub error publisher

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

  // Create error context for logging and potentially publishing
  const errorContext = {
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
      headers: req.headers, // Consider filtering sensitive headers
      body: config.env.NODE_ENV !== 'production' ? req.body : undefined, // Log body only in non-prod
    }
  };

  // Log the error using console.error
  console.error(`Error occurred - Request ID: ${req.id}, Status: ${statusCode}, Code: ${err.code || 'UNKNOWN'}, Message: ${err.message}`, JSON.stringify(errorContext, null, 2));

  // Optionally publish detailed error context to Pub/Sub (fire-and-forget)
  if (config.pubsub.errorTopicId && statusCode >= 500) { // Example: Only publish server errors
    publishError(errorContext).catch(pubsubErr => {
      // Log failure to publish the error itself
      console.error('CRITICAL: Failed to publish error context to PubSub', { error: pubsubErr });
    });
  }

  // Prevent sending response if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  // Send error response
  res.status(statusCode).json({
    status: 'error',
    code: err.code || 'INTERNAL_SERVER_ERROR',
    // Only expose message if it's explicitly marked as safe or if it's not a 5xx error
    message: (err.expose || statusCode < 500) ? err.message : 'An internal server error occurred',
    // Include details only in non-prod, if they exist, and if the error isn't a server error (or if expose is true)
    ...(config.env.NODE_ENV !== 'production' && err.details && (err.expose || statusCode < 500) && { details: err.details }),
    requestId: req.id
  });
} 