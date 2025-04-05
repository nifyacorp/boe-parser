/**
 * Gemini AI service for BOE analysis
 */
import { getGeminiModel } from './client.js';
import logger from '../../utils/logger.js';
import config from '../../config/config.js';
import { createSystemPrompt, createContentPrompt } from './prompts/gemini.js';

/**
 * Extract keywords from prompt
 * @param {string} prompt - User's search prompt
 * @returns {Array} - Keywords array
 */
function extractKeywords(prompt) {
  return prompt.toLowerCase()
    .split(' ')
    .filter(word => word.length >= 5);
}

/**
 * Filter BOE items based on keywords
 * @param {Array} boeItems - BOE items to filter
 * @param {Array} keywords - Keywords to match
 * @returns {Array} - Filtered BOE items
 */
function filterRelevantItems(boeItems, keywords) {
  return boeItems.filter(item => {
    if (!item.title) return false;
    const title = item.title.toLowerCase();
    return keywords.some(keyword => title.includes(keyword));
  });
}

/**
 * Parse Gemini response text to JSON
 * @param {string} responseText - Gemini response text
 * @param {string} requestId - Request ID for logging
 * @returns {Object} - Parsed response
 */
function parseGeminiResponse(responseText, requestId) {
  try {
    // Extract JSON from response (in case there's any text wrapping it)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error({
        requestId,
        responseText: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
      }, 'No JSON object found in Gemini response');
      
      return { matches: [] };
    }
    
    const jsonString = jsonMatch[0];
    return JSON.parse(jsonString);
  } catch (error) {
    logger.error({
      requestId,
      error,
      responseText: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
    }, 'Failed to parse Gemini response');
    
    return { matches: [] };
  }
}

/**
 * Analyze BOE items with Gemini
 * @param {Array} boeItems - BOE items to analyze
 * @param {string} prompt - User's search prompt
 * @param {string} requestId - Request ID for logging
 * @param {Object} [options={}] - Analysis options
 * @returns {Promise<Object>} - Analysis results
 */
export async function analyzeWithGemini(boeItems, prompt, requestId, options = {}) {
  try {
    // Check if there are BOE items to analyze
    if (!boeItems || boeItems.length === 0) {
      logger.warn({ requestId, prompt }, 'No BOE items to analyze. Returning empty result set.');
      return {
        matches: [],
        metadata: {
          model_used: config.services.gemini.model,
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
    }, 'Starting BOE analysis with Gemini');
    
    // Get Gemini model
    const model = getGeminiModel();
    
    // Set generation config
    const generationConfig = {
      temperature: 0.2,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: "text/plain",
    };
    
    // Start chat session
    const chatSession = model.startChat({
      generationConfig,
      history: [
        {
          role: "user",
          parts: [{ text: createSystemPrompt(prompt) }]
        }
      ],
    });
    
    // Extract keywords and filter relevant items
    const keywords = extractKeywords(prompt);
    const filteredItems = filterRelevantItems(boeItems, keywords);
    
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
      finalItemCount: limitedItems.length,
      keywords
    }, 'Filtered and limited BOE items for Gemini analysis');
    
    // Create content prompt
    const contentPrompt = createContentPrompt(limitedItems, prompt, boeItems.length);
    
    // Send message to Gemini
    logger.info({
      requestId,
      model: config.services.gemini.model,
      promptLength: contentPrompt.length,
      itemsCount: limitedItems.length
    }, 'Sending request to Gemini API');
    
    const result = await chatSession.sendMessage(contentPrompt);
    const responseText = result.response.text();
    
    logger.info({
      requestId,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')
    }, 'Received response from Gemini');
    
    // Parse response
    const jsonResponse = parseGeminiResponse(responseText, requestId);
    
    // Prepare final response
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    const finalResponse = {
      matches: jsonResponse.matches || [],
      metadata: {
        model_used: config.services.gemini.model,
        processing_time_ms: processingTime,
        total_items_processed: boeItems.length,
        filtered_items_processed: limitedItems.length,
      }
    };
    
    logger.info({
      requestId,
      matchesCount: finalResponse.matches.length,
      processingTime
    }, 'Completed BOE analysis with Gemini');
    
    return finalResponse;
  } catch (error) {
    logger.error({
      requestId,
      error,
      prompt
    }, 'Error analyzing BOE items with Gemini');
    
    throw error;
  }
}