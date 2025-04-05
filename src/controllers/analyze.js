/**
 * BOE analysis controller
 */
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import { parseBOE } from '../services/parser/index.js';
import { analyzeBOEItems } from '../services/ai/index.js';
import { publishResults } from '../utils/pubsub.js';
import { createValidationError } from '../utils/errors/AppError.js';

/**
 * Validate analyze request
 * @param {Object} reqBody - Request body 
 * @returns {Array|null} - Error messages or null if valid
 */
function validateAnalyzeRequest(reqBody) {
  const errors = [];
  
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
  
  return errors.length > 0 ? errors : null;
}

/**
 * Handle analyze text request
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next
 */
export async function analyzeText(req, res, next) {
  try {
    // Validate request
    const validationErrors = validateAnalyzeRequest(req.body);
    if (validationErrors) {
      throw createValidationError('Invalid request body', { errors: validationErrors });
    }
    
    const { texts, subscription_id, user_id, date, service } = req.body;
    
    // Generate trace ID for tracking
    const traceId = randomUUID();
    
    logger.info({
      requestId: req.id,
      traceId,
      prompts: texts.length,
      service: service || 'gemini'
    }, 'Processing BOE analysis request');
    
    // Fetch and parse BOE content
    const { boeContent, prompts } = await parseBOE({
      date,
      prompts: texts,
      requestId: req.id
    });
    
    // Analyze each prompt
    const analysisPromises = prompts.map(prompt => 
      analyzeBOEItems(boeContent.items, prompt, req.id, { service })
    );
    
    const analysisResults = await Promise.all(analysisPromises);
    
    // Prepare response structure
    const response = {
      trace_id: traceId,
      request: {
        texts: prompts,
        subscription_id,
        user_id
      },
      results: {
        boe_info: boeContent.boe_info,
        query_date: boeContent.query_date,
        results: analysisResults.map((result, index) => ({
          prompt: prompts[index],
          matches: result.matches || [],
          metadata: result.metadata || {}
        }))
      },
      metadata: {
        processing_time_ms: Date.now() - req.startTime,
        total_items_processed: boeContent.items.length,
        status: 'success'
      }
    };
    
    // Publish results to PubSub asynchronously
    publishResults(response).catch(error => {
      logger.error({
        requestId: req.id,
        traceId,
        error
      }, 'Failed to publish results to PubSub');
    });
    
    // Send response
    res.json(response);
  } catch (error) {
    // Pass to error handler
    next(error);
  }
}

/**
 * Handle test-analyze request
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next
 */
export async function testAnalyze(req, res, next) {
  try {
    // Reuse main analyze function with diagnostic flag
    req.body.diagnostic = true;
    
    // Continue to main analyze handler
    await analyzeText(req, res, next);
  } catch (error) {
    next(error);
  }
}