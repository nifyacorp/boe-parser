import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const MAX_CHUNK_SIZE = 25; // Reduced chunk size
const MAX_CONCURRENT_REQUESTS = 3; // Limit concurrent requests

let openai;

async function analyzeChunk(chunk, query, reqId) {
  try {
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a BOE (Boletín Oficial del Estado) analysis assistant. Analyze the provided BOE items and extract key information about announcements, resolutions, and other official communications. Return a structured JSON response with matches that include: document_type, issuing_body, title, dates, code, section, department, links, and a relevance score (0-1). Provide a concise summary for each match. Focus on finding the most relevant documents based on the user's query."
        },
        {
          role: "user",
          content: `User Query: ${query}\n\nBOE Content: ${JSON.stringify(chunk)}`
        }
      ],
      max_tokens: 500
    };

    logger.debug({ 
      reqId,
      payload,
      chunkSize: chunk.length
    }, 'OpenAI request payload');

    const response = await openai.chat.completions.create({
      ...payload
    });
    
    logger.debug({ 
      reqId, 
      fullResponse: response,
      rawResponse: response.choices[0].message.content,
      chunkSize: chunk.length
    }, 'Raw OpenAI response');

    try {
      return JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      logger.error({ 
        reqId, 
        error: parseError.message,
        rawResponse: response.choices[0].message.content 
      }, 'Failed to parse OpenAI response');
      throw parseError;
    }

  } catch (error) {
    logger.error({ reqId, error: error.message }, 'Chunk analysis failed');
    return { matches: [], metadata: { match_count: 0, max_relevance: 0 } };
  }
}

function chunkBOEContent(items) {
  const chunks = [];
  for (let i = 0; i < items.length; i += MAX_CHUNK_SIZE) {
    chunks.push(items.slice(i, i + MAX_CHUNK_SIZE));
  }
  return chunks;
}

function mergeResults(results) {
  const matches = [];
  let maxRelevance = 0;

  results.forEach(result => {
    if (result.matches) {
      matches.push(...result.matches);
      if (result.metadata?.max_relevance > maxRelevance) {
        maxRelevance = result.metadata.max_relevance;
      }
    }
  });

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
    if (!openai) {
      logger.debug({ reqId }, 'Initializing OpenAI client');
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
      }
      openai = new OpenAI({ apiKey });
      logger.debug({ reqId }, 'OpenAI client initialized');
    }

    // Parse the input to separate query from BOE content
    const match = text.match(/User Query: (.*?)\n\nBOE Content: (.*)/s);
    if (!match) {
      throw new Error('Invalid input format');
    }

    const [, query, boeContent] = match;
    const items = JSON.parse(boeContent);

    // Split BOE content into chunks
    const chunks = chunkBOEContent(items);
    logger.debug({ reqId, chunkCount: chunks.length }, 'Split BOE content into chunks');

    // Only process first two chunks for debugging
    const debugChunks = chunks.slice(0, 2);
    logger.debug({ 
      reqId, 
      firstChunk: debugChunks[0],
      secondChunk: debugChunks[1]
    }, 'Debug chunks content');

    // Process chunks in batches to limit concurrent requests
    const results = [];
    for (let i = 0; i < debugChunks.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = debugChunks.slice(i, i + MAX_CONCURRENT_REQUESTS);
      const batchResults = await Promise.all(
        batch.map(async (chunk, index) => {
          const batchIndex = i + index;
          logger.debug({ reqId, chunkIndex: batchIndex, itemCount: chunk.length }, 'Analyzing chunk');
          try {
            return await analyzeChunk(chunk, query, reqId);
          } catch (error) {
            logger.error({ reqId, chunkIndex: batchIndex, error: error.message }, 'Chunk analysis failed');
            return { matches: [], metadata: { match_count: 0, max_relevance: 0 } };
          }
        })
      );
      results.push(...batchResults);
    }

    // Merge results from all chunks
    const mergedResults = mergeResults(results);
    logger.debug({ reqId, totalMatches: mergedResults.matches.length }, 'Merged chunk results');

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