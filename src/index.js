/**
 * BOE Parser API - Main entry point
 */
import express from 'express';
import config, { loadSecrets, validateConfig } from './config/config.js';
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
    console.log(`BOE Parser API started on port ${port}, env: ${config.env.NODE_ENV}`);
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
    // Log the state of required keys *before* validation
    console.log('--- Pre-Validation Config Check ---');
    console.log(`gcp.projectId: ${config.gcp.projectId ? 'OK' : 'MISSING'}`);
    console.log(`services.gemini.apiKey: ${config.services.gemini.apiKey ? 'OK' : 'MISSING'}`);
    console.log(`auth.apiKey: ${config.auth.apiKey ? 'OK' : 'MISSING'}`);
    console.log(`services.pubsub.topicId: ${config.services.pubsub.topicId ? 'OK' : 'MISSING'}`);
    console.log('----------------------------------');

    const missingKeys = validateConfig();
    if (missingKeys.length > 0) {
      console.error('Missing required configuration:', missingKeys);
      process.exit(1);
    }
    
    // Create and start app
    const app = createApp();
    startServer(app);
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// Start application
init();

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});