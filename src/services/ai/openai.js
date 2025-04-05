/**
 * OpenAI service for BOE analysis
 */
import { getOpenAIClient } from './client.js';
import logger from '../../utils/logger.js';
import config from '../../config/config.js';
import { createSystemPrompt, createUserPrompt } from './prompts/openai.js';

/**
 * Create OpenAI API payload
 * @param {Array} boeItems - BOE items to analyze 
 * @param {string} prompt - User's search query
 * @param {number} totalItems - Total BOE items count
 * @returns {Object} - OpenAI API payload
 */
function createOpenAIPayload(boeItems, prompt, totalItems) {
  return {
    model: config.services.openai.model,
    messages: [
      {
        role: "system",
        content: createSystemPrompt()
      },
      {
        role: "user",
        content: createUserPrompt(boeItems, prompt, totalItems)
      }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
    max_tokens: 4096
  };
}

/**
 * Filter BOE items based on prompt keywords
 * @param {Array} boeItems - BOE items to filter
 * @param {string} prompt - User's search query
 * @returns {Array} - Filtered BOE items
 */
function filterRelevantItems(boeItems, prompt) {
  // Extract keywords from prompt (words with 5+ chars)
  const keywords = prompt.toLowerCase()
    .split(' ')
    .filter(word => word.length >= 5);
  
  // No meaningful keywords found
  if (keywords.length === 0) {
    return boeItems;
  }
  
  // Filter items
  return boeItems.filter(item => {
    if (!item.title) return false;
    const title = item.title.toLowerCase();
    return keywords.some(keyword => title.includes(keyword));
  });
}

/**
 * Analyze BOE items with OpenAI
 * @param {Array} boeItems - BOE items to analyze
 * @param {string} prompt - User's search query
 * @param {string} requestId - Request ID for logging
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeWithOpenAI(boeItems, prompt, requestId, options = {}) {
  try {
    // Check if there are BOE items to analyze
    if (!boeItems || boeItems.length === 0) {
      logger.warn({ requestId, prompt }, 'No BOE items to analyze. Returning empty result set.');
      return {
        matches: [],
        metadata: {
          model_used: config.services.openai.model,
          no_content_reason: "No BOE items available for analysis"
        }
      };
    }
    
    const startTime = Date.now();
    
    logger.info({
      requestId,
      contentSize: {
        itemCount: boeItems.length,
        contentSize: JSON.stringify(boeItems).length,
        querySize: prompt.length
      }
    }, 'Starting BOE analysis with OpenAI');
    
    // Get OpenAI client
    const client = getOpenAIClient();
    
    // Filter relevant items
    const filteredItems = filterRelevantItems(boeItems, prompt);
    
    // Use filtered items if available, otherwise use all
    let selectedItems = filteredItems.length > 0 ? filteredItems : boeItems;
    
    // Limit items to avoid exceeding token limits
    const MAX_ITEMS = 50;
    const limitedItems = selectedItems.length > MAX_ITEMS 
      ? selectedItems.slice(0, MAX_ITEMS) 
      : selectedItems;
    
    logger.info({
      requestId,
      originalItemCount: boeItems.length,
      filteredItemCount: filteredItems.length,
      finalItemCount: limitedItems.length
    }, 'Filtered and limited BOE items for OpenAI analysis');
    
    // Create API payload
    const payload = createOpenAIPayload(limitedItems, prompt, boeItems.length);
    
    // Make API request
    logger.info({
      requestId,
      model: config.services.openai.model,
      promptLength: JSON.stringify(payload).length,
      itemsCount: limitedItems.length
    }, 'Sending request to OpenAI API');
    
    const response = await client.chat.completions.create(payload);
    
    // Parse response
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(response.choices[0].message.content);
    } catch (error) {
      logger.error({
        requestId,
        error,
        content: response.choices[0]?.message?.content
      }, 'Failed to parse OpenAI response');
      
      jsonResponse = { matches: [] };
    }
    
    // Prepare final response
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    const finalResponse = {
      matches: jsonResponse.matches || [],
      metadata: {
        model_used: config.services.openai.model,
        processing_time_ms: processingTime,
        total_items_processed: boeItems.length,
        filtered_items_processed: limitedItems.length,
        completion_tokens: response.usage?.completion_tokens || 0,
        prompt_tokens: response.usage?.prompt_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0
      }
    };
    
    logger.info({
      requestId,
      matchesCount: finalResponse.matches.length,
      processingTime,
      tokens: response.usage
    }, 'Completed BOE analysis with OpenAI');
    
    return finalResponse;
  } catch (error) {
    logger.error({
      requestId,
      error,
      prompt
    }, 'Error analyzing BOE items with OpenAI');
    
    throw error;
  }
}