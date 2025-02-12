import { PubSub } from '@google-cloud/pubsub';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';

const pubsub = new PubSub();

// PubSub configuration from environment variables
const mainTopicName = process.env.PUBSUB_TOPIC_NAME || 'boe-analysis-notifications';
const mainSubscriptionName = process.env.PUBSUB_SUBSCRIPTION_NAME || 'boe-analysis-notifications-sub';
const dlqTopicName = process.env.PUBSUB_DLQ_TOPIC_NAME || 'boe-analysis-notifications-dlq';
const dlqSubscriptionName = process.env.PUBSUB_DLQ_SUBSCRIPTION_NAME || 'boe-analysis-notifications-dlq-sub';

// Log PubSub configuration on startup
logger.info({
  mainTopic: mainTopicName,
  mainSubscription: mainSubscriptionName,
  dlqTopic: dlqTopicName,
  dlqSubscription: dlqSubscriptionName
}, 'PubSub configuration initialized');

// Validate PubSub configuration
function validatePubSubConfig() {
  const missing = [];
  if (!process.env.PUBSUB_TOPIC_NAME) missing.push('PUBSUB_TOPIC_NAME');
  if (!process.env.PUBSUB_SUBSCRIPTION_NAME) missing.push('PUBSUB_SUBSCRIPTION_NAME');
  if (!process.env.PUBSUB_DLQ_TOPIC_NAME) missing.push('PUBSUB_DLQ_TOPIC_NAME');
  if (!process.env.PUBSUB_DLQ_SUBSCRIPTION_NAME) missing.push('PUBSUB_DLQ_SUBSCRIPTION_NAME');
  
  if (missing.length > 0) {
    logger.warn({ missing }, 'Using default PubSub configuration. Missing environment variables');
  }
}

// Validate configuration on startup
validatePubSubConfig();

export async function publishResults({ texts, context, results, processingTime, error = null }) {
  try {
    const message = {
      version: '1.0',
      processor_type: 'boe',
      timestamp: new Date().toISOString(),
      trace_id: randomUUID(),
      request: {
        subscription_id: context.subscription_id,
        processing_id: randomUUID(),
        user_id: context.user_id,
        prompts: texts
      },
      results: {
        query_date: results.query_date,
        matches: results.results.map(result => ({
          prompt: result.prompt,
          documents: result.matches.map(match => ({
            document_type: 'boe_document',
            title: match.title,
            summary: match.summary,
            relevance_score: match.relevance_score,
            links: {
              html: match.links.html,
              pdf: match.links.pdf
            }
          }))
        }))
      },
      metadata: {
        processing_time_ms: processingTime,
        total_matches: results.results.reduce((acc, r) => acc + r.matches.length, 0),
        status: error ? 'error' : 'success',
        error: error ? {
          message: error.message,
          code: error.code || 'UNKNOWN_ERROR',
          details: error.stack
        } : null
      }
    };

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
        original_message: message,
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