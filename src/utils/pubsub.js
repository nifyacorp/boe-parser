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
    
    // Create a standardized message structure that the notification worker expects
    // Based on validation warnings, we need to include all expected fields
    const message = {
      version: '1.0',
      trace_id: traceId,
      processor_type: 'boe',
      timestamp: new Date().toISOString(),
      
      // Request details
      request: {
        subscription_id: payload.request?.subscription_id || payload.context?.subscription_id || 'unknown',
        user_id: payload.request?.user_id || payload.context?.user_id || 'unknown',
        processing_id: randomUUID(),
        prompts: payload.request?.texts || payload.texts || ['General information']
      },
      
      // Processing results with matches for the notification worker to process
      results: {
        query_date: new Date().toISOString().split('T')[0],
        boe_info: {
          issue_number: payload.boe_info?.issue_number || 'N/A',
          publication_date: payload.boe_info?.publication_date || new Date().toISOString().split('T')[0],
          source_url: payload.boe_info?.source_url || 'https://www.boe.es'
        },
        matches: payload.results?.matches?.map(match => ({
          document_type: match.document_type || 'OTHER',
          title: match.title || 'No title',
          notification_title: match.notification_title || match.title || 'Notification',
          issuing_body: match.issuing_body || '',
          summary: match.summary || '',
          relevance_score: match.relevance_score || 0,
          prompt: match.prompt || payload.request?.texts?.[0] || 'General information',
          links: match.links || { html: '', pdf: '' }
        })) || []
      },
      
      // Metadata about the processing
      metadata: {
        processing_time_ms: payload.metadata?.processing_time_ms || 0,
        total_items_processed: payload.metadata?.total_items_processed || 0,
        total_matches: payload.results?.matches?.length || 0,
        model_used: payload.metadata?.model_used || "gemini-2.0-pro-exp-02-05",
        status: payload.metadata?.status || 'success',
        error: null
      }
    };
    
    // Handle error case
    if (payload.error || payload.metadata?.error) {
      message.metadata.error = payload.error || payload.metadata?.error;
      message.metadata.status = "error";
    }
    
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