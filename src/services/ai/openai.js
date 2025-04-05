/**
 * OpenAI service for BOE analysis
 */
import { getOpenAIClient } from './client.js';
import config from '../../config/config.js';
import { createSystemPrompt, createUserPrompt } from './prompts/openai.js';
import OpenAI from 'openai';
import { createAIServiceError } from '../../utils/errors/AppError.js';
import { parseAIResponse } from './responseParser.js';

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
  const client = getOpenAIClient();
  const startTime = Date.now();

  // Replaced logger.debug with console.log (or remove if too verbose)
  // console.log(`Starting OpenAI analysis - Request ID: ${requestId}, Items: ${boeItems.length}`);

  const messages = [
    { role: 'system', content: createSystemPrompt() },
    { role: 'user', content: createUserPrompt(boeItems, prompt, boeItems.length) }
  ];

  try {
    const completion = await client.chat.completions.create({
      model: config.services.openai.model,
      messages: messages,
      temperature: 0.2,
      max_tokens: 4096, // Adjust as needed
      response_format: { type: "json_object" }, // Use JSON mode if available and applicable
    });

    const processingTime = Date.now() - startTime;

    if (!completion.choices || completion.choices.length === 0 || !completion.choices[0].message?.content) {
      // Replaced logger.error with console.error
      console.error(`OpenAI analysis failed: No response content - Request ID: ${requestId}, Full Completion:`, completion);
      throw createAIServiceError('OpenAI API returned no content', {
        code: 'OPENAI_NO_CONTENT',
        details: { finishReason: completion.choices?.[0]?.finish_reason }
      });
    }

    const responseText = completion.choices[0].message.content;
    const usage = completion.usage;
    const finishReason = completion.choices[0].finish_reason;

    // Replaced logger.debug with console.log (or remove if too verbose)
    // console.log(`OpenAI raw response received - Request ID: ${requestId}, Text Length: ${responseText.length}, Finish Reason: ${finishReason}`);

    const parsedResult = parseAIResponse(responseText); // Assumes response is JSON parsable due to response_format

    // Add metadata
    parsedResult.metadata = {
      model_used: config.services.openai.model,
      processing_time_ms: processingTime,
      usage: usage, // Include token usage
      finish_reason: finishReason, // Include finish reason
    };

    // Replaced logger.info with console.log
    console.log(`OpenAI analysis successful - Request ID: ${requestId}, Matches: ${parsedResult.matches.length}, Time: ${processingTime}ms`);

    return parsedResult;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    // Replaced logger.error with console.error
    console.error(`OpenAI analysis error - Request ID: ${requestId}, Time: ${processingTime}ms, Error:`, error);

    // Handle potential API errors
    if (error instanceof OpenAI.APIError) {
      throw createAIServiceError(`OpenAI API error: ${error.message}`, {
        code: 'OPENAI_API_ERROR',
        status: error.status,
        type: error.type,
        cause: error
      });
    }

    // Rethrow other errors or wrap them
    throw createAIServiceError(`OpenAI analysis failed: ${error.message}`, {
      code: 'OPENAI_ANALYSIS_FAILED',
      cause: error
    });
  }
}