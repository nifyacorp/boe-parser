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
    let xmlData;
    try {
      xmlData = await fetchBOESummary(formattedDate, requestId);
    } catch (fetchError) {
      console.warn(`Error fetching BOE data - Request ID: ${requestId}, Using empty placeholder instead`, fetchError);
      // Return a minimal structure to avoid breaking the flow
      return {
        boeContent: {
          items: [],
          boe_info: {
            publication_date: targetDate,
            source_url: `https://www.boe.es/datosabiertos/api/boe/sumario/${formattedDate}`
          },
          query_date: targetDate
        },
        prompts: prompts || []
      };
    }

    // 2. Parse XML data - with simplified approach that doesn't validate structure
    const boeContent = parseBOEXML(xmlData, requestId);

    console.log(`Finished BOE parsing - Request ID: ${requestId}, Items Found: ${boeContent.items.length}`);

    // Return parsed content and the original prompts
    return {
      boeContent,
      prompts: prompts || [] // Ensure prompts is always an array
    };

  } catch (error) {
    console.error(`Error in BOE parsing process - Request ID: ${requestId}, Date: ${targetDate}, Error:`, error);
    
    // Instead of throwing errors, return a minimal valid structure
    return {
      boeContent: {
        items: [{
          content: `Failed to parse BOE data for date ${targetDate}. Error: ${error.message}`,
          source_url: `https://www.boe.es/datosabiertos/api/boe/sumario/${formattedDate}`
        }],
        boe_info: {
          publication_date: targetDate,
          source_url: `https://www.boe.es/datosabiertos/api/boe/sumario/${formattedDate}`
        },
        query_date: targetDate
      },
      prompts: prompts || []
    };
  }
}