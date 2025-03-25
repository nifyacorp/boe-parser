import { PubSub } from '@google-cloud/pubsub';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';

const pubsub = new PubSub({
  projectId: process.env.GOOGLE_CLOUD_PROJECT
});

// PubSub configuration from environment variables
const mainTopicName = process.env.PUBSUB_TOPIC_NAME || 'processor-results';
const dlqTopicName = process.env.PUBSUB_DLQ_TOPIC_NAME || 'processor-results-dlq';

// Log PubSub configuration on startup
logger.info({
  mainTopic: mainTopicName,
  dlqTopic: dlqTopicName
}, 'PubSub configuration initialized');

export async function publishResults(payload) {
  try {
    // Ensure we have a trace ID for tracking
    const traceId = payload.trace_id || randomUUID();
    
    // NOTE: This is a completely new implementation that exactly follows the 
    // format expected by the notification worker based on validation warnings
    
    // Extract the flat matches array from results if it exists
    let matches = [];
    
    // Try different paths to find matches
    if (Array.isArray(payload.results?.matches)) {
      matches = payload.results.matches;
    } else if (Array.isArray(payload.results?.results?.[0]?.matches)) {
      matches = payload.results.results[0].matches;
    } else if (payload.results?.results) {
      // Extract matches from all results
      matches = payload.results.results.flatMap(r => 
        Array.isArray(r.matches) ? r.matches.map(m => ({...m, prompt: r.prompt})) : []
      );
    }
    
    // Ensure we have the query date (today if not specified)
    const queryDate = payload.results?.query_date || new Date().toISOString().split('T')[0];
    
    // Ensure we have BOE info
    const boeInfo = payload.results?.boe_info || {
      issue_number: 'N/A',
      publication_date: queryDate,
      source_url: 'https://www.boe.es'
    };
    
    // Get subscription ID and user ID from payload
    const subscriptionId = payload.request?.subscription_id || payload.context?.subscription_id || 'unknown';
    const userId = payload.request?.user_id || payload.context?.user_id || 'unknown';
    
    // Get prompts from payload
    const prompts = payload.request?.texts || payload.texts || ['General information'];
    
    // Create the message structure that EXACTLY matches what the notification worker expects
    const message = {
      // Required version field
      version: '1.0',
      trace_id: traceId,
      processor_type: 'boe',
      timestamp: new Date().toISOString(),
      
      // Request details with required fields
      request: {
        subscription_id: subscriptionId,
        user_id: userId,
        processing_id: randomUUID(),
        prompts: prompts
      },
      
      // Results section with required query_date
      results: {
        query_date: queryDate,
        boe_info: boeInfo,
        // Convert results to the expected format for the notification worker
        results: [
          {
            prompt: prompts[0] || 'General information',
            matches: matches.map(match => ({
              document_type: match.document_type || 'OTHER',
              title: match.title || 'No title',
              notification_title: match.notification_title || match.title || 'Notification',
              issuing_body: match.issuing_body || '',
              summary: match.summary || '',
              relevance_score: match.relevance_score || 0,
              links: match.links || { html: '', pdf: '' }
            }))
          }
        ]
      },
      
      // Metadata with required fields
      metadata: {
        processing_time_ms: payload.metadata?.processing_time_ms || 0,
        total_items_processed: payload.metadata?.total_items_processed || 0,
        total_matches: matches.length,
        model_used: payload.metadata?.model_used || "gemini-2.0-pro-exp-02-05",
        status: payload.metadata?.status || 'success',
        error: null
      }
    };
    
    // Log the exact message structure we're sending (for debugging)
    logger.debug({
      pubsub_message: JSON.stringify(message, null, 2).substring(0, 1000) + (JSON.stringify(message).length > 1000 ? '...' : ''),
      trace_id: traceId,
      subscription_id: subscriptionId,
      user_id: userId,
      matches_count: matches.length
    }, 'PubSub message structure');
    
    // Handle error case
    if (payload.error || payload.metadata?.error) {
      message.metadata.error = payload.error || payload.metadata?.error;
      message.metadata.status = "error";
    }
    
    // Create the buffer for publishing
    const dataBuffer = Buffer.from(JSON.stringify(message));
    
    // Publish to main topic
    const messageId = await pubsub.topic(mainTopicName).publish(dataBuffer);
    
    logger.info({
      messageId,
      topicName: mainTopicName,
      traceId: message.trace_id
    }, 'Published BOE analysis results to PubSub');

    return messageId;
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      topicName: mainTopicName
    }, 'Failed to publish results to PubSub');

    // Attempt to publish to DLQ if main publish fails
    try {
      const dlqMessage = {
        original_payload: payload,
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        }
      };
      
      const dlqMessageId = await pubsub.topic(dlqTopicName).publish(
        Buffer.from(JSON.stringify(dlqMessage))
      );
      
      logger.info({
        messageId: dlqMessageId,
        topicName: dlqTopicName
      }, 'Published failed message to DLQ');
    } catch (dlqError) {
      logger.error({
        error: dlqError.message,
        stack: dlqError.stack,
        originalError: error.message
      }, 'Failed to publish to DLQ');
    }

    throw error;
  }
}