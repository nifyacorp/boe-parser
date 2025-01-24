import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const MAX_CHUNK_SIZE = 25; // Reduced chunk size
const MAX_CONCURRENT_REQUESTS = 3; // Limit concurrent requests

// Define expected response structure for validation
const responseSchema = {
  matches: [{
    document_type: ['RESOLUTION', 'ORDER', 'ROYAL_DECREE', 'LAW', 'ANNOUNCEMENT', 'OTHER'],
    issuing_body: '',
    title: '',
    dates: {
      document_date: '',
      publication_date: ''
    },
    code: '',
    section: '',
    department: '',
    links: {
      pdf: '',
      html: ''
    },
    relevance_score: 0,
    summary: ''
  }],
  metadata: {
    match_count: 0,
    max_relevance: 0
  }
};

let openai;

async function analyzeChunk(chunk, query, reqId) {
  try {
    const payload = {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a BOE (Boletín Oficial del Estado) analysis assistant. Analyze the provided BOE items and extract key information about announcements, resolutions, and other official communications. You must return a valid JSON object with the exact structure shown below.

REQUIRED RESPONSE FORMAT:
{
  "matches": [{
    "document_type": "string (RESOLUTION, ORDER, ROYAL_DECREE, LAW, ANNOUNCEMENT)",
    "issuing_body": "string",
    "title": "string",
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
    "summary": "string"
  }],
  "metadata": {
    "match_count": "number",
    "max_relevance": "number"
  }
}

CRITICAL REQUIREMENTS:
1. Response MUST be valid JSON - no markdown, no backticks, no explanations
2. All fields are required - use empty strings or 0 for missing values`
        },
        {
          role: "user",
          content: `User Query: ${query}\n\nBOE Content: ${JSON.stringify(chunk)}`
        }
      ],
      max_tokens: 500
      temperature: 0,
      response_format: { type: "json" }
    };

    logger.debug({ 
      reqId, 
      payload: {
        model: payload.model,
        messages: payload.messages,
        max_tokens: payload.max_tokens,
        temperature: payload.temperature,
        response_format: payload.response_format
      }
    }, 'OpenAI request payload');

    const response = await openai.chat.completions.create({
      ...payload
    });
    
    logger.debug({ 
      reqId, 
      response: {
        id: response.id,
        model: response.model,
        choices: response.choices,
        usage: response.usage,
        created: response.created
      }
    }, 'Raw OpenAI response');
    
    // Clean the response content
    let cleanContent = response.choices[0].message.content.trim();
    
    // Remove any markdown code block markers if present
    cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');

    try {
      const parsedResponse = JSON.parse(cleanContent);
      
      // Validate response structure
      if (!parsedResponse.matches || !Array.isArray(parsedResponse.matches) || !parsedResponse.metadata) {
        throw new Error('Invalid response structure');
      }
      
      logger.debug({
        reqId,
        parsedResponse,
        matchCount: parsedResponse.matches.length,
        maxRelevance: parsedResponse.metadata.max_relevance
      }, 'Successfully parsed OpenAI response');
      return parsedResponse;
    } catch (parseError) {
      logger.error({ 
        reqId, 
        error: parseError.message,
        rawResponse: response.choices[0].message.content 
      }, `Failed to parse OpenAI response: ${parseError.message}`);
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
    // Log the complete items before chunking
    logger.debug({ 
      reqId, 
      completeItems: JSON.parse(text.match(/BOE Content: (.*)/s)[1])
    }, 'Complete BOE items before chunking');

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
      chunks: debugChunks.map((chunk, index) => ({
        chunkIndex: index,
        itemCount: chunk.length,
        items: chunk
      }))
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