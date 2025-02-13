import { MAX_CHUNK_SIZE } from './config.js';
import { logger } from '../../utils/logger.js';

export function chunkBOEContent(items) {
  const chunks = [];
  for (let i = 0; i < items.length; i += MAX_CHUNK_SIZE) {
    chunks.push(items.slice(i, i + MAX_CHUNK_SIZE));
  }
  return chunks;
}

export function getChunksToProcess(chunks, reqId) {
  const isDevMode = process.env.NODE_ENV === 'development';
  
  logger.info({ 
    reqId, 
    totalChunks: chunks.length,
    itemsPerChunk: MAX_CHUNK_SIZE,
    totalItems: chunks.reduce((acc, chunk) => acc + chunk.length, 0),
    mode: isDevMode ? 'development' : 'production'
  }, 'Starting BOE content analysis');

  // In development mode, only process the first chunk
  const chunksToProcess = isDevMode ? chunks.slice(0, 1) : chunks;
  
  if (isDevMode) {
    logger.info({ reqId }, 'Development mode: processing only first chunk');
  }

  return chunksToProcess;
}