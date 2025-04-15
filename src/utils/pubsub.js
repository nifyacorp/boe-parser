/**
 * Google PubSub integration module
 */
import { PubSub } from '@google-cloud/pubsub';
import { randomUUID } from 'crypto';
import config from '../config/config.js';
import { createServiceError } from './errors/AppError.js';

let pubsubClient;
let mainTopicClient;
let errorTopicClient;

/**
 * Get Pub/Sub client instance
 */
function getClient() {
  if (!pubsubClient) {
    // Use projectId from the dedicated gcp section in config
    if (!config.gcp.projectId) {
        console.warn('GCP Project ID not configured (config.gcp.projectId), PubSub might not work correctly.');
        // Allow initialization without project ID, relying on library/environment inference
    }
    console.log(`Initializing Pub/Sub client for project: ${config.gcp.projectId || '(inferred)'}`);
    pubsubClient = new PubSub({
      projectId: config.gcp.projectId || undefined,
    });
  }
  return pubsubClient;
}

/**
 * Get Pub/Sub topic client for the main topic
 */
function getMainTopic() {
  const topicName = config.services.pubsub.topicId;
  if (!topicName) {
      throw new Error('Main Pub/Sub topic ID (config.services.pubsub.topicId) is not configured.');
  }
  if (!mainTopicClient) {
    mainTopicClient = getClient().topic(topicName);
  }
  return mainTopicClient;
}

/**
 * Get Pub/Sub topic client for the error/DLQ topic
 */
function getErrorTopic() {
  const topicName = config.services.pubsub.errorTopicId;
  if (!topicName) {
    // Not having an error topic might be acceptable
    return null;
  }
  if (!errorTopicClient) {
    errorTopicClient = getClient().topic(topicName);
  }
  return errorTopicClient;
}

/**
 * Publish a message to a Pub/Sub topic client
 * @param {Object} topicClient - Initialized Pub/Sub Topic client
 * @param {Object} data - Data payload (will be JSON stringified)
 * @param {Object} attributes - Optional message attributes
 * @returns {Promise<string>} - Message ID
 */
async function publishMessageInternal(topicClient, data, attributes = {}) {
  const dataBuffer = Buffer.from(JSON.stringify(data));
  const topicName = topicClient.name; // Get name for logging

  try {
    // Log data size and a preview of the content
    console.log('Publishing message details:', { 
      topicName,
      attributes, 
      dataSize: dataBuffer.length,
      contentPreview: JSON.stringify(data).substring(0, 200) + '...'
    });
    
    const messageId = await topicClient.publishMessage({ data: dataBuffer, attributes });
    console.log(`Message ${messageId} published successfully to topic ${topicName}.`);
    return messageId;
  } catch (error) {
    console.error(`Failed to publish message to topic ${topicName}:`, { error, attributes });
    throw createServiceError(`Failed to publish message to Pub/Sub topic ${topicName}`, {
      cause: error,
      topic: topicName,
      attributes,
    });
  }
}

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
 * Publish BOE analysis results to the main topic
 * @param {Object} results - Analysis results object
 * @returns {Promise<string|null>} - Message ID or null if topic not configured
 */
export async function publishResults(results) {
  let topic;
  try {
      topic = getMainTopic();
  } catch (configError) {
      console.warn(configError.message, 'Skipping publishing results.');
      return null;
  }

  // Add trace ID to attributes if available
  const attributes = {};
  if (results.trace_id) attributes.traceId = results.trace_id;
  if (results.request?.subscription_id) attributes.subscriptionId = results.request.subscription_id;
  if (results.request?.user_id) attributes.userId = results.request.user_id;

  console.log(`Publishing analysis results to topic: ${topic.name}`, { traceId: results.trace_id });
  
  // Log the message structure for debugging
  console.log('PubSub message structure:', {
    trace_id: results.trace_id,
    request: {
      subscription_id: results.request?.subscription_id,
      user_id: results.request?.user_id,
      texts: results.request?.texts?.map(t => t.substring(0, 30) + (t.length > 30 ? '...' : ''))
    },
    results_summary: {
      boe_info: results.results?.boe_info,
      query_date: results.results?.query_date,
      results_count: results.results?.results?.length || 0,
      total_matches: results.results?.results?.reduce((sum, r) => sum + (r.matches?.length || 0), 0) || 0
    },
    metadata: results.metadata
  });

  try {
    return await publishMessageInternal(topic, results, attributes);
  } catch (error) {
    // Error is already logged in publishMessageInternal
    console.error(`Failed to publish analysis results - Trace ID: ${results.trace_id}`, { error });
    // Optionally, try sending to DLQ/Error topic here? For now, just rethrow.
    throw error;
  }
}

/**
 * Publish error details to the configured error topic
 * @param {Object} errorContext - Contextual information about the error
 * @returns {Promise<string|null>} - Message ID or null if error topic not configured or publishing fails
 */
export async function publishError(errorContext) {
  const topic = getErrorTopic();
  if (!topic) {
    // console.log('Error Pub/Sub topic not configured. Skipping error publishing.');
    return null;
  }

  const attributes = { service: 'boe-parser' };
  if (errorContext.request?.id) attributes.requestId = errorContext.request.id;

  console.log(`Publishing error details to topic: ${topic.name}`, { requestId: errorContext.request?.id });

  try {
    return await publishMessageInternal(topic, errorContext, attributes);
  } catch (error) {
    // Avoid infinite loop if publishing the error fails
    console.error('CRITICAL: Failed to publish error details to Pub/Sub', { originalErrorContext: errorContext, publishError: error });
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
    const messageId = await pubsubClient.topic(config.services.pubsub.errorTopicId).publish(dataBuffer);
    
    console.log({
      messageId,
      topicName: config.services.pubsub.errorTopicId,
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