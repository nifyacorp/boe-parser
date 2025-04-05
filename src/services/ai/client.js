/**
 * AI client initialization and management
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { OpenAI } from "openai";
import logger from '../../utils/logger.js';
import config from '../../config/config.js';

// AI client singletons
let geminiClient = null;
let openaiClient = null;

/**
 * Initialize and get Gemini client
 * @returns {Object} - Gemini client
 */
export function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = config.services.gemini.apiKey;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }
    
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  
  return geminiClient;
}

/**
 * Get Gemini model with configuration
 * @param {string} [modelName] - Model name 
 * @returns {Object} - Configured Gemini model
 */
export function getGeminiModel(modelName = config.services.gemini.model) {
  const client = getGeminiClient();
  
  return client.getGenerativeModel({
    model: modelName,
  });
}

/**
 * Initialize and get OpenAI client
 * @returns {Object} - OpenAI client
 */
export function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = config.services.openai.apiKey;
    const organization = config.services.openai.organization;
    
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }
    
    const clientOptions = {
      apiKey,
    };
    
    // Add organization if available
    if (organization) {
      clientOptions.organization = organization;
    }
    
    openaiClient = new OpenAI(clientOptions);
  }
  
  return openaiClient;
}

/**
 * Reset AI clients (for testing)
 */
export function resetClients() {
  geminiClient = null;
  openaiClient = null;
  logger.debug('AI clients reset');
}