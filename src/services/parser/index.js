/**
 * BOE Parser Service - Orchestrates fetching and parsing
 */
import { fetchBOESummary, parseBOEXML } from './scraper.js';
import { createServiceError } from '../../utils/errors/AppError.js';

/**
 * Fetch and parse BOE content for a specific date or range
 * @param {Object} options - Options { date, prompts, requestId }
 * @returns {Promise<Object>} - Parsed BOE content and prompts
 */
export async function parseBOE(options = {}) {
  const { date, prompts, requestId } = options;

  // Determine date: use provided date or default to today
  const targetDate = date || new Date().toISOString().split('T')[0];
  const formattedDate = targetDate.replace(/-/g, ''); // YYYYMMDD format

  console.log(`Starting BOE parsing - Request ID: ${requestId}, Date: ${targetDate}`);

  try {
    // 1. Fetch BOE summary XML
    const xmlData = await fetchBOESummary(formattedDate, requestId);

    // 2. Parse XML data
    const boeContent = parseBOEXML(xmlData, requestId);

    console.log(`Finished BOE parsing - Request ID: ${requestId}, Items Found: ${boeContent.items.length}`);

    // Return parsed content and the original prompts
    return {
      boeContent,
      prompts: prompts || [] // Ensure prompts is always an array
    };

  } catch (error) {
    console.error(`Error in BOE parsing process - Request ID: ${requestId}, Date: ${targetDate}, Error:`, error);

    // Rethrow specific AppErrors (like ExternalApiError from fetch or ServiceError from parse)
    if (error instanceof Error && error.code && error.isOperational) { // Check if it's likely an AppError
      throw error; // Propagate the specific error
    }
    // Wrap other unexpected errors as a generic ServiceError
    else {
      throw createServiceError(`BOE parsing orchestration failed for date ${targetDate}`, {
        cause: error,
        date: targetDate,
        requestId
      });
    }
  }
}