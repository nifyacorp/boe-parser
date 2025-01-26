import { logger } from '../../utils/logger.js';

export function parseAndValidateResponse(response, reqId) {
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
}
