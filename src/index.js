import express from 'express';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
import { scrapeWebsite } from './services/scraper.js';
import { processText } from './services/textProcessor.js';
import { analyzeWithOpenAI } from './services/openai.js';
import { randomUUID } from 'crypto';
import { getApiDocs } from './utils/apiDocs.js';

const app = express();
const port = parseInt(process.env.PORT) || 8080;
// Remove the DOGA URL since we're now using BOE URL generated in scraper

// Add request ID middleware
app.use((req, res, next) => {
  req.id = randomUUID();
  next();
});

// Add request logging middleware
app.use((req, res, next) => {
  logger.debug({ 
    reqId: req.id,
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body 
  }, 'Incoming request');
  next();
});

app.use(express.json());

app.get('/help', (req, res) => {
  const docs = getApiDocs();
  res.json(docs);
});

app.post('/analyze-text', async (req, res) => {
  const reqId = req.id;
  try {
    const { texts } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      logger.debug({ reqId }, 'Missing or invalid texts array in request body');
      return res.status(400).json({ error: 'Array of text prompts is required' });
    }

    // Step 1: Fetch and parse BOE content (do this once for all prompts)
    logger.debug({ reqId }, 'Fetching BOE content');
    const boeContent = await scrapeWebsite();
    logger.debug({ reqId, itemCount: boeContent.items.length }, 'BOE content fetched');

    const startTime = Date.now();

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

    logger.debug({ reqId, resultCount: results.length }, 'All analyses completed successfully');
    res.json({
      query_date: new Date().toISOString().split('T')[0],
      boe_info: boeContent.boeInfo,
      results,
      metadata: {
        total_items_processed: boeContent.items.length,
        processing_time_ms: processingTime
      }
    });
  } catch (error) {
    logger.error({ 
      reqId,
      error: error.message,
      stack: error.stack,
      code: error.code
    }, 'Error processing text request');
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
});
