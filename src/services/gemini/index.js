import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from '../../utils/logger.js';

// Initialize the Gemini API client
let genAIClient;

function getGeminiClient() {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
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
          model_used: "gemini-2.0-pro-exp-02-05",
          no_content_reason: "No BOE items available for analysis"
        }
      };
    }
    
    logger.info('Starting BOE analysis with Gemini 2.0 Pro (1M context)', {
      reqId,
      contentSize: {
        itemCount: boeItems.length,
        contentSize: JSON.stringify(boeItems).length,
        querySize: prompt.length
      }
    });

    // Get the Gemini model
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-pro-exp-02-05",
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
    
    // Prepare the BOE content
    const inputMessage = JSON.stringify(boeItems);
    
    // Send the message and get the response
    try {
      const result = await chatSession.sendMessage(inputMessage);
      const responseText = result.response.text();
      
      // Log the raw response for debugging
      logger.debug({
        reqId,
        rawResponse: responseText.substring(0, 1000) + (responseText.length > 1000 ? '...' : '')
      }, 'Gemini raw response');
      
      // Try to parse the JSON response
      let jsonResponse;
      try {
        // Extract JSON from response (in case there's any text wrapping it)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : responseText;
        
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
        
      } catch (error) {
        logger.error({
          reqId,
          error: error.message,
          responseText: responseText.substring(0, 500) + '...'
        }, 'Failed to parse Gemini response as JSON');
        
        // Return empty matches if parsing fails
        jsonResponse = { matches: [] };
      }
    } catch (geminiError) {
      logger.error({
        reqId,
        error: geminiError.message,
        stack: geminiError.stack
      }, 'Gemini analysis failed');
      
      // Return empty matches if Gemini fails completely
      jsonResponse = { 
        matches: [],
        error: geminiError.message
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
    logger.error('Gemini analysis failed', {
      reqId,
      error: error.message,
      stack: error.stack
    });
    
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