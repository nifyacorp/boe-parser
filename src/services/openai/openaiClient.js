import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';

let openai;

export async function getOpenAIClient(reqId) {
  if (!openai) {
    logger.debug({ reqId }, 'Initializing OpenAI client');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({ apiKey });
    logger.debug({ reqId }, 'OpenAI client initialized');
  }
  return openai;
}
