/**
 * Request ID middleware
 */
import { randomUUID } from 'crypto';

/**
 * Add request ID to request object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export default function addRequestId(req, res, next) {
  // Check for existing request ID from headers
  const headerRequestId = req.headers['x-request-id'];
  
  // Use existing or generate new request ID
  req.id = headerRequestId || randomUUID();
  
  // Add request ID to response headers
  res.setHeader('x-request-id', req.id);
  
  next();
}