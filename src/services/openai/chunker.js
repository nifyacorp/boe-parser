import { MAX_CHUNK_SIZE } from './config.js';
import { logger } from '../../utils/logger.js';
import { encode } from 'gpt-tokenizer';

export function chunkBOEContent(items) {
  const chunks = [];
  let totalTokens = 0;

  for (let i = 0; i < items.length; i += MAX_CHUNK_SIZE) {
    const chunk = items.slice(i, i + MAX_CHUNK_SIZE);
    const chunkText = JSON.stringify(chunk);
    const tokenCount = encode(chunkText).length;
    totalTokens += tokenCount;
    chunks.push({ items: chunk, tokenCount });
  }

  logger.info({ 
    averageTokensPerChunk: Math.round(totalTokens / chunks.length),
    totalTokens,
    sampleChunkTokens: chunks[0].tokenCount
  }, 'Chunk token analysis');

  return chunks;
}

export function getChunksToProcess(chunks, reqId) {
  const isDevMode = process.env.NODE_ENV === 'development';
  
  logger.info({ 
    reqId, 
    totalChunks: chunks.length,
    itemsPerChunk: MAX_CHUNK_SIZE, 
    totalItems: chunks.reduce((acc, chunk) => acc + chunk.items.length, 0),
    mode: isDevMode ? 'development' : 'production'
  }, 'Starting BOE content analysis');

  // In development mode, only process the first chunk
  const chunksToProcess = isDevMode ? chunks.slice(0, 1) : chunks;
  
  if (isDevMode) {
    logger.info({ reqId }, 'Development mode: processing only first chunk');
  }

  return chunksToProcess;
}