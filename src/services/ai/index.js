/**
 * AI Services Module - Analyzes BOE items using AI
 */
import { analyzeWithGemini } from './gemini.js';
import { createServiceError } from '../../utils/errors/AppError.js';
import config from '../../config/config.js';

/**
 * Analyze BOE items with AI based on a prompt
 * @param {Array} items - BOE items to analyze
 * @param {string} prompt - Analysis prompt
 * @param {string} requestId - Request ID for tracing
 * @param {Object} options - Options including service (gemini, etc.)
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeBOEItems(items, prompt, requestId, options = {}) {
  const service = options.service || 'gemini';
  const promptLength = prompt?.length || 0;
  const itemsCount = items?.length || 0;
  
  let totalContentLength = 0;
  let totalEstimatedTokens = 0;
  
  // Calculate content length and estimated tokens
  if (items && items.length > 0) {
    items.forEach(item => {
      if (item.content) {
        totalContentLength += item.content.length;
      }
    });
    totalEstimatedTokens = Math.round(totalContentLength / 4); // Rough estimate: ~4 chars per token
  }
  
  const promptTokens = Math.round(promptLength / 4); // Rough estimate
  const totalTokens = totalEstimatedTokens + promptTokens;
  
  console.log(`Starting BOE analysis - Request ID: ${requestId}, Service: ${service}, Item Count: ${itemsCount}, Prompt Length: ${promptLength}`);
  console.log(`BOE analysis token estimates - Request ID: ${requestId}, Content Chars: ${totalContentLength}, Content Tokens: ${totalEstimatedTokens}, Prompt Tokens: ${promptTokens}, Total Tokens: ${totalTokens}`);
  
  try {
    // Currently only Gemini is supported
    if (service === 'gemini') {
      const result = await analyzeWithGemini(items, prompt, requestId, options);
      
      console.log(`BOE analysis completed successfully - Request ID: ${requestId}, Service: gemini, Matches Count: ${result.matches?.length || 0}, Processing Time: ${result.metadata?.processing_time_ms || 0}ms`);
      
      return result;
    } else {
      throw createServiceError(`Unsupported AI service: ${service}`);
    }
  } catch (error) {
    console.error(`Error in BOE analysis - Request ID: ${requestId}, Service: ${service}, Error:`, error);
    
    if (error.isOperational) {
      throw error; // Re-throw operational errors
    }
    
    throw createServiceError(`BOE analysis failed with service ${service}`, { 
      cause: error,
      service,
      prompt_length: promptLength,
      items_count: itemsCount
    });
  }
}