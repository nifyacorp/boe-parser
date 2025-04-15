/**
 * BOE website scraper module
 */
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { XMLParser } from 'fast-xml-parser';
import config from '../../config/config.js';
import { processTextContent } from './textProcessor.js';
import { createExternalApiError, createServiceError } from '../../utils/errors/AppError.js';

// Spanish month names to number mapping
const MONTH_NAMES = {
  'enero': '01',
  'febrero': '02',
  'marzo': '03',
  'abril': '04',
  'mayo': '05',
  'junio': '06',
  'julio': '07',
  'agosto': '08',
  'septiembre': '09',
  'octubre': '10',
  'noviembre': '11',
  'diciembre': '12'
};

/**
 * Get month number from Spanish month name
 * @param {string} monthName - Spanish month name
 * @returns {string} - Month number (01-12)
 */
function getMonthNumber(monthName) {
  return MONTH_NAMES[monthName.toLowerCase()] || '01';
}

/**
 * Generate BOE URL for a specific date
 * @param {Date} date - Date to generate URL for
 * @returns {string} - BOE URL
 */
function generateBOEUrl(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `https://www.boe.es/boe/dias/${year}/${month}/${day}/`;
}

/**
 * Get yesterday's BOE URL
 * @returns {string} - BOE URL for yesterday
 */
export function getYesterdayBOEUrl() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  return generateBOEUrl(yesterday);
}

/**
 * Extract BOE information from DOM
 * @param {Object} dom - JSDOM object
 * @returns {Object|null} - BOE information
 */
function extractBOEInfo(dom) {
  const titleElement = dom.window.document.querySelector('.tituloSumario h2');
  if (!titleElement) return null;

  const titleText = titleElement.textContent;
  const dateMatch = titleText.match(/(\d+)\s+de\s+(\w+)\s+de\s+(\d{4})/);
  const numMatch = titleText.match(/Núm\.\s*(\d+)/);

  return {
    issue_number: numMatch ? numMatch[1] : '',
    publication_date: dateMatch ? `${dateMatch[3]}-${getMonthNumber(dateMatch[2])}-${dateMatch[1].padStart(2, '0')}` : '',
    source_url: 'https://www.boe.es'
  };
}

/**
 * Extract BOE items from DOM
 * @param {Object} dom - JSDOM object
 * @returns {Array} - BOE items
 */
function extractBOEItems(dom) {
  const items = [];
  const sections = dom.window.document.querySelectorAll('.sumario h3');

  sections.forEach(section => {
    const sectionTitle = section.textContent.trim();
    const sectionContent = section.parentElement;
    
    if (!sectionContent) return;

    const dispositions = sectionContent.querySelectorAll('.dispo');
    dispositions.forEach(dispo => {
      const title = dispo.querySelector('p')?.textContent.trim() || '';
      const pdfLink = dispo.querySelector('.puntoPDF a');
      const htmlLink = dispo.querySelector('.puntoHTML a');

      const pdfUrl = pdfLink?.href || '';
      const pdfCode = pdfUrl.match(/BOE-[A-Z]-\d{4}-\d+/)?.[0] || '';
      
      // Extract issuing body based on section / disposition structure
      let issuingBody = '';
      const departmentHeader = dispo.closest('.departamento')?.querySelector('h4');
      if (departmentHeader) {
        issuingBody = departmentHeader.textContent.trim();
      }

      items.push({
        title,
        section: sectionTitle,
        issuing_body: issuingBody,
        bulletin_type: 'BOE',
        links: {
          html: htmlLink?.href || `https://www.boe.es/diario_boe/txt.php?id=${pdfCode}`,
          pdf: pdfUrl || ''
        }
      });
    });
  });

  return items;
}

/**
 * Fetch BOE content for a given date
 * @param {string} [date] - Date in YYYY-MM-DD format (defaults to yesterday)
 * @param {string} [requestId] - Request ID for logging
 * @returns {Promise<Object>} - BOE content
 */
