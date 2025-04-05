/**
 * Test routes
 */
import { Router } from 'express';
import { testGemini, testOpenAI, testPubSub } from '../controllers/test.js';

/**
 * Create test router
 * @param {Object} middleware - Middleware functions
 * @returns {Router} - Express router
 */
export default function createTestRoutes(middleware) {
  const router = Router();
  
  // Test Gemini API connection (authenticated)
  router.get('/check-gemini', middleware.auth, testGemini);
  
  // Test OpenAI API connection (authenticated)
  router.get('/check-openai', middleware.auth, testOpenAI);
  
  // Test PubSub integration (authenticated)
  router.post('/test-pubsub', middleware.auth, testPubSub);
  
  return router;
}