import { PubSub } from '@google-cloud/pubsub';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';
import { getSecret } from './secrets.js';

const pubsub = new PubSub();

let mainTopicName = null;
let mainSubscriptionName = null;
let dlqTopicName = null;
let dlqSubscriptionName = null;

async function initializePubSub() {
  try {
    [mainTopicName, mainSubscriptionName, dlqTopicName, dlqSubscriptionName] = await Promise.all([
      getSecret('PUBSUB_TOPIC_NAME'),
      getSecret('PUBSUB_SUBSCRIPTION_NAME'),
      getSecret('PUBSUB_DLQ_TOPIC_NAME'),
      getSecret('PUBSUB_DLQ_SUBSCRIPTION_NAME')
    ]);

    logger.info({
      mainTopic: mainTopicName,
      mainSubscription: mainSubscriptionName,
      dlqTopic: dlqTopicName,
      dlqSubscription: dlqSubscriptionName
    }, 'PubSub configuration initialized');
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack
    }, 'Failed to initialize PubSub configuration');
    throw error;
  }
}

export async function publishResults({ texts, context, results, processingTime, error = null }) {
  try {
    // Initialize PubSub configuration if not already done
    if (!mainTopicName) {
      await initializePubSub();
    }

    const message = {
      version: "1.0",
      processor_type: "boe",
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
        boe_info: results.boe_info,
        matches: results.results.map(result => ({
          prompt: result.prompt,
          documents: result.matches
        }))
      },

      metadata: {
        processing_time_ms: processingTime,
        total_matches: results.results.reduce((acc, r) => acc + r.matches.length, 0),
        status: error ? "error" : "success",
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