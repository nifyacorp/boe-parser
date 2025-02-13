import express from 'express';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { scrapeWebsite } from './services/scraper.js';
import { processText } from './services/textProcessor.js';
import { analyzeWithOpenAI } from './services/openai.js';
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
    const boeContent = await scrapeWebsite();
    
    if (!boeContent || !boeContent.items) {
      logger.error({ reqId }, 'Failed to fetch BOE content');
      return res.status(500).json({ error: 'Failed to fetch BOE content' });
    }

    // Step 2: Process each text prompt
    logger.debug({ reqId, promptCount: texts.length }, 'Processing multiple prompts');
    const results = await Promise.all(texts.map(async (text, index) => {
      // Process the input text
      logger.debug({ reqId, promptIndex: index, text }, 'Processing input text');
      const cleanText = processText(text);
      logger.debug({ reqId, promptIndex: index, cleanText }, 'Text processed');

      // Combine user input with BOE content
      logger.debug({ reqId, promptIndex: index }, 'Combining input with BOE content');
      const combinedText = `User Query: ${cleanText}\n\nBOE Content: ${JSON.stringify(boeContent.items)}`;
      logger.debug({ reqId, promptIndex: index, combinedLength: combinedText.length }, 'Content combined');

      // Analyze with OpenAI
      logger.debug({ reqId, promptIndex: index }, 'Starting OpenAI analysis');
      const analysis = await analyzeWithOpenAI(combinedText, reqId);
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
        processing_time_ms: processingTime
      }
    };

    // Publish results to PubSub
    await publishResults({
      texts,
      context: {
        user_id: userId,
        subscription_id: subscriptionId
      },
      results: response,
      processingTime
    });

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
      await publishResults({
        texts: req.body.texts,
        context: {
          user_id: userId,
          subscription_id: subscriptionId
        },
        results: {
          query_date: new Date().toISOString().split('T')[0],
          boe_info: null,
          results: []
        },
        processingTime: Date.now() - startTime,
        error
      });
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
  logger.info(`Server running on port ${port}`);
});