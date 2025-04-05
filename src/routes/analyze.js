/**
 * Analysis routes
 */
import { Router } from 'express';
import { analyzeText, testAnalyze } from '../controllers/analyze.js';
import { validateAnalyzeRequestMiddleware } from '../middleware/validation.js';

/**
 * Create analysis router
 * @param {Object} middleware - Middleware functions
 * @returns {Router} - Express router
 */
export default function createAnalyzeRoutes(middleware) {
  const router = Router();
  
  // Main analysis endpoint (authenticated and validated)
  router.post('/analyze-text', middleware.auth, validateAnalyzeRequestMiddleware, analyzeText);
  
  // Test analysis endpoint (authenticated)
  // Note: testAnalyze currently reuses analyzeText, so it implicitly gets validation.
  // If testAnalyze logic diverges significantly, it might need its own validation or adjustments.
  router.post('/test-analyze', middleware.auth, testAnalyze);
  
  return router;
}