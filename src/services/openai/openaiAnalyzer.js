import { getOpenAIClient } from './openaiClient.js';
import { createOpenAIPayload } from './openaiPayload.js';
import { parseAndValidateResponse } from './openaiResponse.js';
import { logger } from '../../utils/logger.js';

async function analyzeWithOpenAIInternal(text, reqId) {
  try {
    // Log the complete items before sending to OpenAI
    logger.debug({ 
      reqId, 
      completeItems: JSON.parse(text.match(/BOE Content: (.*)/s)[1])
    }, 'Complete BOE items before sending to OpenAI');

    const openai = await getOpenAIClient(reqId);

    // Parse the input to separate query from BOE content
    const match = text.match(/User Query: (.*?)\n\nBOE Content: (.*)/s);
    if (!match) {
      throw new Error('Invalid input format');
    }

    const [, query, boeContent] = match;
    const items = JSON.parse(boeContent);

    logger.debug({ reqId, itemCount: items.length }, 'Starting OpenAI analysis with all items');

    const payload = createOpenAIPayload(query, items);

    logger.debug({ 
      reqId, 
      msg: 'OpenAI request payload',
      payload: JSON.stringify(payload, null, 2)
    }, 'OpenAI request payload');

    const response = await openai.chat.completions.create(payload);
    
    logger.debug({ 
      reqId,
      responseId: response.id,
      model: response.model,
      content: response.choices[0].message.content,
      finishReason: response.choices[0].finish_reason,
      usage: response.usage
    }, 'Raw OpenAI response');
    
    return parseAndValidateResponse(response, reqId);

  } catch (error) {
    // Detailed error logging based on error type
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
        queryLength: query.length,
        modelUsed: "gpt-4o-mini",
        totalItems: items.length,
        firstItemTitle: items[0]?.title || 'No title'
      }
    }, 'Chunk analysis failed');

    return { matches: [], metadata: { match_count: 0, max_relevance: 0 } };
  }
}

function mergeResults(result) {
  if (!result) {
    return { matches: [], metadata: { match_count: 0, max_relevance: 0 } };
  }
  
  const matches = result.matches || [];
  const maxRelevance = result.metadata?.max_relevance || 0;

  // Sort matches by relevance score in descending order
  matches.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

  return {
    matches,
    metadata: {
      match_count: matches.length,
      max_relevance: maxRelevance
    }
  };
}

export async function analyzeWithOpenAI(text, reqId) {
  try {
    const analysis = await analyzeWithOpenAIInternal(text, reqId);
    return mergeResults(analysis);
  } catch (error) {
    logger.error({ 
      reqId,
      error: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.status
    }, 'Error analyzing with OpenAI');
    throw new Error(`Failed to analyze with OpenAI: ${error.message}`);
  }
}
