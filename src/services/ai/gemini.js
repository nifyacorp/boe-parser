/**
 * Gemini AI service for BOE analysis
 */
import { getGeminiModel } from './client.js';
import config from '../../config/config.js';
import { createSystemPrompt, createContentPrompt } from './prompts/gemini.js';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { createExternalApiError, createServiceError } from '../../utils/errors/AppError.js';

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
      console.error({
        requestId,
        responseText: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
      }, 'No JSON object found in Gemini response');
      throw createServiceError('No JSON object found in Gemini response', { responseTextPreview: responseText.substring(0, 500) });
    }
    
    const jsonString = jsonMatch[0];
    return JSON.parse(jsonString);
  } catch (error) {
    console.error({
      requestId,
      error,
      responseText: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
    }, 'Failed to parse Gemini response');
    
    if (error instanceof Error && error.code && error.isOperational) {
        throw error;
    }
    throw createServiceError('Failed to parse Gemini response', { cause: error, responseTextPreview: responseText.substring(0, 500) });
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
  const model = getGeminiModel();
  const startTime = Date.now();

  // console.log(`Starting Gemini analysis - Request ID: ${requestId}, Items: ${boeItems.length}`);

  const generationConfig = {
    temperature: 0.2,
    topK: 1,
    topP: 1,
    maxOutputTokens: 8192,
  };

  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];

  const systemMessage = createSystemPrompt(prompt);
  const contentMessage = createContentPrompt(boeItems, prompt, boeItems.length);

  const parts = [
    { text: systemMessage },
    { text: contentMessage },
  ];

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig,
      safetySettings,
    });

    const processingTime = Date.now() - startTime;

    if (!result.response) {
      // console.error(`Gemini analysis failed: No response object - Request ID: ${requestId}, Full Result:`, result);
      console.error(`Gemini analysis failed: No response object - Request ID: ${requestId}, Full Result:`, result);
      throw createExternalApiError('Gemini API returned no response object', { code: 'GEMINI_NO_RESPONSE', details: result, service: 'Gemini' });
    }

    const response = result.response;
    const responseText = response.text();

    // console.log(`Gemini raw response received - Request ID: ${requestId}, Text Length: ${responseText.length}`);

    const parsedResult = parseGeminiResponse(responseText, requestId);

    // Add metadata
    parsedResult.metadata = {
      model_used: config.services.gemini.model,
      processing_time_ms: processingTime,
      usage: response.usageMetadata, // Include usage if available
      finish_reason: response.finishReason, // Include finish reason
      safety_ratings: response.safetyRatings, // Include safety ratings
    };

    // console.log(`Gemini analysis successful - Request ID: ${requestId}, Matches: ${parsedResult.matches.length}, Time: ${processingTime}ms`);
    console.log(`Gemini analysis successful - Request ID: ${requestId}, Matches: ${parsedResult.matches.length}, Time: ${processingTime}ms`);

    return parsedResult;

  } catch (error) {
    const processingTime = Date.now() - startTime;
    // console.error(`Gemini analysis error - Request ID: ${requestId}, Time: ${processingTime}ms, Error:`, error);
    console.error(`Gemini analysis error - Request ID: ${requestId}, Time: ${processingTime}ms, Error:`, error);

    if (error instanceof Error && error.code && error.isOperational) {
        throw error;
    }
    // Handle potential API errors (e.g., rate limits, blocked prompts)
    if (error instanceof GoogleGenerativeAI) { // Check specific error types if available
      throw createExternalApiError(`Gemini API error: ${error.message}`, {
        code: 'GEMINI_API_ERROR',
        status: error.status, // Or relevant error code/status
        cause: error,
        service: 'Gemini'
      });
    } else if (error.finishReason && error.finishReason !== 'STOP') {
      // Handle cases where generation finished due to safety, length, etc.
      throw createExternalApiError(`Gemini generation finished unexpectedly: ${error.finishReason}`, {
        code: 'GEMINI_FINISH_REASON_ERROR',
        details: { finishReason: error.finishReason, safetyRatings: error.safetyRatings },
        cause: error,
        service: 'Gemini'
      });
    }

    // Wrap other unexpected errors as ServiceError
    throw createServiceError(`Gemini analysis failed: ${error.message}`, {
      code: 'GEMINI_ANALYSIS_FAILED',
      cause: error
    });
  }
}