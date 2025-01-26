import OpenAI from 'openai';
import { logger } from '../utils/logger.js';

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

async function analyzeWithOpenAI(text, reqId) {
  try {
    // Log the complete items before sending to OpenAI
    logger.debug({ 
      reqId, 
      completeItems: JSON.parse(text.match(/BOE Content: (.*)/s)[1])
    }, 'Complete BOE items before sending to OpenAI');

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

    logger.debug({ reqId, itemCount: items.length }, 'Starting OpenAI analysis with all items');

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
          content: `User Query: ${query}\n\nBOE Content: ${JSON.stringify(items)}`
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
      // Attempt to parse the JSON response, handling potential errors
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(cleanContent);
      } catch (parseError) {
        // Attempt to fix common issues like missing closing brackets
        try {
          cleanContent = cleanContent.replace(/,\s*}/g, '}');
          cleanContent = cleanContent.replace(/,\s*\]/g, ']');
          parsedResponse = JSON.parse(cleanContent);
        } catch (fixError) {
          logger.error({ 
            reqId,
            errorType: fixError.name,
            errorMessage: fixError.message,
            errorStack: fixError.stack,
            rawResponse: {
              content: response.choices[0].message.content,
              length: response.choices[0].message.content.length,
              firstChars: response.choices[0].message.content.substring(0, 100)
            }
          }, 'Failed to parse or fix OpenAI response');
          throw fixError;
        }
      }
      
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

      // Sort matches by relevance score in descending order
      parsedResponse.matches.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

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
        queryLength: query.length,
        modelUsed: "gpt-4o-mini",
        totalItems: items.length,
        firstItemTitle: items[0]?.title || 'No title'
      }
    }, 'Chunk analysis failed');

    return { matches: [], metadata: { match_count: 0, max_relevance: 0 } };
  }
}

export default analyzeWithOpenAI;
