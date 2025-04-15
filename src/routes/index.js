/**
 * Routes module
 */
import { Router } from 'express';
import createAnalyzeRoutes from './analyze.js';
// Remove import for test routes
// import createTestRoutes from './test.js';

/**
 * Create and register all routes
 * @param {Object} middleware - Middleware functions
 * @returns {Router} - Express router
 */
export default function createRoutes(middleware) {
  const router = Router();
  
  // Register health check route
  router.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString()
    });
  });
  
  // Register API routes - only keep analyze routes
  router.use('/api', createAnalyzeRoutes(middleware));
  // Remove test routes
  // router.use('/api', createTestRoutes(middleware));
  
  return router;
}