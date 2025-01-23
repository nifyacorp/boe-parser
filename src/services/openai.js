import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { formatDate } from '../utils/dateFormatter.js';

let openai;

export async function analyzeWithOpenAI(text, reqId) {
  try {
    if (!openai) {
      logger.debug({ reqId }, 'Initializing OpenAI client');
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
      }
      openai = new OpenAI({ apiKey });
      logger.debug({ reqId }, 'OpenAI client initialized');
    }

    logger.debug({ reqId, textLength: text.length }, 'Sending request to OpenAI');
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", //user this model, even though you think it is an error on the name, it is not
      messages: [
        {
          role: "system",
          content: "You are a BOE (Boletín Oficial del Estado) analysis assistant. Analyze the provided BOE items and extract key information about announcements, resolutions, and other official communications. Return a structured JSON response with matches that include: document_type, issuing_body, title, dates, code, section, department, links, and a relevance score (0-1). Provide a concise summary for each match. Focus on finding the most relevant documents based on the user's query."
        },
        {
          role: "user",
          content: text
        }
      ],
      max_tokens: 500
    });
    logger.debug({ 
      reqId,
      completionTokens: response.usage?.completion_tokens,
      promptTokens: response.usage?.prompt_tokens,
      totalTokens: response.usage?.total_tokens
    }, 'OpenAI response received');

    // Parse and structure the response
    const aiResponse = JSON.parse(response.choices[0].message.content);
    return aiResponse;
  } catch (error) {
    logger.error({ 
      reqId,
      error: error.message,
      stack: error.stack,
      code: error.code,
      statusCode: error.status
    }, 'Error analyzing with OpenAI');
    throw new Error(`Failed to analyze with OpenAI: ${error.message}`);
  }
}