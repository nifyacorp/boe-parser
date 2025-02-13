import { logger } from '../../utils/logger.js';
import { chunkBOEContent, getChunksToProcess } from './chunker.js';
import { analyzeChunk } from './analyzer.js';
import { mergeResults } from './merger.js';
import { MAX_CONCURRENT_REQUESTS } from './config.js';

export async function analyzeWithOpenAI(text, reqId) {
  try {
    // Parse the input to separate query from BOE content
    const match = text.match(/User Query: (.*?)\n\nBOE Content: (.*)/s);
    if (!match) {
      throw new Error('Invalid input format');
    }

    const [, query, boeContent] = match;
    const items = JSON.parse(boeContent);

    // Split BOE content into chunks and determine which to process
    const chunks = chunkBOEContent(items);
    const chunksToProcess = getChunksToProcess(chunks, reqId);

    // Process chunks in batches to limit concurrent requests
    const results = await processBatches(chunksToProcess, query, reqId);

    // Merge results from all chunks
    const mergedResults = mergeResults(results);
    logger.info({ 
      reqId, 
      totalMatches: mergedResults.matches.length,
      processedChunks: results.length,
      totalChunks: chunks.length
    }, 'Analysis completed');

    return mergedResults;
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

async function processBatches(chunks, query, reqId) {
  const results = [];
  const isDevMode = process.env.NODE_ENV === 'development';

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_REQUESTS) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT_REQUESTS);
    
    // Add delay between batches to avoid rate limits
    if (i > 0 && !isDevMode) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const batchResults = await Promise.all(
      batch.map(async (chunk, index) => {
        const batchIndex = i + index;
        logger.info({ 
          reqId, 
          currentChunk: batchIndex + 1, 
          totalChunks: chunks.length,
          itemsInChunk: chunk.length
        }, 'Processing chunk');
        
        try {
          const result = await analyzeChunk(chunk, query, reqId);
          if (!result || !result.matches) {
            throw new Error('Invalid response from OpenAI');
          }
          return result;
        } catch (error) {
          logger.error({ 
            reqId, 
            chunkIndex: batchIndex, 
            error: error.message,
            errorType: error.name,
            errorStack: error.stack,
            chunk: chunk.slice(0, 2)
          }, 'Chunk analysis failed');
          return { matches: [], metadata: { match_count: 0, max_relevance: 0 } };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}