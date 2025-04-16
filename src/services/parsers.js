// Import the logger from the correct path
import { logger } from '../utils/logger.js';

/**
 * Parsers module for BOE documents
 * This module provides functions for parsing BOE documents
 */

// Parse BOE document
export function parseDocument(document) {
  logger.info('Parsing document', { documentId: document.id });
  return document;
}

// Parse BOE search results
export function parseResults(results) {
  logger.info('Parsing search results', { count: results.length });
  return results;
} 