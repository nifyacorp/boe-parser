/**
 * Test endpoint controllers
 */
import { randomUUID } from 'crypto';
import { getGeminiModel } from '../services/ai/client.js';
import { getOpenAIClient } from '../services/ai/client.js';
import { publishResults } from '../utils/pubsub.js';
import config from '../config/config.js';

// NOTE: These test functions directly interact with AI clients (getGeminiModel, getOpenAIClient)
//       to specifically test the connection to each service. This differs from the main
//       analyze controller which uses the src/services/ai/index.js facade.
//       If the purpose of these tests changes to testing the full analysis flow,
//       consider refactoring to use the analyzeBOEItems facade.

/**
 * Test Gemini API connection
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next
 */
export async function testGemini(req, res, next) {
  try {
    const startTime = Date.now();
    
    console.log(`Testing Gemini API connection - Request ID: ${req.id}`);
    
    // Get Gemini model and test with a simple prompt
    const model = getGeminiModel();
    
    const testPrompt = 'Responde con un simple "OK" si este mensaje se recibe correctamente.';
    
    const generationConfig = {
      temperature: 0.1,
      maxOutputTokens: 100,
    };
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
      generationConfig,
    });
    
    const response = result.response;
    const responseText = response.text();
    
    const processingTime = Date.now() - startTime;
    
    // Create a standardized response
    const apiResponse = {
      status: 'success',
      message: 'Gemini API connection successful',
      data: {
        model: config.services.gemini.model,
        response: responseText,
        processing_time_ms: processingTime
      }
    };
    
    console.log(`Gemini API test completed successfully - Request ID: ${req.id}, Processing Time: ${processingTime}ms, Model: ${config.services.gemini.model}, Response Preview: ${responseText.substring(0, 100)}`);
    
    res.json(apiResponse);
  } catch (error) {
    console.error(`Gemini API test failed - Request ID: ${req.id}, Error:`, error);
    
    // Pass to error handler
    next(error);
  }
}

/**
 * Test OpenAI API connection
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next
 */
export async function testOpenAI(req, res, next) {
  try {
    const startTime = Date.now();
    
    console.log(`Testing OpenAI API connection - Request ID: ${req.id}`);
    
    // Get OpenAI client and test with a simple prompt
    const client = getOpenAIClient();
    
    const response = await client.chat.completions.create({
      model: config.services.openai.model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Respond with a simple "OK" if this message is received correctly.' }
      ],
      temperature: 0.1,
      max_tokens: 50,
    });
    
    const responseText = response.choices[0]?.message?.content || '';
    const processingTime = Date.now() - startTime;
    
    // Create a standardized response
    const apiResponse = {
      status: 'success',
      message: 'OpenAI API connection successful',
      data: {
        model: config.services.openai.model,
        response: responseText,
        processing_time_ms: processingTime,
        usage: response.usage
      }
    };
    
    console.log(`OpenAI API test completed successfully - Request ID: ${req.id}, Processing Time: ${processingTime}ms, Model: ${config.services.openai.model}, Usage:`, response.usage);
    
    res.json(apiResponse);
  } catch (error) {
    console.error(`OpenAI API test failed - Request ID: ${req.id}, Error:`, error);
    
    // Pass to error handler
    next(error);
  }
}

/**
 * Test PubSub integration
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next
 */
export async function testPubSub(req, res, next) {
  try {
    // Generate test data for PubSub
    const traceId = randomUUID();
    const subscriptionId = req.body.subscription_id || 'test-subscription';
    const userId = req.body.user_id || 'test-user';
    const prompts = req.body.texts || ['Test prompt'];
    
    console.log(`Testing PubSub integration - Request ID: ${req.id}, Trace ID: ${traceId}`);
    
    // Create test matches
    const testMatches = [
      {
        document_type: 'boe_document',
        title: 'Test BOE Document Title',
        notification_title: 'Test Notification Title',
        issuing_body: 'Test Issuing Body',
        summary: 'This is a test summary for PubSub testing purposes.',
        relevance_score: 85,
        links: {
          html: 'https://www.boe.es/test',
          pdf: 'https://www.boe.es/test.pdf'
        }
      }
    ];
    
    // Create test payload
    const payload = {
      trace_id: traceId,
      request: {
        texts: prompts,
        subscription_id: subscriptionId,
        user_id: userId
      },
      results: {
        boe_info: {
          issue_number: 'TEST-123',
          publication_date: new Date().toISOString().split('T')[0],
          source_url: 'https://www.boe.es'
        },
        query_date: new Date().toISOString().split('T')[0],
        results: [
          {
            prompt: prompts[0],
            matches: testMatches
          }
        ]
      },
      metadata: {
        processing_time_ms: 1234,
        total_items_processed: 100,
        status: 'success'
      }
    };
    
    // Publish to PubSub
    const messageId = await publishResults(payload);
    
    console.log(`Test message published to PubSub successfully - Request ID: ${req.id}, Message ID: ${messageId}, Trace ID: ${traceId}`);
    
    // Create response
    const response = {
      status: 'success',
      message: 'PubSub test message published successfully',
      data: {
        message_id: messageId,
        trace_id: traceId,
        subscription_id: subscriptionId,
        user_id: userId
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error(`PubSub test failed - Request ID: ${req.id}, Error:`, error);
    
    // Pass to error handler
    next(error);
  }
}