/**
 * Shared schema definitions for PubSub messages
 * 
 * This file defines the message formats used for communication between services.
 * It can be imported in both the producer (BOE parser) and consumer (notification worker)
 * to ensure consistent message validation.
 */

/**
 * Message structure for BOE parser results
 * 
 * @typedef {Object} BoeParserResultMessage
 * @property {string} trace_id - Unique identifier for tracing the request
 * @property {Object} request - Request information
 * @property {string} request.subscription_id - ID of the subscription (required non-empty string)
 * @property {string} request.user_id - ID of the user (required non-empty string)
 * @property {string[]} request.texts - Array of prompts/search texts
 * @property {Object} results - Analysis results
 * @property {Object} results.boe_info - BOE metadata
 * @property {string} results.boe_info.publication_date - Publication date in YYYY-MM-DD format
 * @property {string} results.boe_info.source_url - Source URL
 * @property {string} results.query_date - Query date in YYYY-MM-DD format
 * @property {Array} results.results - Results for each prompt
 * @property {Object} metadata - Processing metadata
 * @property {number} metadata.processing_time_ms - Processing time in milliseconds
 * @property {number} metadata.total_items_processed - Total number of items processed
 * @property {string} metadata.status - Processing status
 */

/**
 * Validates a BOE parser result message
 * 
 * @param {Object} message - Message object to validate
 * @returns {boolean} True if valid, throws error if invalid
 */
export function validateBoeParserMessage(message) {
  // Check required fields
  if (!message) throw new Error('Message cannot be null or undefined');
  if (!message.trace_id) throw new Error('Missing required field: trace_id');
  
  // Validate request object
  if (!message.request) throw new Error('Missing required field: request');
  if (typeof message.request.subscription_id !== 'string') throw new Error('request.subscription_id must be a string');
  if (typeof message.request.user_id !== 'string') throw new Error('request.user_id must be a string');
  if (!Array.isArray(message.request.texts)) throw new Error('request.texts must be an array');
  
  // Validate results object
  if (!message.results) throw new Error('Missing required field: results');
  if (!message.results.boe_info) throw new Error('Missing required field: results.boe_info');
  if (!message.results.query_date) throw new Error('Missing required field: results.query_date');
  if (!Array.isArray(message.results.results)) throw new Error('results.results must be an array');
  
  // Validate metadata object
  if (!message.metadata) throw new Error('Missing required field: metadata');
  if (typeof message.metadata.processing_time_ms !== 'number') throw new Error('metadata.processing_time_ms must be a number');
  if (typeof message.metadata.total_items_processed !== 'number') throw new Error('metadata.total_items_processed must be a number');
  if (typeof message.metadata.status !== 'string') throw new Error('metadata.status must be a string');
  
  return true;
}

/**
 * Creates a default valid BOE parser message structure with placeholder values
 * 
 * @returns {BoeParserResultMessage} Default message structure
 */
export function createDefaultBoeParserMessage() {
  return {
    trace_id: '',
    request: {
      subscription_id: '',
      user_id: '',
      texts: []
    },
    results: {
      boe_info: {
        publication_date: '',
        source_url: ''
      },
      query_date: '',
      results: []
    },
    metadata: {
      processing_time_ms: 0,
      total_items_processed: 0,
      status: 'success'
    }
  };
}

export default {
  validateBoeParserMessage,
  createDefaultBoeParserMessage
}; 