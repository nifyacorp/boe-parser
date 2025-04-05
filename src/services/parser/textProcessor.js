/**
 * Text processing utilities for parser
 */

/**
 * Clean and normalize text content
 * - Trim whitespace
 * - Remove excessive newlines/spaces
 * @param {string} text - Input text
 * @returns {string} - Processed text
 */
export function processTextContent(text) {
  if (typeof text !== 'string' || !text) {
    return '';
  }
  try {
    // Trim leading/trailing whitespace
    let processed = text.trim();
    // Replace multiple whitespace characters (including newlines) with a single space
    processed = processed.replace(/\s+/g, ' ');
    return processed;
  } catch (error) {
    // Replaced logger.error with console.error
    console.error('Error processing text content:', { error: error.message, inputTextStart: text.substring(0, 100) });
    return text; // Return original text on error
  }
}

/**
 * Normalize prompts array
 * @param {Array|string} prompts - Input prompts
 * @returns {Array<string>} - Normalized array of non-empty prompts
 */
export function normalizePrompts(prompts) {
  try {
    if (Array.isArray(prompts)) {
      return prompts.map(p => String(p).trim()).filter(p => p.length > 0);
    } else if (typeof prompts === 'string' && prompts.trim().length > 0) {
      return [prompts.trim()];
    }
    return [];
  } catch (error) {
    // Replaced logger.error with console.error
    console.error('Error normalizing text prompts:', { error: error.message, inputPrompts: prompts });
    return []; // Return empty array on error
  }
}