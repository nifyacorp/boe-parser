import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const MAX_CHUNK_SIZE = 50; // Maximum number of BOE items per chunk

let openai;

async function analyzeChunk(chunk, query, reqId) {
  const response = await openai.chat.completions.create({
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
  });

  return JSON.parse(response.choices[0].message.content);
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

    // Analyze each chunk
    const chunkResults = await Promise.all(
      chunks.map(async (chunk, index) => {
        logger.debug({ reqId, chunkIndex: index, itemCount: chunk.length }, 'Analyzing chunk');
        return analyzeChunk(chunk, query, reqId);
      })
    );

    // Merge results from all chunks
    const mergedResults = mergeResults(chunkResults);
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