import { logger } from '../../utils/logger.js';
import { analyzeWithoutChunking } from './analyzer.js';

export async function analyzeWithOpenAI(text, reqId, requestPayload = {}) {
  try {
    // Parse the input to separate query from BOE content
    const match = text.match(/User Query: (.*?)\n\nBOE Content: (.*)/s);
    if (!match) {
      throw new Error('Invalid input format');
    }

    const [, query, boeContent] = match;
    const items = JSON.parse(boeContent);

    // Log information about the content to be analyzed
    logger.info({ 
      reqId, 
      contentSize: {
        itemCount: items.length,
        contentSize: boeContent.length,
        querySize: query.length
      }
    }, 'Starting BOE analysis with gpt-4o-mini (200K context)');

    // Process all BOE items in a single request using gpt-4o-mini's large context window
    const result = await analyzeWithoutChunking(items, query, reqId, requestPayload);
    
    logger.info({ 
      reqId, 
      totalMatches: result.matches.length,
      processingTime: Date.now() - new Date(requestPayload.startTime || Date.now()).getTime()
    }, 'Analysis completed successfully');

    return result;
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