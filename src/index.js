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

import { getSecret } from './utils/secrets.js';

// Check for required environment variables at startup
async function checkRequiredEnvVars() {
  const requiredVars = [
    'GEMINI_API_KEY'
    // BOE_API_KEY is fetched from Secret Manager with name PARSER_API_KEY
  ];
  
  const missingVars = [];
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      // Try to load from Secret Manager
      try {
        console.log(`${varName} not found in environment, attempting to load from Secret Manager...`);
        const secretValue = await getSecret(varName);
        if (secretValue) {
          // Cache the value in the environment
          process.env[varName] = secretValue;
          console.log(`Successfully loaded ${varName} from Secret Manager`);
        } else {
          missingVars.push(varName);
        }
      } catch (error) {
        console.error(`Failed to load ${varName} from Secret Manager: ${error.message}`);
        missingVars.push(varName);
      }
    }
  }
  
  if (missingVars.length > 0) {
    console.error('ERROR: Missing required environment variables:', missingVars.join(', '));
    console.error('The application might not function correctly without these variables.');
    
    // For Gemini API key, add specific information
    if (missingVars.includes('GEMINI_API_KEY')) {
      console.error('GEMINI_API_KEY is required for the BOE analyzer to function.');
      console.error('You can use a Secret Manager reference like projects/PROJECT_ID/secrets/GEMINI_API_KEY/versions/latest');
    }
    
    // Don't exit to allow Cloud Run to still start the service,
    // but log a warning that functionality will be limited
    console.warn('WARNING: Starting service with limited functionality due to missing environment variables.');
  } else {
    console.log('All required environment variables are set.');
  }
}

// Check environment variables at startup (async)
checkRequiredEnvVars().catch(error => {
  console.error('Error during environment check:', error.message);
});

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

// Test Gemini API key endpoint
app.get('/check-gemini', async (req, res) => {
  const reqId = req.id;
  
  try {
    logger.info({ reqId }, 'Testing Gemini API connection');
    
    // Get the Gemini client
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    
    // Get API key from environment or Secret Manager
    let apiKey = process.env.GEMINI_API_KEY;
    
    // If not in environment, try Secret Manager
    if (!apiKey) {
      try {
        logger.info({ reqId }, 'GEMINI_API_KEY not found in environment, attempting to fetch from Secret Manager');
        apiKey = await getSecret('GEMINI_API_KEY');
        // Cache for future use
        process.env.GEMINI_API_KEY = apiKey;
      } catch (secretError) {
        logger.error({ reqId, error: secretError.message }, 'Failed to fetch GEMINI_API_KEY from Secret Manager');
      }
    }
    
    if (!apiKey) {
      logger.error({ reqId }, 'GEMINI_API_KEY not available in environment or Secret Manager');
      return res.status(500).json({ 
        status: 'ERROR', 
        error: 'GEMINI_API_KEY not available in environment or Secret Manager' 
      });
    }
    
    logger.info({ reqId, keyLength: apiKey.length }, 'API key found, initializing Gemini');
    
    // Initialize the client
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Get the model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-pro-exp-02-05",
    });
    
    // Try a simple generation to test the API key
    logger.info({ reqId }, 'Sending test prompt to Gemini API');
    
    const result = await model.generateContent("Respond with 'Gemini API is working!' if you can read this message.");
    const response = await result.response.text();
    
    logger.info({ reqId, response }, 'Received response from Gemini API');
    
    // Check if the response contains the expected phrase
    const isWorking = response.includes('working') || response.includes('Gemini');
    
    res.json({
      status: isWorking ? 'OK' : 'WARNING',
      gemini_api: isWorking ? 'Connected' : 'Unexpected response',
      response: response,
      version: process.env.VERSION || '1.0.0'
    });
  } catch (error) {
    logger.error({ 
      reqId, 
      error: error.message,
      errorName: error.name,
      stack: error.stack
    }, 'Gemini API test failed');
    
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      error_type: error.name || 'Unknown',
      suggestion: 'Check if GEMINI_API_KEY is properly set in environment variables'
    });
  }
});