export async function fetchBOEContent(date, requestId) {
  const requestLogger = createChildLogger({ requestId });
  
  try {
    let url;
    
    if (date) {
      // Parse the provided date string
      const [year, month, day] = date.split('-');
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      url = generateBOEUrl(dateObj);
    } else {
      url = getYesterdayBOEUrl();
    }
    
    requestLogger.info({ url }, 'Fetching BOE content');
    
    const response = await axios.get(url);
    const dom = new JSDOM(response.data);
    
    const boeInfo = extractBOEInfo(dom);
    const boeItems = extractBOEItems(dom);
    
    requestLogger.info({ 
      itemsCount: boeItems.length,
      issueNumber: boeInfo?.issue_number,
      publicationDate: boeInfo?.publication_date
    }, 'BOE content fetched successfully');
    
    return {
      boe_info: boeInfo,
      items: boeItems,
      query_date: date || formatDate(new Date())
    };
  } catch (error) {
    requestLogger.error({ 
      error,
      date 
    }, 'Failed to fetch BOE content');
    
    throw createExternalApiError('Failed to fetch BOE content', {
      url: error.config?.url,
      status: error.response?.status,
      originalError: error.message
    });
  }
}

// Constants
const BOE_BASE_URL = 'https://www.boe.es';
const SUMMARY_ENDPOINT = '/datosabiertos/api/boe/sumario/';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // ms

/**
 * Fetch BOE summary XML with retries
 * @param {string} date - Date in YYYYMMDD format
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<string>} - XML content
 */
async function fetchBOESummary(date, requestId) {
  const url = `${BOE_BASE_URL}${SUMMARY_ENDPOINT}${date}`;
  console.log(`Fetching BOE summary - Request ID: ${requestId}, URL: ${url}`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: config.scraper.timeout || 15000,
        headers: {
          'User-Agent': config.scraper.userAgent || 'BOE Parser Bot',
          'Accept': 'application/xml, text/xml'  // Explicitly request XML
        },
        responseType: 'text'  // Force response as text
      });

      if (response.status !== 200) {
        throw createExternalApiError(`BOE Summary fetch failed: Unexpected status code ${response.status}`, {
          url, attempt, status: response.status, service: 'BOE'
        });
      }
      console.log(`Successfully fetched BOE summary - Request ID: ${requestId}, Status: ${response.status}, Attempt: ${attempt}`);
      
      // Log data type for debugging
      const dataType = typeof response.data;
      const isString = dataType === 'string';
      const contentType = response.headers['content-type'] || 'unknown';
      console.log(`BOE response data type - Request ID: ${requestId}, Type: ${dataType}, Is String: ${isString}, Content-Type: ${contentType}`);
      
      // Ensure we're returning a string
      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } catch (error) {
      console.warn(`Attempt ${attempt} failed to fetch BOE summary - Request ID: ${requestId}, Error:`, error.message);
      if (attempt === MAX_RETRIES) {
        console.error(`Failed to fetch BOE summary after ${MAX_RETRIES} attempts - Request ID: ${requestId}, URL: ${url}, Error:`, error);
        throw createExternalApiError(`Failed to fetch BOE summary from ${url} after ${MAX_RETRIES} attempts`, {
          url, attempts: MAX_RETRIES, cause: error, service: 'BOE'
        });
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt)); // Exponential backoff
    }
  }
}

/**
 * Parse BOE XML summary
 * @param {string} xmlData - XML content
 * @param {string} requestId - Request ID for logging
 * @returns {Object} - Parsed BOE data
 */
