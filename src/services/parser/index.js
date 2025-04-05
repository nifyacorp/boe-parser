/**
 * Parser service facade
 */
import { fetchBOEContent } from './scraper.js';
import { normalizePrompts } from './textProcessor.js';
import logger from '../../utils/logger.js';

/**
 * Fetch and process BOE content with prompts
 * @param {Object} options - Parser options
 * @param {string} options.date - Date in YYYY-MM-DD format
 * @param {Array|string} options.prompts - Analysis prompts
 * @param {string} options.requestId - Request ID for logging
 * @returns {Promise<Object>} - Parsed content and normalized prompts
 */
export async function parseBOE(options = {}) {
  const { date, prompts = [], requestId } = options;
  
  try {
    // Fetch BOE content
    const boeContent = await fetchBOEContent(date, requestId);
    
    // Normalize prompts
    const normalizedPrompts = normalizePrompts(prompts);
    
    logger.info({
      requestId,
      itemsCount: boeContent.items.length,
      promptsCount: normalizedPrompts.length,
      date: boeContent.query_date
    }, 'BOE content parsed successfully');
    
    return {
      boeContent,
      prompts: normalizedPrompts
    };
  } catch (error) {
    logger.error({
      requestId,
      error,
      date
    }, 'Failed to parse BOE content');
    
    throw error;
  }
}