// Test endpoint to trigger the BOE parser process and return diagnostic information
app.post('/test-analyze', async (req, res) => {
  const reqId = req.id;
  const startTime = Date.now();
  
  try {
    logger.info({ reqId }, 'Test analyze endpoint triggered');
    
    // Get parameters from request or use defaults
    const texts = req.body.texts || ["dime todas las disposiciones de personal"];
    const userId = req.body.userId || "65c6074d-dbc4-4091-8e45-b6aecffd9ab9";
    const subscriptionId = req.body.subscriptionId || "bbcde7bb-bc04-4a0b-8c47-01682a31cc15";
    const date = req.body.date || new Date().toISOString().split('T')[0];
    
    // Step 1: Fetch and parse BOE content
    logger.info({ reqId, date }, 'Fetching BOE content for test');
    const boeContent = await scrapeWebsite(date, reqId);
    
    // Log the number of BOE items found
    logger.info({ 
      reqId, 
      itemCount: boeContent.items.length,
      boeInfo: boeContent.boeInfo,
      firstFewItems: boeContent.items.slice(0, 3).map(item => item.title)
    }, 'BOE content fetched successfully');
    
    if (!boeContent) {
      return res.status(500).json({ 
        error: 'Failed to fetch BOE content',
        reqId,
        timestamp: new Date().toISOString()
      });
    }
    
    // Step 2: Process each text prompt
    logger.info({ reqId, promptCount: texts.length }, 'Processing test prompts');
    
    const results = [];
    const errors = [];
    
    for (let i = 0; i < texts.length; i++) {
      try {
        // Process the input text
        const text = texts[i];
        logger.info({ reqId, promptIndex: i, text }, 'Processing test input text');
        const cleanText = processText(text);
        
        // Analyze with Gemini
        logger.info({ reqId, promptIndex: i }, 'Starting Gemini analysis');
        const analysis = await analyzeWithGemini(boeContent.items, cleanText, reqId, {
          metadata: {
            user_id: userId,
            subscription_id: subscriptionId
          }
        });
        
        results.push({
          prompt: text,
          cleanText,
          matches: analysis.matches,
          metadata: analysis.metadata
        });
      } catch (promptError) {
        logger.error({ 
          reqId, 
          promptIndex: i, 
          error: promptError.message,
          stack: promptError.stack 
        }, 'Error processing test prompt');
        
        errors.push({
          promptIndex: i,
          text: texts[i],
          error: promptError.message
        });
      }
    }
    
    // Prepare diagnostic response
    const processingTime = Date.now() - startTime;
    
    const diagnosticResponse = {
      reqId,
      timestamp: new Date().toISOString(),
      boe_info: boeContent.boeInfo,
      processing_time_ms: processingTime,
      input: {
        texts,
        userId,
        subscriptionId,
        date
      },
      boe_items_count: boeContent.items ? boeContent.items.length : 0,
      results_count: results.length,
      errors_count: errors.length,
      results,
      errors,
      success: errors.length === 0
    };
    
    // Optional: Publish results to PubSub for end-to-end testing
    if (req.body.publishToPubSub === true) {
      try {
        const publishPayload = {
          trace_id: reqId,
          request: {
            texts,
            user_id: userId,
            subscription_id: subscriptionId
          },
          results: {
            query_date: date,
            matches: results.flatMap(r => r.matches.map(m => ({
              ...m,
              prompt: r.prompt
            })))
          },
          processor_type: "boe",
          metadata: {
            processing_time_ms: processingTime,
            total_items_processed: boeContent.items ? boeContent.items.length : 0
          }
        };
        
        const messageId = await publishResults(publishPayload);
        diagnosticResponse.pubsub_message_id = messageId;
        logger.info({ reqId, messageId }, 'Test results published to PubSub');
      } catch (pubsubError) {
        diagnosticResponse.pubsub_error = pubsubError.message;
        logger.error({ reqId, error: pubsubError.message }, 'Failed to publish test results to PubSub');
      }
    }
    
    res.json(diagnosticResponse);
    
  } catch (error) {
    logger.error({ reqId, error: error.message, stack: error.stack }, 'Test analyze endpoint error');
    res.status(500).json({ 
      error: error.message, 
      reqId,
      timestamp: new Date().toISOString()
    });
  }
});

