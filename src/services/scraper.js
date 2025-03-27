import axios from 'axios';
import { logger } from '../utils/logger.js';
import { formatDate } from '../utils/dateFormatter.js';
import { JSDOM } from 'jsdom';

function getYesterdayBOEUrl() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  
  return `https://www.boe.es/boe/dias/${year}/${month}/${day}/`;
}

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

      items.push({
        title,
        section: sectionTitle,
        department: findDepartment(dispo),
        links: {
          pdf: pdfUrl,
          html: htmlLink?.href || ''
        },
        code: pdfCode,
        type: determineDocumentType(title)
      });
    });
  });

  return items;
}

function findDepartment(element) {
  let current = element;
  while (current) {
    if (current.tagName === 'H4') {
      return current.textContent.trim();
    }
    current = current.previousElementSibling;
  }
  return '';
}

function determineDocumentType(title) {
  const types = {
    'Resolución': 'RESOLUTION',
    'Orden': 'ORDER',
    'Real Decreto': 'ROYAL_DECREE',
    'Ley': 'LAW',
    'Anuncio': 'ANNOUNCEMENT'
  };

  for (const [key, value] of Object.entries(types)) {
    if (title.startsWith(key)) return value;
  }
  return 'OTHER';
}

function getMonthNumber(spanishMonth) {
  const months = {
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
  return months[spanishMonth.toLowerCase()] || '01';
}

export async function scrapeWebsite(date, reqId) {
  try {
    // If a specific date is provided, use it; otherwise use yesterday
    let url;
    if (date) {
      const dateParts = date.split('-');
      if (dateParts.length === 3) {
        const [year, month, day] = dateParts;
        url = `https://www.boe.es/boe/dias/${year}/${month}/${day}/`;
        logger.info({ reqId, date, url }, 'Using provided date for BOE fetch');
      } else {
        url = getYesterdayBOEUrl();
        logger.info({ reqId, url }, 'Invalid date format, using yesterday instead');
      }
    } else {
      url = getYesterdayBOEUrl();
      logger.info({ reqId, url }, 'No date provided, using yesterday');
    }
    
    logger.debug({ reqId, url }, 'Starting BOE fetch');
    
    try {
      // Create axios instance with proper connection handling
      const axiosInstance = axios.create({
        timeout: 30000, // 30 second timeout
        headers: {
          'Connection': 'keep-alive',
          'User-Agent': 'NIFYA-BOE-Parser/1.0'
        },
        maxRedirects: 5,
        decompress: true,
        // Don't throw on 404s
        validateStatus: status => status < 500
      });
      
      const response = await axiosInstance.get(url);
      logger.debug({ reqId, status: response.status }, 'BOE fetch completed');

      const dom = new JSDOM(response.data);
      
      const boeInfo = extractBOEInfo(dom);
      if (!boeInfo) {
        logger.warn({ reqId, url }, 'Failed to extract BOE information, possibly invalid format');
        return {
          items: [],
          boeInfo: {
            issue_number: 'N/A',
            publication_date: new Date().toISOString().split('T')[0],
            source_url: url,
            note: 'No BOE information could be extracted'
          }
        };
      }

      const items = extractBOEItems(dom);
      logger.debug({ reqId, itemCount: items.length }, 'BOE items extracted');

      return {
        items,
        boeInfo
      };
      
    } catch (error) {
      // Handle 404 error (no BOE for this date) gracefully
      if (error.response && error.response.status === 404) {
        logger.info({ reqId, url }, 'No BOE found for this date (404 response)');
        
        // Return empty results instead of throwing an error
        return {
          items: [],
          boeInfo: {
            issue_number: 'N/A',
            publication_date: new Date().toISOString().split('T')[0],
            source_url: url,
            note: 'No BOE published for this date'
          }
        };
      }
      
      // For other errors, rethrow
      throw error;
    }
    
  } catch (error) {
    logger.error({ 
      reqId,
      error: error.message,
      stack: error.stack,
      url,
      code: error.code 
    }, 'Error scraping BOE website');
    
    // Return empty results with error info instead of throwing
    return {
      items: [],
      boeInfo: {
        issue_number: 'ERROR',
        publication_date: new Date().toISOString().split('T')[0],
        source_url: url,
        error: error.message,
        note: 'Failed to retrieve BOE data'
      }
    };
  }
}