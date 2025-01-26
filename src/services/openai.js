import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

const MAX_CHUNK_SIZE = 25; // Reduced chunk size
const MAX_CONCURRENT_REQUESTS = 2; // Reduce concurrent requests to avoid rate limits

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
    // Log the request details
    logger.debug({ 
      reqId,
      chunkSize: chunk.length,
      queryLength: query.length,
      firstItem: chunk[0]
    }, 'Starting chunk analysis');

    const payload = {
      model: "gpt-4o-mini",
      temperature: 0,
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
      max_tokens: 500,
      response_format: { type: "json_object" }
    };

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
    
    // Clean the response content
    let cleanContent = response.choices[0].message.content.trim();
    
    // Remove any markdown code block markers if present
    cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');

    try {
      const parsedResponse = JSON.parse(cleanContent);
      
      // Detailed response validation
      const validationErrors = [];
      
      if (!parsedResponse.matches) {
        validationErrors.push('Missing matches array');
      } else if (!Array.isArray(parsedResponse.matches)) {
        validationErrors.push('matches is not an array');
      }
      
      if (!parsedResponse.metadata) {
        validationErrors.push('Missing metadata object');
      } else {
        if (typeof parsedResponse.metadata.match_count !== 'number') {
          validationErrors.push('Invalid or missing match_count');
        }
        if (typeof parsedResponse.metadata.max_relevance !== 'number') {
          validationErrors.push('Invalid or missing max_relevance');
        }
      }
      
      if (validationErrors.length > 0) {
        throw new Error(`Invalid response structure: ${validationErrors.join(', ')}`);
      }
      
      logger.debug({
        reqId,
        matchCount: parsedResponse.matches.length,
        maxRelevance: parsedResponse.metadata.max_relevance,
        firstMatch: parsedResponse.matches[0]
      }, 'Successfully parsed OpenAI response');

      return parsedResponse;

    } catch (parseError) {
      logger.error({ 
        reqId,
        errorType: parseError.name,
        errorMessage: parseError.message,
        errorStack: parseError.stack,
        rawResponse: {
          content: response.choices[0].message.content,
          length: response.choices[0].message.content.length,
          firstChars: response.choices[0].message.content.substring(0, 100)
        }
      }, 'Failed to parse OpenAI response');
      throw parseError;
    }

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
        chunkSize: chunk.length,
        queryLength: query.length,
        modelUsed: "gpt-4o-mini",
        firstItemTitle: chunk[0]?.title || 'No title'
      }
    }, 'Chunk analysis failed');

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
    // Process all chunks in production
    const chunksToProcess = process.env.NODE_ENV === 'development' ? chunks.slice(0, 2) : chunks;
    logger.debug({ 
      reqId, 
      chunkCount: chunksToProcess.length,
      totalItems: items.length
    }, 'Processing chunks');

    // Process chunks in batches to limit concurrent requests
    const results = [];
    for (let i = 0; i < chunksToProcess.length; i += MAX_CONCURRENT_REQUESTS) {
      const batch = chunksToProcess.slice(i, i + MAX_CONCURRENT_REQUESTS);
      
      // Add delay between batches to avoid rate limits
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const batchResults = await Promise.all(
        batch.map(async (chunk, index) => {
          const batchIndex = i + index;
          logger.debug({ reqId, chunkIndex: batchIndex, itemCount: chunk.length }, 'Analyzing chunk');
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
              chunk: chunk.slice(0, 2) // Log first two items for debugging
            }, 'Chunk analysis failed');
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
