import express from 'express';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { scrapeWebsite } from './services/scraper.js';
import { processText } from './services/textProcessor.js';
import { analyzeWithGemini } from './services/gemini/index.js';
import { publishResults } from './utils/pubsub.js';
import { randomUUID } from 'crypto';
import { validateApiKey } from './utils/auth.js';
import { getApiDocs } from './utils/apiDocs.js';

// Load environment variables
dotenv.config();

const app = express();
const port = parseInt(process.env.PORT) || 8080;

// Middleware to parse JSON bodies
app.use(express.json());

// Request ID middleware
app.use((req, res, next) => {
  req.id = randomUUID();
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  logger.debug({ 
    reqId: req.id,
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body || {} 
  }, 'Incoming request');
  next();
});

// Apply API key validation to all routes except /help
app.use(async (req, res, next) => {
  if (req.path === '/help') {
    return next();
  }
  await validateApiKey(req, res, next);
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ reqId: req.id, error: err.message, stack: err.stack }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// Routes
app.get('/help', (req, res) => {
  const docs = getApiDocs();
  res.json(docs);
});

app.get('/health', (req, res) => {
  // Simple health check endpoint
  res.status(200).json({ status: 'OK', version: process.env.VERSION || '1.0.0' });
});

app.post('/analyze-text', async (req, res) => {
  const reqId = req.id;
  const startTime = Date.now();
  
  try {
    const { texts, metadata } = req.body;
    
    if (!texts || !Array.isArray(texts)) {
      logger.debug({ reqId }, 'Missing or invalid texts array in request body');
      return res.status(400).json({ error: 'Array of text prompts is required' });
    }

    const userId = metadata?.user_id;
    const subscriptionId = metadata?.subscription_id;
    
    if (!userId || !subscriptionId) {
      logger.debug({ reqId, metadata }, 'Missing or invalid metadata in request body');
      return res.status(400).json({ 
        error: 'Request must include metadata.user_id and metadata.subscription_id'
      });
    }

    // Step 1: Fetch and parse BOE content (do this once for all prompts)
    logger.debug({ reqId }, 'Fetching BOE content');
    const boeContent = await scrapeWebsite(null, reqId);
    
    if (!boeContent) {
      logger.error({ reqId }, 'Failed to fetch BOE content');
      return res.status(500).json({ error: 'Failed to fetch BOE content' });
    }
    
    // Always ensure boeContent.items exists, even if empty
    if (!boeContent.items) {
      boeContent.items = [];
    }
    
    // If items array is empty, log a warning but continue processing
    if (boeContent.items.length === 0) {
      logger.warn({ reqId, boeInfo: boeContent.boeInfo }, 'No BOE items found for the requested date');
    }

    // Step 2: Process each text prompt
    logger.debug({ reqId, promptCount: texts.length }, 'Processing multiple prompts');
    const results = await Promise.all(texts.map(async (text, index) => {
      // Process the input text
      logger.debug({ reqId, promptIndex: index, text }, 'Processing input text');
      const cleanText = processText(text);
      logger.debug({ reqId, promptIndex: index, cleanText }, 'Text processed');

      // Analyze with Gemini
      logger.debug({ reqId, promptIndex: index }, 'Starting Gemini analysis');
      const analysis = await analyzeWithGemini(boeContent.items, cleanText, reqId, {
        metadata: {
          user_id: userId,
          subscription_id: subscriptionId
        }
      });
      logger.debug({ reqId, promptIndex: index }, 'Analysis completed');

      return {
        prompt: text,
        matches: analysis.matches,
        metadata: analysis.metadata
      };
    }));

    const processingTime = Date.now() - startTime;
    
    const response = {
      query_date: new Date().toISOString().split('T')[0],
      boe_info: boeContent.boeInfo,
      results,
      metadata: {
        total_items_processed: boeContent.items.length,
        processing_time_ms: processingTime,
        model_used: "gemini-2.0-pro-exp-02-05"
      }
    };

    // Prepare and publish results to PubSub with consistent structure
    const publishPayload = {
      trace_id: reqId,
      request: {
        texts,
        user_id: userId,
        subscription_id: subscriptionId
      },
      results: {
        matches: results.flatMap(r => r.matches.map(m => ({
          ...m,
          prompt: r.prompt
        })))
      },
      processor_type: "boe",
      metadata: {
        processing_time_ms: processingTime,
        total_items_processed: boeContent.items.length
      }
    };

    await publishResults(publishPayload);
    logger.debug({ reqId, resultCount: results.length }, 'Analysis completed and published to PubSub');
    res.json(response);

  } catch (error) {
    logger.error({
      reqId,
      error: error.message,
      stack: error.stack,
      code: error.code
    }, 'Error processing text request');

    // Publish error to PubSub
    try {
      // Get user_id and subscription_id from request if available
      const userId = req.body?.metadata?.user_id || 'unknown';
      const subscriptionId = req.body?.metadata?.subscription_id || 'unknown';
      
      const errorPayload = {
        trace_id: reqId,
        request: {
          texts: req.body?.texts || [],
          user_id: userId,
          subscription_id: subscriptionId
        },
        results: {
          matches: []
        },
        processor_type: "boe",
        metadata: {
          processing_time_ms: Date.now() - startTime,
          error: error.message,
          error_type: error.name,
          status: "error"
        }
      };

      await publishResults(errorPayload);
      logger.debug({ reqId }, 'Successfully published error to PubSub');
    } catch (pubsubError) {
      logger.error({
        reqId,
        error: pubsubError.message,
        originalError: error.message
      }, 'Failed to publish error to PubSub');
    }

    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  logger.info(`BOE Parser service running on port ${port}`);
});