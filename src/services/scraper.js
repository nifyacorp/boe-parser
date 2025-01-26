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

export async function scrapeWebsite(url, reqId) {
  try {
    // Override the input URL with BOE URL
    url = getYesterdayBOEUrl();
    
    logger.debug({ reqId, url }, 'Starting BOE fetch');
    const response = await axios.get(url);
    logger.debug({ reqId, status: response.status }, 'BOE fetch completed');

    const dom = new JSDOM(response.data);
    
    const boeInfo = extractBOEInfo(dom);
    if (!boeInfo) {
      throw new Error('Failed to extract BOE information');
    }

    const items = extractBOEItems(dom);
    logger.debug({ reqId, itemCount: items.length }, 'BOE items extracted');

    return {
      items,
      boeInfo
    };
  } catch (error) {
    logger.error({ 
      reqId,
      error: error.message,
      stack: error.stack,
      url,
      code: error.code 
    }, 'Error scraping BOE website');
    throw new Error(`Failed to scrape BOE website: ${error.message}`);
  }
}
