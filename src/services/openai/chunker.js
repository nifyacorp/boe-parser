import { MAX_CHUNK_SIZE } from './config.js';
import { logger } from '../../utils/logger.js';
import { encode } from 'gpt-tokenizer';

export function chunkBOEContent(items) {
  const chunks = [];
  let totalTokens = 0;
  const MAX_SAFE_TOKENS = 100000; // Leave ~28k tokens for system prompt and response

  for (let i = 0; i < items.length; i += MAX_CHUNK_SIZE) {
    const chunk = items.slice(i, i + MAX_CHUNK_SIZE);
    const chunkText = JSON.stringify(chunk);
    const tokenCount = encode(chunkText).length;
    
    // If chunk is too large, split it in half
    if (tokenCount > MAX_SAFE_TOKENS) {
      const halfSize = Math.floor(chunk.length / 2);
      const firstHalf = chunk.slice(0, halfSize);
      const secondHalf = chunk.slice(halfSize);
      
      const firstHalfText = JSON.stringify(firstHalf);
      const secondHalfText = JSON.stringify(secondHalf);
      
      chunks.push({ 
        items: firstHalf, 
        tokenCount: encode(firstHalfText).length 
      });
      chunks.push({ 
        items: secondHalf, 
        tokenCount: encode(secondHalfText).length 
      });
      totalTokens += encode(firstHalfText).length + encode(secondHalfText).length;
    } else {
      chunks.push({ items: chunk, tokenCount });
      totalTokens += tokenCount;
    }
    totalTokens += tokenCount;
    chunks.push({ items: chunk, tokenCount });
  }

  logger.info({ 
    averageTokensPerChunk: Math.round(totalTokens / chunks.length),
    totalTokens,
    sampleChunkTokens: chunks[0].tokenCount,
    numberOfChunks: chunks.length
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