/**
 * AI service facade
 */
import { analyzeWithGemini } from './gemini.js';
import { analyzeWithOpenAI } from './openai.js';
import logger from '../../utils/logger.js';
import { createChildLogger } from '../../utils/logger.js';
import config from '../../config/config.js';

/**
 * Analyze BOE items using the specified AI service
 * @param {Array} boeItems - BOE items to analyze
 * @param {string} prompt - User's search query
 * @param {string} requestId - Request ID for logging
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeBOEItems(boeItems, prompt, requestId, options = {}) {
  // Create request-specific logger
  const requestLogger = createChildLogger({ requestId });
  
  // Select AI service based on options or config
  const service = options.service || 'gemini';
  
  requestLogger.info({
    service,
    itemCount: boeItems?.length || 0,
    promptLength: prompt?.length || 0
  }, 'Starting BOE analysis');
  
  try {
    let result;
    
    switch (service) {
      case 'openai':
        result = await analyzeWithOpenAI(boeItems, prompt, requestId, options);
        break;
      case 'gemini':
      default:
        result = await analyzeWithGemini(boeItems, prompt, requestId, options);
        break;
    }
    
    requestLogger.info({
      service,
      matchesCount: result.matches?.length || 0,
      processingTime: result.metadata?.processing_time_ms || 0
    }, 'BOE analysis completed successfully');
    
    return result;
  } catch (error) {
    requestLogger.error({
      error,
      service,
      promptLength: prompt?.length || 0
    }, 'BOE analysis failed');
    
    // Return error response
    return {
      matches: [],
      metadata: {
        model_used: service === 'openai' ? config.services.openai.model : config.services.gemini.model,
        status: 'error',
        error: {
          message: error.message,
          code: error.code || 'SERVICE_ERROR'
        }
      }
    };
  }
}