import { logger } from '../utils/logger.js';

export function processText(text) {
  try {
    // Remove extra whitespace and normalize text
    const cleanText = text
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleanText;
  } catch (error) {
    logger.error('Error processing text', { error: error.message });
    throw new Error(`Failed to process text: ${error.message}`);
  }
}
