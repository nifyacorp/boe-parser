/**
 * Authentication middleware
 */
import logger from '../utils/logger.js';
import config from '../config/config.js';
import { createAuthenticationError } from '../utils/errors/AppError.js';

/**
 * Validate API key middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function validateApiKey(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      logger.warn({ requestId: req.id }, 'Missing Authorization header');
      throw createAuthenticationError('Authorization header is required');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer') {
      logger.warn({ requestId: req.id }, 'Invalid authorization type');
      throw createAuthenticationError('Bearer token is required');
    }

    if (!token) {
      logger.warn({ requestId: req.id }, 'Missing token');
      throw createAuthenticationError('API key is required');
    }
    
    // Compare with configured API key
    const validApiKey = config.auth.apiKey;
    
    if (!validApiKey) {
      logger.error({ requestId: req.id }, 'API key not configured');
      throw createAuthenticationError('Service configuration error');
    }
    
    if (token !== validApiKey) {
      logger.warn({ 
        requestId: req.id,
        providedKeyLength: token.length,
        expectedKeyLength: validApiKey.length,
        keyMismatch: true
      }, 'Invalid API key');
      throw createAuthenticationError('Invalid API key');
    }

    next();
  } catch (error) {
    // Pass error to global error handler
    next(error);
  }
}