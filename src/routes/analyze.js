/**
 * Analysis routes
 */
import { Router } from 'express';
import { analyzeText } from '../controllers/analyze.js';
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
  
  return router;
}