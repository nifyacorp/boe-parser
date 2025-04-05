/**
 * AI client initialization and management
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import config from '../../config/config.js';

// AI client singletons
let geminiModel = null;
let openaiClient = null;

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
 * Initialize and get OpenAI client
 * @returns {Object} OpenAI client instance
 */
export function getOpenAIClient() {
  if (!openaiClient) {
    if (!config.services.openai.apiKey) {
      throw new Error('OpenAI API key not configured.');
    }
    openaiClient = new OpenAI({
      apiKey: config.services.openai.apiKey,
      // Add organization ID if needed
      // organization: config.services.openai.organizationId
    });
    console.log('OpenAI client initialized.');
  }
  return openaiClient;
}

/**
 * Reset clients (useful for testing or config changes)
 */
export function resetAIClients() {
  geminiModel = null;
  openaiClient = null;
  console.log('AI clients reset.');
}