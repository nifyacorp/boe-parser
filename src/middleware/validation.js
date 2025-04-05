/**
 * Request validation middleware
 */
import { createValidationError } from '../utils/errors/AppError.js';

/**
 * Validate the request body for the /analyze-text endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function validateAnalyzeRequestMiddleware(req, res, next) {
  const errors = [];
  const reqBody = req.body;

  // Check that texts are provided
  if (!reqBody.texts) {
    errors.push('texts field is required');
  } else if (!Array.isArray(reqBody.texts)) {
    errors.push('texts must be an array');
  } else if (reqBody.texts.length === 0) {
    errors.push('texts array cannot be empty');
  }

  // Check subscription_id if provided
  if (reqBody.subscription_id && typeof reqBody.subscription_id !== 'string') {
    errors.push('subscription_id must be a string');
  }

  // Check user_id if provided
  if (reqBody.user_id && typeof reqBody.user_id !== 'string') {
    errors.push('user_id must be a string');
  }

  // Check date if provided
  if (reqBody.date && typeof reqBody.date !== 'string') {
    errors.push('date must be a string in YYYY-MM-DD format');
  } else if (reqBody.date && !/^\d{4}-\d{2}-\d{2}$/.test(reqBody.date)) {
    errors.push('date must be in YYYY-MM-DD format');
  }

  // Check service if provided
  if (reqBody.service && !['gemini', 'openai'].includes(reqBody.service)) {
    errors.push('service must be either "gemini" or "openai"');
  }

  if (errors.length > 0) {
    // If validation errors exist, pass a validation error to the error handler
    return next(createValidationError('Invalid request body', { errors }));
  }

  // If validation passes, proceed to the next middleware/controller
  next();
} 