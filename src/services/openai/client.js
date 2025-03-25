import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import https from 'https';

let openai;

export function getOpenAIClient(reqId) {
  if (!openai) {
    logger.debug({ reqId }, 'Initializing OpenAI client');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    
    // Create an HTTPS agent with keep-alive and appropriate timeouts
    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 15000, // 15 seconds
      timeout: 120000, // 2 minutes
      maxSockets: 25, // Limit concurrent connections
      maxFreeSockets: 5
    });
    
    openai = new OpenAI({ 
      apiKey,
      httpAgent: httpsAgent,
      timeout: 120000, // 2 minutes
      maxRetries: 3
    });
  }
  return openai;
}