/**
 * Routes module
 */
import { Router } from 'express';
import createAnalyzeRoutes from './analyze.js';
import createTestRoutes from './test.js';

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
  
  // Register API routes
  router.use('/api', createAnalyzeRoutes(middleware));
  router.use('/api', createTestRoutes(middleware));
  
  return router;
}