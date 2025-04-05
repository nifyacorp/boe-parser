/**
 * Logger middleware
 */
import logger from '../utils/logger.js';

/**
 * Log incoming requests
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  
  // Log request
  logger.info({
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  }, 'Request received');
  
  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel]({
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    }, 'Request completed');
  });
  
  next();
}