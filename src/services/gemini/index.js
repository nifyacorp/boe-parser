import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from '../../utils/logger.js';
import { getSecret } from '../../utils/secrets.js';

// Initialize the Gemini API client
let genAIClient;

async function getGeminiClient() {
  if (!genAIClient) {
    // Try to get API key from environment variable first
    let apiKey = process.env.GEMINI_API_KEY;
    
    // If not found in env vars, try to fetch from Secret Manager
    if (!apiKey) {
      try {
        logger.info('GEMINI_API_KEY not found in environment, attempting to fetch from Secret Manager');
        apiKey = await getSecret('GEMINI_API_KEY');
        // Cache the API key in memory to avoid repeated Secret Manager calls
        process.env.GEMINI_API_KEY = apiKey;
      } catch (error) {
        logger.error({ error: error.message }, 'Failed to fetch GEMINI_API_KEY from Secret Manager');
        throw new Error('GEMINI_API_KEY not available in environment or Secret Manager');
      }
    }
    
    genAIClient = new GoogleGenerativeAI(apiKey);
  }
  return genAIClient;
}

export async function analyzeWithGemini(boeItems, prompt, reqId, requestPayload = {}) {
  try {
    // Check if there are BOE items to analyze
    if (!boeItems || boeItems.length === 0) {
      logger.warn({ reqId, prompt }, 'No BOE items to analyze. Returning empty result set.');
      return {
        matches: [],
        metadata: {
          model_used: "gemini-2.0-flash-lite",
          no_content_reason: "No BOE items available for analysis"
        }
      };
    }
    
    logger.info({
      reqId,
      contentSize: {
        itemCount: boeItems.length,
        contentSize: JSON.stringify(boeItems).length,
        querySize: prompt.length
      }
    }, 'Starting BOE analysis with Gemini 2.0 Flash Lite');

    // Get the Gemini model - using flash-lite instead of pro to avoid rate limits
    const genAI = await getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite", // Changed from gemini-2.0-pro-exp-02-05 to avoid rate limiting
    });
    
    // Configuration for structured output
    const generationConfig = {
      temperature: 0.2, // Lower temperature for more deterministic results
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: "text/plain",
    };
    
    // Create a system prompt that requests structured JSON output
    const systemPrompt = `
    Analiza el contenido del Boletín Oficial del Estado (BOE) y encuentra documentos relevantes para la consulta del usuario.
    
    La consulta del usuario es: "${prompt}"
    
    Instrucciones importantes:
    1. Busca documentos del BOE que sean relevantes para esta consulta
    2. Asigna una puntuación de relevancia (0-100) a cada documento encontrado
    3. Devuelve solo los documentos con puntuación > 70
    4. Para cada documento relevante, incluye:
       - título (máximo 80 caracteres)
       - un título optimizado para notificación (máximo 80 caracteres)
       - resumen (máximo 200 caracteres)
       - puntuación de relevancia
       - URL del documento
       - tipo de documento
    5. Devuelve la respuesta como JSON válido con esta estructura:
    
    {
      "matches": [
        {
          "document_type": "TIPO_DOCUMENTO",
          "title": "TÍTULO_CONCISO",
          "notification_title": "TÍTULO_OPTIMIZADO_PARA_NOTIFICACIÓN",
          "issuing_body": "ORGANISMO_EMISOR",
          "summary": "RESUMEN_BREVE",
          "relevance_score": PUNTUACIÓN_NUMÉRICA,
          "links": {
            "html": "URL_HTML",
            "pdf": "URL_PDF"
          }
        }
      ]
    }
    
    Si no hay resultados relevantes, devuelve un array "matches" vacío. Incluye solo documentos realmente relevantes.
    
    IMPORTANTE: Si no encuentras ningún documento realmente relevante, es mejor devolver un array vacío que forzar coincidencias con baja relevancia.
    `;
    
    // Start a chat session with history
    const chatSession = model.startChat({
      generationConfig,
      history: [
        {
          role: "user",
          parts: [{ text: systemPrompt }]
        }
      ],
    });
    
    // Prepare the BOE content - send raw data as is
    // First, log the structure of the items we're sending to Gemini
    logger.info({
      reqId, 
      itemsCount: boeItems.length,
      sampleItem: boeItems.length > 0 ? JSON.stringify(boeItems[0]).substring(0, 200) : 'No items'
    }, 'BOE items structure before sending to Gemini');
    
    // Create a more focused prompt with raw BOE data
    // First, try to filter items related to the query to focus on potentially relevant items
    const keywords = prompt.toLowerCase().split(' ');
    
    // Filter items that might be related to the prompt (based on title content)
    const filteredItems = boeItems.filter(item => {
      if (!item.title) return false;
      const title = item.title.toLowerCase();
      return keywords.some(keyword => {
        // Only use keywords with length >= 5 to avoid common words
        return keyword.length >= 5 && title.includes(keyword);
      });
    });
    
    // Use filtered items if we have some, otherwise use a limited subset of all items
    let selectedItems = filteredItems.length > 0 ? filteredItems : boeItems;
    
    // Further limit items to avoid exceeding token limits
    const limitedBoeItems = selectedItems.length > 50 ? selectedItems.slice(0, 50) : selectedItems;
    
    logger.info({
      reqId,
      originalItemCount: boeItems.length,
      filteredItemCount: filteredItems.length,
      finalItemCount: limitedBoeItems.length,
      keywords: keywords.filter(k => k.length >= 5)
    }, 'Filtered and limited BOE items for Gemini analysis');
    
    const rawDataPrompt = `
    Estás analizando datos del Boletín Oficial del Estado (BOE) para la siguiente consulta:
    
    "${prompt}"
    
    DATOS DEL BOE (mostrando ${limitedBoeItems.length} de ${boeItems.length} disposiciones):
    ${JSON.stringify(limitedBoeItems, null, 2)}
    
    INSTRUCCIONES IMPORTANTES:
    1. Analiza cuidadosamente los datos del BOE proporcionados
    2. Encuentra disposiciones relevantes para la consulta del usuario
    3. Asigna una puntuación de relevancia (0-100) a cada resultado
    4. Devuelve SOLO las disposiciones con relevancia > 70
    5. Si no hay resultados relevantes, devuelve un array vacío
    
    FORMATO DE RESPUESTA:
    Responde ÚNICAMENTE con JSON válido con esta estructura:
    
    {
      "matches": [
        {
          "document_type": "TIPO_DOCUMENTO",
          "title": "TÍTULO_ORIGINAL_DEL_BOE",
          "notification_title": "TÍTULO_OPTIMIZADO_PARA_NOTIFICACIÓN",
          "issuing_body": "ORGANISMO_EMISOR",
          "summary": "RESUMEN_BREVE",
          "relevance_score": PUNTUACIÓN_NUMÉRICA,
          "links": {
            "html": "URL_HTML",
            "pdf": "URL_PDF"
          }
        }
      ]
    }`;
    
    // Send the message and get the response
    let jsonResponse;
    try {
      // Log attempt to process with Gemini
      logger.info({
        reqId,
        model: "gemini-2.0-flash-lite",
        promptLength: prompt.length,
        itemsCount: boeItems.length
      }, 'Sending request to Gemini API');

      // Use the raw data prompt instead of just sending the BOE items
      const result = await chatSession.sendMessage(rawDataPrompt);
      const responseText = result.response.text();
      
      // Log the raw response for debugging
      logger.info({
        reqId,
        responseLength: responseText.length,
        responsePreview: responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '')
      }, 'Received response from Gemini');
      
      // Try to parse the JSON response
      try {
        // Extract JSON from response (in case there's any text wrapping it)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          logger.error({
            reqId,
            responseText: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
          }, 'No JSON object found in Gemini response');
          
          jsonResponse = { matches: [] };
        } else {
          const jsonString = jsonMatch[0];
          
          logger.debug({
            reqId,
            extractedJson: jsonString.substring(0, 200) + (jsonString.length > 200 ? '...' : '')
          }, 'Extracted JSON from Gemini response');
          
          jsonResponse = JSON.parse(jsonString);
          
          // Ensure the response has the correct structure
          if (!jsonResponse.matches) {
            logger.warn({
              reqId,
              responseStructure: Object.keys(jsonResponse).join(',')
            }, 'Gemini response missing matches array');
            
            jsonResponse = { matches: [] };
          }
          
          // Validate each match
          jsonResponse.matches = jsonResponse.matches.map(match => {
            // Ensure title length <= 80 chars
            if (match.title && match.title.length > 80) {
              match.title = match.title.substring(0, 77) + '...';
            }
            
            // Ensure notification_title length <= 80 chars
            if (match.notification_title && match.notification_title.length > 80) {
              match.notification_title = match.notification_title.substring(0, 77) + '...';
            } else if (!match.notification_title && match.title) {
              // Create notification_title from title if missing
              match.notification_title = match.title.length > 80 ? 
                match.title.substring(0, 77) + '...' : match.title;
            }
            
            // Ensure summary length <= 200 chars
            if (match.summary && match.summary.length > 200) {
              match.summary = match.summary.substring(0, 197) + '...';
            }
            
            // Ensure relevance_score is a number
            if (typeof match.relevance_score !== 'number') {
              match.relevance_score = parseFloat(match.relevance_score) || 75;
            }
            
            return match;
          });
        }
      } catch (parseError) {
        logger.error({
          reqId,
          error: parseError.message,
          errorType: parseError.name,
          responseText: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
        }, 'Failed to parse Gemini response as JSON');
        
        // Return empty matches if parsing fails
        jsonResponse = { 
          matches: [],
          metadata: {
            error: parseError.message,
            error_type: 'JsonParsingError'
          }
        };
      }
    } catch (geminiError) {
      // Detailed error logging
      const errorObj = {
        reqId,
        errorMessage: geminiError.message,
        errorName: geminiError.name,
        errorCode: geminiError.code || 'unknown',
        stack: geminiError.stack
      };
      
      // Check for specific Gemini error types
      if (geminiError.response) {
        errorObj.statusCode = geminiError.response.status || 'unknown';
        errorObj.statusText = geminiError.response.statusText || 'unknown';
        errorObj.responseData = geminiError.response.data || 'no data';
      }
      
      logger.error(errorObj, 'Gemini API request failed');
      console.error('Gemini analysis error details:', JSON.stringify(errorObj, null, 2));
      
      // Return empty matches if Gemini fails completely
      jsonResponse = { 
        matches: [],
        metadata: {
          error: geminiError.message,
          error_type: geminiError.name || 'GeminiApiError',
          error_code: geminiError.code || 'unknown'
        }
      };
    }
    
    // Log matches count
    logger.info('Gemini analysis completed', {
      reqId,
      matchCount: jsonResponse.matches.length
    });
    
    return {
      matches: jsonResponse.matches || [],
      metadata: {
        model_used: "gemini-2.0-pro-exp-02-05"
      }
    };
    
  } catch (error) {
    logger.error({
      reqId,
      error: error.message,
      stack: error.stack
    }, 'Gemini analysis failed');
    
    // Return empty result in case of error
    return {
      matches: [],
      metadata: {
        error: error.message,
        error_type: error.name,
        model_used: "gemini-2.0-pro-exp-02-05"
      }
    };
  }
}