function parseBOEXML(xmlData, requestId) {
  try {
    // Ensure xmlData is a string
    if (xmlData === null || xmlData === undefined) {
      throw createServiceError('XML data is null or undefined');
    }
    
    // Convert to string if it's not already a string
    const xmlString = typeof xmlData === 'string' ? xmlData : JSON.stringify(xmlData);
    
    const parser = new XMLParser({ 
      ignoreAttributes: false, 
      attributeNamePrefix: "@_",
      // Remove XML tags and other unnecessary content to reduce tokens
      preserveOrder: true,
      trimValues: true 
    });
    const jsonObj = parser.parse(xmlString);

    if (!jsonObj.sumario || !jsonObj.sumario.diario || !jsonObj.sumario.item) {
      console.warn(`Incomplete BOE XML structure - Request ID: ${requestId}, Data:`, 
        typeof xmlString === 'string' ? xmlString.substring(0, 500) : 'Non-string data');
      throw createServiceError('Incomplete BOE XML structure', { 
        xmlPreview: typeof xmlString === 'string' ? xmlString.substring(0, 500) : 'Non-string data' 
      });
    }

    const items = Array.isArray(jsonObj.sumario.item) ? jsonObj.sumario.item : [jsonObj.sumario.item];
    const boeInfo = jsonObj.sumario.diario;
    const queryDate = jsonObj.sumario['@_fecha'];

    console.log(`Parsed BOE XML - Request ID: ${requestId}, Items: ${items.length}, BOE Date: ${queryDate}`);

    // Simplify items to reduce token usage
    return {
      items: items.map(item => ({
        id: item.urlHito?.replace('/diario_boe/txt.php?id=', '') || item['@_id'],
        title: processTextContent(item.titulo),
        department: processTextContent(item.departamento),
        section: processTextContent(item.seccion?.['@_nombre']),
        epigraph: processTextContent(item.epigrafe),
        content: processTextContent(item.texto || item.titulo), // Include main content if available
        pdf_url: item.urlPdf ? `${BOE_BASE_URL}${item.urlPdf}` : null,
        html_url: item.urlHito ? `${BOE_BASE_URL}${item.urlHito}` : null,
      })),
      boe_info: {
        issue_number: boeInfo['@_nbo'],
        publication_date: queryDate,
        source_url: `${BOE_BASE_URL}${SUMMARY_ENDPOINT}${queryDate.replace(/-/g, '')}`
      },
      query_date: queryDate
    };
  } catch (error) {
    console.error(`Failed to parse BOE XML - Request ID: ${requestId}, Error:`, error);
    if (error instanceof Error && error.code && error.isOperational) {
        throw error; // Re-throw AppError directly
    }
    throw createServiceError('Failed to parse BOE XML', { cause: error });
  }
}

/**
 * Scrape text content from a BOE HTML page
 * @param {string} htmlUrl - URL of the BOE page
 * @param {string} requestId - Request ID for logging
 * @returns {Promise<string|null>} - Scraped text content or null if failed
 */
async function scrapeBOEText(htmlUrl, requestId) {
  if (!htmlUrl) return null;

  // console.log(`Scraping BOE text - Request ID: ${requestId}, URL: ${htmlUrl}`);

  try {
    const response = await axios.get(htmlUrl, {
      timeout: config.scraper.timeout || 10000,
      headers: { 'User-Agent': config.scraper.userAgent || 'BOE Parser Bot' }
    });

    if (response.status !== 200) {
      console.warn(`Failed to scrape BOE text: Status ${response.status} - Request ID: ${requestId}, URL: ${htmlUrl}`);
      return null; // Don't fail the whole process, just skip this item
    }

    const dom = new JSDOM(response.data);
    const document = dom.window.document;

    // Find the main content container (adjust selector based on actual BOE structure)
    const contentElement = document.querySelector('#textoxslt') || document.querySelector('.documento-cont') || document.body;

    if (!contentElement) {
       console.warn(`Could not find main content element - Request ID: ${requestId}, URL: ${htmlUrl}`);
       return document.body.textContent; // Fallback to body text
    }

    return processTextContent(contentElement.textContent);

  } catch (error) {
    // Log but don't throw an error that stops processing other items
    console.warn(`Error scraping BOE text - Request ID: ${requestId}, URL: ${htmlUrl}, Error: ${error.message}`);
    return null; // Don't fail the whole process
  }
}

export { fetchBOESummary, parseBOEXML, scrapeBOEText };