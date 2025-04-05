/**
 * Google PubSub integration module
 */
import { PubSub } from '@google-cloud/pubsub';
import { randomUUID } from 'crypto';
import config from '../config/config.js';
import { createPubSubError } from './errors/AppError.js';

// Create PubSub client
const pubsub = new PubSub({
  projectId: config.services.pubsub.projectId,
});

// PubSub topic names
const MAIN_TOPIC = config.services.pubsub.topicName;
const DLQ_TOPIC = `${MAIN_TOPIC}-dlq`;

// Log PubSub configuration on module import
console.log({
  mainTopic: MAIN_TOPIC,
  dlqTopic: DLQ_TOPIC,
  projectId: config.services.pubsub.projectId || 'local',
}, 'PubSub configuration initialized');

/**
 * Transform raw matches into standardized format
 * @param {Array} matches - Raw matches from analysis
 * @param {Array} prompts - Prompts used for analysis
 * @param {string} queryDate - Date of BOE query
 * @returns {Array} - Transformed matches in standardized format
 */
function transformMatches(matches, prompts = ['General information'], queryDate = new Date().toISOString().split('T')[0]) {
  if (!matches || matches.length === 0) {
    return [{
      prompt: prompts[0],
      documents: [],
    }];
  }

  return matches.map(match => ({
    prompt: match.prompt || prompts[0],
    documents: [{
      document_type: 'boe_document',
      title: match.title || 'No title',
      notification_title: match.notification_title || match.title || 'Notification',
      issuing_body: match.issuing_body || '',
      summary: match.summary || '',
      relevance_score: match.relevance_score || 0,
      links: match.links || { html: 'https://www.boe.es', pdf: '' },
      publication_date: match.publication_date || queryDate,
      section: match.section || 'general',
      bulletin_type: match.bulletin_type || 'BOE',
    }],
  }));
}

/**
 * Extract matches from various possible response structures
 * @param {Object} results - Analysis results object
 * @returns {Array} - Extracted matches
 */
function extractMatches(results) {
  if (!results) {
    return [];
  }

  if (Array.isArray(results.matches)) {
    return results.matches;
  }

  if (Array.isArray(results.results?.[0]?.matches)) {
    return results.results[0].matches;
  }

  if (Array.isArray(results.results)) {
    return results.results.flatMap(r => 
      Array.isArray(r.matches) ? r.matches.map(m => ({...m, prompt: r.prompt})) : []
    );
  }

  return [];
}

/**
 * Publish analysis results to PubSub
 * @param {Object} payload - Analysis payload
 * @returns {Promise<string>} - Message ID
 */
export async function publishResults(payload) {
  try {
    // Ensure trace ID for tracking
    const traceId = payload.trace_id || randomUUID();
    
    // Extract necessary data
    const results = payload.results || {};
    const request = payload.request || payload.context || {};
    const prompts = request.texts || payload.texts || ['General information'];
    const queryDate = results.query_date || new Date().toISOString().split('T')[0];
    
    // Extract matches
    const matches = extractMatches(results);
    
    // Transform matches to standardized format
    const transformedMatches = transformMatches(matches, prompts, queryDate);
    
    // Create standardized message
    const message = {
      version: '1.0',
      trace_id: traceId,
      processor_type: 'boe',
      timestamp: new Date().toISOString(),
      
      request: {
        subscription_id: request.subscription_id || 'unknown',
        user_id: request.user_id || 'unknown',
        processing_id: randomUUID(),
        prompts: prompts,
      },
      
      results: {
        query_date: queryDate,
        matches: transformedMatches,
      },
      
      metadata: {
        processing_time_ms: payload.metadata?.processing_time_ms || 0,
        total_items_processed: payload.metadata?.total_items_processed || 0,
        total_matches: matches.length,
        model_used: payload.metadata?.model_used || 'gemini-1.5-pro',
        status: payload.error ? 'error' : (payload.metadata?.status || 'success'),
        error: payload.error || payload.metadata?.error || null,
      },
    };
    
    // Log message structure (debug level)
    console.log({
      trace_id: traceId,
      subscription_id: message.request.subscription_id,
      user_id: message.request.user_id,
      matches_count: transformedMatches.length,
    }, 'Publishing PubSub message');
    
    // Publish to main topic
    const dataBuffer = Buffer.from(JSON.stringify(message));
    const messageId = await pubsub.topic(MAIN_TOPIC).publish(dataBuffer);
    
    console.log({
      messageId,
      topicName: MAIN_TOPIC,
      traceId,
    }, 'Published BOE analysis results to PubSub');

    return messageId;
  } catch (error) {
    console.error({
      error,
      topicName: MAIN_TOPIC,
    }, 'Failed to publish results to PubSub');

    // Attempt to publish to DLQ
    await publishToDLQ(payload, error);
    
    throw error;
  }
}

/**
 * Publish error to PubSub for monitoring
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @returns {Promise<string>} - Message ID
 */
export async function publishError(error, req) {
  try {
    const errorMessage = {
      version: '1.0',
      trace_id: req.id || randomUUID(),
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        code: error.code || 'INTERNAL_ERROR',
        statusCode: error.statusCode || 500,
        stack: error.stack,
        isOperational: error.isOperational || false,
      },
      request: {
        path: req.path,
        method: req.method,
        query: req.query,
        headers: {
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
        },
      },
    };
    
    const dataBuffer = Buffer.from(JSON.stringify(errorMessage));
    const messageId = await pubsub.topic(DLQ_TOPIC).publish(dataBuffer);
    
    console.log({
      messageId,
      topicName: DLQ_TOPIC,
      traceId: errorMessage.trace_id,
    }, 'Published error to PubSub');

    return messageId;
  } catch (pubsubError) {
    console.error({
      error: pubsubError,
      originalError: error.message,
    }, 'Failed to publish error to PubSub');
    
    return null;
  }
}

/**
 * Publish failed message to DLQ
 * @param {Object} originalPayload - Original payload that failed
 * @param {Error} error - Error that occurred
 * @returns {Promise<string>} - Message ID
 */
async function publishToDLQ(originalPayload, error) {
  try {
    const dlqMessage = {
      original_payload: originalPayload,
      error: {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      },
    };
    
    const dataBuffer = Buffer.from(JSON.stringify(dlqMessage));
    const messageId = await pubsub.topic(DLQ_TOPIC).publish(dataBuffer);
    
    console.log({
      messageId,
      topicName: DLQ_TOPIC,
    }, 'Published failed message to DLQ');

    return messageId;
  } catch (dlqError) {
    console.error({
      error: dlqError,
      originalError: error.message,
    }, 'Failed to publish to DLQ');
    
    return null;
  }
}