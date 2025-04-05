/**
 * Middleware collection module
 */
import addRequestId from './requestId.js';
import { requestLogger } from './logger.js';
import { validateApiKey } from './auth.js';
import errorHandler from '../utils/errors/errorHandler.js';

/**
 * Register all middleware with Express app
 * @param {Object} app - Express app
 */
export function registerMiddleware(app) {
  // Add request ID to all requests
  app.use(addRequestId);
  
  // Log all requests
  app.use(requestLogger);
  
  // Return middleware functions for routes
  return {
    auth: validateApiKey,
    errorHandler,
  };
}