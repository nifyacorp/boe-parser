/**
 * AI client initialization and management
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import config from '../../config/config.js';

// AI client singleton
let geminiModel = null;

/**
 * Initialize and get Gemini client model
 * @returns {Object} Gemini GenerativeModel instance
 */
export function getGeminiModel() {
  if (!geminiModel) {
    if (!config.services.gemini.apiKey) {
      throw new Error('Gemini API key not configured.');
    }
    const genAI = new GoogleGenerativeAI(config.services.gemini.apiKey);
    geminiModel = genAI.getGenerativeModel({ model: config.services.gemini.model });
    console.log('Gemini client initialized with model:', config.services.gemini.model);
  }
  return geminiModel;
}

/**
 * Reset client (useful for testing or config changes)
 */
export function resetAIClients() {
  geminiModel = null;
  console.log('AI client reset.');
}