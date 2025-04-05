/**
 * Text processing utilities
 */
import logger from '../../utils/logger.js';
import { createServiceError } from '../../utils/errors/AppError.js';

/**
 * Clean and normalize text
 * @param {string} text - Text to process
 * @returns {string} - Processed text
 */
export function cleanText(text) {
  if (!text) return '';
  
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Process text for analysis
 * @param {string} text - Text to process
 * @returns {string} - Processed text
 */
export function processText(text) {
  try {
    if (!text) {
      return '';
    }
    
    // Normalize text
    return cleanText(text);
  } catch (error) {
    logger.error({ error }, 'Error processing text');
    throw createServiceError(`Failed to process text: ${error.message}`);
  }
}

/**
 * Normalize an array of text prompts
 * @param {Array|string} texts - Text or array of texts to process
 * @returns {Array} - Array of processed texts
 */
export function normalizePrompts(texts) {
  try {
    // Handle single string
    if (typeof texts === 'string') {
      return [processText(texts)].filter(Boolean);
    }
    
    // Handle array
    if (Array.isArray(texts)) {
      return texts.map(processText).filter(Boolean);
    }
    
    // Default empty array
    return [];
  } catch (error) {
    logger.error({ error }, 'Error normalizing text prompts');
    throw createServiceError(`Failed to normalize prompts: ${error.message}`);
  }
}