// Fast test endpoint that simulates the subscription flow without slow external BOE fetching
app.post('/test-pubsub', async (req, res) => {
  const reqId = req.id;
  const startTime = Date.now();
  
  try {
    logger.info({ reqId }, 'PubSub test endpoint triggered');
    
    // Get parameters from request or use defaults
    const texts = req.body.texts || ["Ayuntamiento Barcelona licitaciones"];
    const userId = req.body.userId || req.body.user_id || "65c6074d-dbc4-4091-8e45-b6aecffd9ab9";
    const subscriptionId = req.body.subscriptionId || req.body.subscription_id || "bbcde7bb-bc04-4a0b-8c47-01682a31cc15";
    const skipAI = req.body.skipAI === true; // Skip AI processing if specifically requested
    
    logger.info({ 
      reqId, 
      userId, 
      subscriptionId, 
      textsCount: texts.length,
      skipAI
    }, 'Processing PubSub test with parameters');
    
    // Create sample BOE content without external fetching
    const sampleBoeItems = [
      {
        id: "BOE-B-2025-12345",
        title: "Licitación para la contratación del servicio de mantenimiento de parques y jardines del Ayuntamiento de Barcelona",
        content: "El Ayuntamiento de Barcelona anuncia licitación pública para la contratación del servicio de mantenimiento de parques y jardines municipales por un período de 24 meses con posibilidad de prórroga.",
        section: "Sección 5ª. Anuncios y Licitaciones",
        department: "Ayuntamiento de Barcelona",
        document_type: "Licitación",
        publication_date: new Date().toISOString().split('T')[0],
        links: {
          html: "https://www.boe.es/diario_boe/txt.php?id=BOE-B-2025-12345",
          pdf: "https://www.boe.es/boe/dias/2025/04/05/pdfs/BOE-B-2025-12345.pdf"
        }
      },
      {
        id: "BOE-B-2025-12346",
        title: "Subvenciones para proyectos culturales del Ministerio de Cultura",
        content: "Resolución del Ministerio de Cultura por la que se convocan subvenciones para proyectos culturales durante el año 2025.",
        section: "Sección 3ª. Otras disposiciones",
        department: "Ministerio de Cultura",
        document_type: "Subvención", 
        publication_date: new Date().toISOString().split('T')[0],
        links: {
          html: "https://www.boe.es/diario_boe/txt.php?id=BOE-B-2025-12346",
          pdf: "https://www.boe.es/boe/dias/2025/04/05/pdfs/BOE-B-2025-12346.pdf"
        }
      },
      {
        id: "BOE-A-2025-54321",
        title: "Nombramiento de personal directivo en el Ayuntamiento de Barcelona",
        content: "Resolución del Ayuntamiento de Barcelona por la que se publica el nombramiento de personal directivo para el área de desarrollo urbano sostenible.",
        section: "Sección 2ª. Autoridades y personal",
        department: "Ayuntamiento de Barcelona",
        document_type: "Nombramiento",
        publication_date: new Date().toISOString().split('T')[0],
        links: {
          html: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-54321",
          pdf: "https://www.boe.es/boe/dias/2025/04/05/pdfs/BOE-A-2025-54321.pdf"
        }
      }
    ];
    
    // Create a response structure similar to what scrapeWebsite would return
    const mockBoeContent = {
      boeInfo: {
        date: new Date().toISOString().split('T')[0],
        publication_number: "BOE-S-2025-" + Math.floor(Math.random() * 1000),
        url: "https://www.boe.es/boe/dias/2025/04/05/"
      },
      items: sampleBoeItems
    };
    
    logger.info({ reqId, mockItems: mockBoeContent.items.length }, 'Created mock BOE content');
    
    const results = [];
    
    // If skipAI is true, generate mock analysis results
    // Otherwise, run through the actual AI analysis pipeline
    if (skipAI) {
      logger.info({ reqId }, 'Skipping AI processing, using mock analysis results');
      
      // Create mock results for each text prompt based on the sample data
      for (const text of texts) {
        const cleanText = processText(text);
        
        // Generate mock matches by simple keyword matching
        const matches = sampleBoeItems
          .filter(item => {
            const combinedText = (item.title + " " + item.content + " " + item.department).toLowerCase();
            const keywords = cleanText.toLowerCase().split(/\s+/).filter(k => k.length > 3);
            // Match if any keyword appears in the text
            return keywords.some(keyword => combinedText.includes(keyword));
          })
          .map(item => ({
            document_type: item.document_type,
            title: item.title,
            notification_title: `${item.document_type}: ${item.title.substring(0, 50)}${item.title.length > 50 ? '...' : ''}`,
            issuing_body: item.department,
            summary: item.content,
            relevance_score: Math.random() * 0.5 + 0.5, // Random score between 0.5 and 1.0
            links: item.links,
            dates: {
              publication_date: item.publication_date
            },
            department: item.department,
            section: item.section
          }));
        
        results.push({
          prompt: text,
          cleanText,
          matches: matches,
          metadata: {
            processing_type: "mock",
            match_count: matches.length
          }
        });
      }
    } else {
      // Process with real AI analysis
      logger.info({ reqId, promptCount: texts.length }, 'Processing with real AI analysis');
      
      for (let i = 0; i < texts.length; i++) {
        try {
          // Process the input text
          const text = texts[i];
          logger.info({ reqId, promptIndex: i, text }, 'Processing input text');
          const cleanText = processText(text);
          
          // Analyze with Gemini
          logger.info({ reqId, promptIndex: i }, 'Starting Gemini analysis');
          const analysis = await analyzeWithGemini(mockBoeContent.items, cleanText, reqId, {
            metadata: {
              user_id: userId,
              subscription_id: subscriptionId
            }
          });
          
          results.push({
            prompt: text,
            cleanText,
            matches: analysis.matches,
            metadata: analysis.metadata
          });
        } catch (promptError) {
          logger.error({ 
            reqId, 
            promptIndex: i, 
            error: promptError.message,
            stack: promptError.stack 
          }, 'Error processing prompt with AI');
          
          // Add empty result with error
          results.push({
            prompt: texts[i],
            cleanText: processText(texts[i]),
            matches: [],
            error: promptError.message,
            metadata: {
              error: true,
              error_message: promptError.message
            }
          });
        }
      }
    }
    
    // Prepare diagnostic response
    const processingTime = Date.now() - startTime;
    
    // Create a standardized PubSub message
    const publishPayload = {
      trace_id: reqId,
      request: {
        texts,
        user_id: userId,
        subscription_id: subscriptionId
      },
      results: {
        query_date: new Date().toISOString().split('T')[0],
        matches: results.flatMap(r => r.matches.map(m => ({
          ...m,
          prompt: r.prompt
        })))
      },
      processor_type: "boe",
      metadata: {
        processing_time_ms: processingTime,
        total_items_processed: mockBoeContent.items.length,
        is_test: true,
        skip_ai: skipAI
      }
    };
    
    // Publish to PubSub if requested
    let messageId = null;
    if (req.body.publishToPubSub === true) {
      try {
        messageId = await publishResults(publishPayload);
        logger.info({ reqId, messageId }, 'Test results published to PubSub');
      } catch (pubsubError) {
        logger.error({ reqId, error: pubsubError.message }, 'Failed to publish test results to PubSub');
        publishPayload.pubsub_error = pubsubError.message;
      }
    }
    
    const response = {
      status: "success",
      reqId,
      timestamp: new Date().toISOString(),
      processing_time_ms: processingTime,
      pubsub_message_id: messageId,
      message_payload: publishPayload,
      results_summary: {
        prompt_count: texts.length,
        total_matches: publishPayload.results.matches.length,
        matches_per_prompt: results.map(r => ({
          prompt: r.prompt,
          match_count: r.matches.length
        }))
      }
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error({ reqId, error: error.message, stack: error.stack }, 'PubSub test endpoint error');
    res.status(500).json({ 
      status: "error",
      error: error.message, 
      reqId,
      timestamp: new Date().toISOString()
    });
  }
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
    const date = req.body.date || null;
    logger.debug({ reqId, date }, 'Fetching BOE content');
    const boeContent = await scrapeWebsite(date, reqId);
    
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