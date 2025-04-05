/**
 * BOE website scraper module
 */
import axios from 'axios';
import { JSDOM } from 'jsdom';
import logger from '../../utils/logger.js';
import { formatDate } from '../../utils/dateFormatter.js';
import { createChildLogger } from '../../utils/logger.js';
import { createExternalApiError } from '../../utils/errors/AppError.js';

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