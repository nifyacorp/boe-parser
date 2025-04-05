/**
 * BOE Parser API - Main entry point
 */
import express from 'express';
import config, { loadSecrets, validateConfig } from './config/config.js';
import logger from './utils/logger.js';
import { registerMiddleware } from './middleware/index.js';
import createRoutes from './routes/index.js';

// Record start time for request duration tracking
function addStartTime(req, res, next) {
  req.startTime = Date.now();
  next();
}

/**
 * Initialize Express application
 * @returns {Object} - Express app
 */
function createApp() {
  const app = express();
  
  // Parse JSON body
  app.use(express.json());
  
  // Add request timing
  app.use(addStartTime);
  
  // Register middleware
  const middleware = registerMiddleware(app);
  
  // Register routes
  app.use('/', createRoutes(middleware));
  
  // Register error handler (must be last)
  app.use(middleware.errorHandler);
  
  return app;
}

/**
 * Start server
 * @param {Object} app - Express app
 * @returns {Object} - HTTP server
 */
function startServer(app) {
  const port = config.server.port;
  
  return app.listen(port, () => {
    logger.info({ port, env: config.env.NODE_ENV }, 'BOE Parser API started');
  });
}

/**
 * Initialize application
 */
async function init() {
  try {
    // Load secrets in production
    if (config.env.IS_PRODUCTION) {
      await loadSecrets();
    }
    
    // Validate configuration
    const missingKeys = validateConfig();
    if (missingKeys.length > 0) {
      logger.error({ missingKeys }, 'Missing required configuration');
      process.exit(1);
    }
    
    // Create and start app
    const app = createApp();
    startServer(app);
  } catch (error) {
    logger.error({ error }, 'Failed to initialize application');
    process.exit(1);
  }
}

// Start application
init();

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error({ error }, 'Unhandled promise rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exit(1);
});