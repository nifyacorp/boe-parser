/**
 * AI service facade
 */
import { analyzeWithGemini } from './gemini.js';
import { analyzeWithOpenAI } from './openai.js';
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
  // Select AI service based on options or config
  const service = options.service || 'gemini';
  
  console.log(`Starting BOE analysis - Request ID: ${requestId}, Service: ${service}, Item Count: ${boeItems?.length || 0}, Prompt Length: ${prompt?.length || 0}`);
  
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
    
    console.log(`BOE analysis completed successfully - Request ID: ${requestId}, Service: ${service}, Matches Count: ${result.matches?.length || 0}, Processing Time: ${result.metadata?.processing_time_ms || 0}ms`);
    
    return result;
  } catch (error) {
    console.error(`BOE analysis failed - Request ID: ${requestId}, Service: ${service}, Prompt Length: ${prompt?.length || 0}, Error:`, error);
    
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