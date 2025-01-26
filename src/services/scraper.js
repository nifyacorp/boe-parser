import axios from 'axios';
import { logger } from '../utils/logger.js';
import { formatDate } from '../utils/dateFormatter.js';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false });

function getYesterdayBOEUrl() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  
  return `https://www.boe.es/datosabiertos/api/boe/sumario/${year}${month}${day}`;
}

function extractBOEInfo(xmlData) {
  if (!xmlData || !xmlData.response || !xmlData.response.data || !xmlData.response.data.sumario || !xmlData.response.data.sumario.metadatos) {
    return null;
  }

  const metadatos = xmlData.response.data.sumario.metadatos;
  return {
    issue_number: xmlData.response.data.sumario.diario?.["@_numero"] || '',
    publication_date: formatDate(metadatos.fecha_publicacion),
    source_url: 'https://www.boe.es'
  };
}

function extractBOEItems(xmlData) {
  if (!xmlData || !xmlData.response || !xmlData.response.data || !xmlData.response.data.sumario || !xmlData.response.data.sumario.diario) {
    return [];
  }

  const sections = xmlData.response.data.sumario.diario.seccion;
  if (!Array.isArray(sections)) {
    return [];
  }

  const items = [];
  sections.forEach(section => {
    const department = section.departamento;
    if (Array.isArray(department)) {
      department.forEach(dep => {
        const epigrafe = dep.epigrafe;
        if (Array.isArray(epigrafe)) {
          epigrafe.forEach(epi => {
            if (Array.isArray(epi.item)) {
              epi.item.forEach(item => {
                items.push({
                  title: item.titulo,
                  section: section["@_nombre"],
                  department: dep["@_nombre"],
                  links: {
                    pdf: item.url_pdf,
                    html: item.url_html
                  },
                  code: item.identificador,
                  type: determineDocumentType(item.titulo)
                });
              });
            }
          });
        }
      });
    }
  });
  return items;
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

export async function scrapeWebsite(reqId) {
  try {
    // Override the input URL with BOE XML API URL
    const url = getYesterdayBOEUrl();
    
    logger.debug({ reqId, url }, 'Starting BOE XML fetch');
    const response = await axios.get(url);
    logger.debug({ reqId, status: response.status }, 'BOE XML fetch completed');

    const xmlData = parser.parse(response.data);
    
    const boeInfo = extractBOEInfo(xmlData);
     if (!boeInfo) {
      throw new Error('Failed to extract BOE information from XML');
    }

    const items = extractBOEItems(xmlData);
    logger.debug({ reqId, itemCount: items.length }, 'BOE items extracted from XML');

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
    }, 'Error scraping BOE XML');
    throw new Error(`Failed to scrape BOE XML: ${error.message}`);
  }
}
