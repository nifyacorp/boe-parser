/**
 * Test script to fix the notification issue 
 * - Creates a valid BOE message with documents in matches
 * - This script should be run directly on the BOE parser service
 */

import { publishResults } from './src/utils/pubsub.js';

// Create a sample BOE result with valid document structure
const createSampleMessage = (userId, subscriptionId, includeDocuments = true) => {
  // Base message structure
  const message = {
    request: {
      user_id: userId,
      subscription_id: subscriptionId,
      prompts: ["quiero ser funcionario"]
    },
    results: {
      query_date: new Date().toISOString().split('T')[0],
      matches: [
        {
          prompt: "quiero ser funcionario",
          documents: includeDocuments ? [
            {
              document_type: "Convocatoria",
              title: "Resolución de 25 de marzo de 2025, de la Subsecretaría, por la que se convoca proceso selectivo para ingreso en el Cuerpo Superior de Administradores Civiles del Estado",
              notification_title: "Convocatoria: Proceso selectivo Cuerpo Superior Administradores Civiles",
              issuing_body: "Ministerio de Hacienda y Función Pública",
              summary: "Convocatoria de oposiciones para el Cuerpo Superior de Administradores Civiles. Plazo de presentación: 20 días hábiles. 150 plazas, de las cuales 15 son de promoción interna.",
              relevance_score: 0.95,
              links: {
                html: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-5678",
                pdf: "https://www.boe.es/boe/dias/2025/03/26/pdfs/BOE-A-2025-5678.pdf"
              },
              publication_date: new Date().toISOString(),
              section: "II.B",
              bulletin_type: "BOE"
            }
          ] : []
        }
      ]
    },
    trace_id: `test-notification-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    processor_type: "boe",
    timestamp: new Date().toISOString(),
    metadata: {
      processing_time_ms: 1243,
      total_items_processed: 1,
      total_matches: includeDocuments ? 1 : 0,
      model_used: "gemini-2.0-pro-exp-02-05",
      status: "success",
      error: null
    }
  };

  return message;
};

// This function tests if we can publish a valid notification message
const testBOEMessage = async (includeDocuments = true) => {
  try {
    console.log(`Creating test BOE message ${includeDocuments ? 'with' : 'WITHOUT'} documents...`);
    
    // Replace these with actual values from your system
    const userId = process.env.TEST_USER_ID || "65c6074d-dbc4-4091-8e45-b6aecffd9ab9";
    const subscriptionId = process.env.TEST_SUBSCRIPTION_ID || "bbcde7bb-bc04-4a0b-8c47-01682a31cc15";
    
    console.log(`Using test parameters: userId=${userId}, subscriptionId=${subscriptionId}`);
    
    // Create the test message
    const message = createSampleMessage(userId, subscriptionId, includeDocuments);
    
    console.log(`Message created with trace_id: ${message.trace_id}`);
    console.log('Message structure matches the example from production logs:', includeDocuments ? 'No' : 'Yes');
    console.log('Documents included:', includeDocuments ? 'Yes' : 'No (empty array)');
    
    // Publish the message to PubSub
    console.log('Publishing message to PubSub...');
    const messageId = await publishResults(message);
    
    console.log(`✅ Message published successfully with messageId: ${messageId}`);
    console.log('The notification worker should now process this message.');
    console.log('Check notification worker logs for trace_id:', message.trace_id);
    
    if (includeDocuments) {
      console.log('EXPECTED OUTCOME: Notification will be created (documents included)');
    } else {
      console.log('EXPECTED OUTCOME: No notification will be created (empty documents array)');
    }
    
    return { success: true, messageId, traceId: message.trace_id, includeDocuments };
  } catch (error) {
    console.error('❌ Failed to publish test message:', error);
    return { success: false, error: error.message };
  }
};

// Run both tests - one with documents and one without
async function runTests() {
  console.log('====== TEST 1: MESSAGE WITH DOCUMENTS ======');
  const test1Result = await testBOEMessage(true);
  console.log('\n');
  
  console.log('====== TEST 2: MESSAGE WITHOUT DOCUMENTS (EMPTY ARRAY) ======');
  const test2Result = await testBOEMessage(false);
  console.log('\n');
  
  console.log('====== TEST SUMMARY ======');
  console.log('Test 1 (With Documents):', test1Result.success ? '✅ Passed' : '❌ Failed');
  console.log('Test 2 (Empty Documents):', test2Result.success ? '✅ Passed' : '❌ Failed');
  
  return test1Result.success && test2Result.success;
}

// Run all tests
runTests()
  .then(allTestsPassed => {
    console.log(`\nAll tests completed ${allTestsPassed ? 'successfully' : 'with failures'}`);
    process.exit(allTestsPassed ? 0 : 1);
  })
  .catch(error => {
    console.error('Unhandled error during tests:', error);
    process.exit(1);
  });