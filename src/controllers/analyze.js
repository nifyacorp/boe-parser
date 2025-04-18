/**
 * BOE analysis controller
 */
import { randomUUID } from 'crypto';
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

    const { texts, subscription_id, user_id, date, service, metadata } = req.body;
    
    // Extract user_id and subscription_id from metadata if not directly provided
    const effectiveUserId = user_id || metadata?.user_id || "";
    const effectiveSubscriptionId = subscription_id || metadata?.subscription_id || "";
    
    // Generate trace ID for tracking
    const traceId = randomUUID();
    
    console.log(`Processing BOE analysis request - Request ID: ${req.id}, Trace ID: ${traceId}, Prompts: ${texts.length}, User ID: ${effectiveUserId}, Subscription ID: ${effectiveSubscriptionId}, Service: gemini`);
    
    // Fetch and parse BOE content
    const { boeContent, prompts } = await parseBOE({
      date,
      prompts: texts,
      requestId: req.id
    });
    
    // Analyze each prompt - only using Gemini (HANI)
    const analysisPromises = prompts.map(prompt => 
      analyzeBOEItems(boeContent.items, prompt, req.id, { service: 'gemini' })
    );
    
    const analysisResults = await Promise.all(analysisPromises);
    
    // Prepare response structure with the extracted user_id and subscription_id
    const response = {
      trace_id: traceId,
      request: {
        texts: prompts,
        subscription_id: effectiveSubscriptionId,
        user_id: effectiveUserId
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
      console.error(`Failed to publish results to PubSub - Request ID: ${req.id}, Trace ID: ${traceId}, Error:`, error);
    });
    
    // Send response
    res.json(response);
  } catch (error) {
    // Pass to error handler
    next(error);
  }
}