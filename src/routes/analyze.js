/**
 * Analysis routes
 */
import { Router } from 'express';
import { analyzeText, testAnalyze } from '../controllers/analyze.js';

/**
 * Create analysis router
 * @param {Object} middleware - Middleware functions
 * @returns {Router} - Express router
 */
export default function createAnalyzeRoutes(middleware) {
  const router = Router();
  
  // Main analysis endpoint (authenticated)
  router.post('/analyze-text', middleware.auth, analyzeText);
  
  // Test analysis endpoint (authenticated)
  router.post('/test-analyze', middleware.auth, testAnalyze);
  
  return router;
}