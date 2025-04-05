/**
 * BOE analysis controller
 */
import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';
import { parseBOE } from '../services/parser/index.js';
import { analyzeBOEItems } from '../services/ai/index.js';
import { publishResults } from '../utils/pubsub.js';

/**
 * Handle analyze text request
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next
 */
export async function analyzeText(req, res, next) {
  try {
    // Validation is now handled by middleware

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
    
    // TODO: Consider moving PubSub publishing to a dedicated service or event handler
    //       for better decoupling and potentially more robust error/retry handling.
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
    // Validation is implicitly handled because analyzeText is called
    req.body.diagnostic = true;
    
    // Continue to main analyze handler
    await analyzeText(req, res, next);
  } catch (error) {
    next(error);
  }
}