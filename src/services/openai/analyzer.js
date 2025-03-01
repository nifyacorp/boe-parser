import { logger } from '../../utils/logger.js';
import { getOpenAIClient } from './client.js';
import { processText } from '../textProcessor.js';

export async function analyzeChunk(chunk, query, reqId, requestPayload = {}) {
  try {
    logger.debug({ 
      reqId,
      itemCount: chunk.items.length,
      tokenCount: chunk.tokenCount,
      firstItemTitle: chunk.items[0]?.title || 'No title',
      requestPayload
    }, 'Processing chunk');

    const openai = getOpenAIClient(reqId);
    const cleanQuery = processText(query);
    const response = await openai.chat.completions.create(createAnalysisPayload(cleanQuery, chunk.items));
    return processResponse(response, reqId);
  } catch (error) {
    return handleAnalysisError(error, chunk.items, query, reqId);
  }
}

function createAnalysisPayload(query, chunk) {
  return {
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: getSystemPrompt()
      },
      {
        role: "user",
        content: `User Query: ${query}\n\nBOE Content: ${JSON.stringify(chunk)}`
      }
    ],
    response_format: { type: "json_object" }
  };
}

function getSystemPrompt() {
  return `You are a BOE (Boletín Oficial del Estado) analysis assistant. Analyze the provided BOE items and extract key information about announcements, resolutions, and other official communications. You must return a valid JSON object with the exact structure shown below.

REQUIRED RESPONSE FORMAT:
{
  "matches": [{
    "document_type": "string (RESOLUTION, ORDER, ROYAL_DECREE, LAW, ANNOUNCEMENT)",
    "issuing_body": "string",
    "title": "string (MUST be descriptive, concise, and informative - do not use generic titles)",
    "notification_title": "string (A short, user-friendly title for notification displays, MAX 80 chars)",
    "dates": {
      "document_date": "YYYY-MM-DD",
      "publication_date": "YYYY-MM-DD"
    },
    "code": "string",
    "section": "string",
    "department": "string",
    "links": {
      "pdf": "string",
      "html": "string"
    },
    "relevance_score": "number (0-1)",
    "summary": "string (A concise summary of the document's content for notifications)"
  }],
  "metadata": {
    "match_count": "number",
    "max_relevance": "number"
  }
}

CRITICAL REQUIREMENTS:
1. Response MUST be valid JSON - no markdown, no backticks, no explanations
2. All fields are required - use empty strings or 0 for missing values
3. Title field MUST be descriptive and specific to the content, not generic
4. notification_title should be a user-friendly version optimized for notification displays
5. Summary should be structured to provide clear, concise information for notifications`;
}

function processResponse(response, reqId) {
  const cleanContent = response.choices[0].message.content.trim()
    .replace(/^```json\s*/, '')
    .replace(/\s*```$/, '');

  try {
    const parsedResponse = JSON.parse(cleanContent);
    validateResponse(parsedResponse);
    
    logger.debug({
      reqId,
      matches: parsedResponse.matches.length
    }, 'Chunk analysis completed');

    return parsedResponse;
  } catch (parseError) {
    throw handleParseError(parseError, response, reqId);
  }
}

function validateResponse(response) {
  const validationErrors = [];
  
  if (!response.matches) {
    validationErrors.push('Missing matches array');
  } else if (!Array.isArray(response.matches)) {
    validationErrors.push('matches is not an array');
  }
  
  if (!response.metadata) {
    validationErrors.push('Missing metadata object');
  } else {
    if (typeof response.metadata.match_count !== 'number') {
      validationErrors.push('Invalid or missing match_count');
    }
    if (typeof response.metadata.max_relevance !== 'number') {
      validationErrors.push('Invalid or missing max_relevance');
    }
  }
  
  if (validationErrors.length > 0) {
    throw new Error(`Invalid response structure: ${validationErrors.join(', ')}`);
  }
}

function handleParseError(error, response, reqId) {
  logger.error({ 
    reqId,
    errorType: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    rawResponse: {
      content: response.choices[0].message.content,
      length: response.choices[0].message.content.length,
      firstChars: response.choices[0].message.content.substring(0, 100)
    }
  }, 'Failed to parse OpenAI response');
  return error;
}

function handleAnalysisError(error, chunk, query, reqId) {
  const errorDetails = {
    reqId,
    errorType: error.name,
    errorMessage: error.message,
    errorCode: error.code,
    errorStatus: error.status
  };

  if (error.response) {
    errorDetails.openaiError = {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data
    };
  }

  logger.error({ 
    ...errorDetails,
    context: {
      chunkSize: chunk.length,
      queryLength: query.length,
      modelUsed: "gpt-4o-mini",
      firstItemTitle: chunk[0]?.title || 'No title'
    }
  }, 'Chunk analysis failed');

  return { matches: [], metadata: { match_count: 0, max_relevance: 0 } };
}