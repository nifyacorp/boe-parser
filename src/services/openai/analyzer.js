import { logger } from '../../utils/logger.js';
import { getOpenAIClient } from './client.js';
import { processText } from '../textProcessor.js';

/**
 * Process all BOE items in a single request using gpt-4o-mini's large context window
 * @param {Array} items - All BOE items to analyze
 * @param {string} query - User query
 * @param {string} reqId - Request ID for logging
 * @param {Object} requestPayload - Additional request metadata
 * @returns {Promise<Object>} Analysis result
 */
export async function analyzeWithoutChunking(items, query, reqId, requestPayload = {}) {
  try {
    logger.debug({ 
      reqId,
      itemCount: items.length,
      firstItemTitle: items[0]?.title || 'No title',
      queryLength: query.length,
      requestPayload
    }, 'Processing BOE items with gpt-4o-mini');

    const openai = getOpenAIClient(reqId);
    const cleanQuery = processText(query);
    
    // Create a payload with the enhanced prompt and all items
    const payload = createEnhancedPayload(cleanQuery, items, requestPayload);
    
    // Send request to OpenAI
    const response = await openai.chat.completions.create(payload);
    
    // Process and validate the response
    return processResponse(response, reqId);
  } catch (error) {
    return handleAnalysisError(error, items, query, reqId);
  }
}

/**
 * Original chunked analysis function (kept for compatibility)
 */
export async function analyzeChunk(chunk, query, reqId, requestPayload = {}) {
  try {
    logger.debug({ 
      reqId,
      itemCount: chunk.items.length,
      tokenCount: chunk.tokenCount,
      firstItemTitle: chunk.items[0]?.title || 'No title',
      requestPayload
    }, 'Processing chunk');

    const openai = getOpenAIClient(reqId);
    const cleanQuery = processText(query);
    const response = await openai.chat.completions.create(createAnalysisPayload(cleanQuery, chunk.items));
    return processResponse(response, reqId);
  } catch (error) {
    return handleAnalysisError(error, chunk.items, query, reqId);
  }
}

/**
 * Creates an enhanced payload for gpt-4o-mini with improved prompt
 * @param {string} query - User query
 * @param {Array} items - BOE items to analyze
 * @param {Object} requestPayload - Additional request metadata
 * @returns {Object} OpenAI API payload
 */
function createEnhancedPayload(query, items, requestPayload = {}) {
  // Get metadata for contextual information
  const userId = requestPayload.metadata?.user_id || 'unknown';
  const subscriptionId = requestPayload.metadata?.subscription_id || 'unknown';
  
  return {
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: getEnhancedSystemPrompt()
      },
      {
        role: "user",
        content: `
El usuario con ID ${userId} ha enviado la siguiente consulta para buscar en el Boletín Oficial del Estado (BOE) de hoy:

"${query}"

Tu misión es analizar todos los elementos del BOE y seleccionar ÚNICAMENTE aquellos que corresponden a lo que busca el usuario. Para cada coincidencia, debes generar un título de notificación claro y conciso (máximo 80 caracteres) y un resumen informativo (máximo 200 caracteres) que explique por qué este documento es relevante para la consulta.

A continuación se presentan los elementos del BOE para analizar:

${JSON.stringify(items)}

Por favor, analiza cuidadosamente cada elemento y devuelve los resultados en formato JSON siguiendo EXACTAMENTE la estructura especificada en tus instrucciones. Recuerda que el usuario recibirá notificaciones basadas en tu análisis.
`
      }
    ],
    response_format: { type: "json_object" }
  };
}

/**
 * Original payload creation function (kept for compatibility)
 */
function createAnalysisPayload(query, chunk) {
  return {
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: getSystemPrompt()
      },
      {
        role: "user",
        content: `User Query: ${query}\n\nBOE Content: ${JSON.stringify(chunk)}`
      }
    ],
    response_format: { type: "json_object" }
  };
}

/**
 * Enhanced system prompt for gpt-4o-mini
 */
function getEnhancedSystemPrompt() {
  return `Eres un asistente especializado en el análisis del Boletín Oficial del Estado (BOE) español. Tu tarea es analizar meticulosamente los documentos del BOE y encontrar aquellos que coincidan con la consulta del usuario.

# CONTEXTO
El usuario está utilizando una aplicación llamada NIFYA que le permite recibir notificaciones cuando aparecen publicaciones en el BOE relacionadas con sus intereses. Tu análisis se convertirá directamente en notificaciones personalizadas para el usuario.

# TU MISIÓN
1. Leer la consulta del usuario con atención para entender exactamente qué tipo de información busca
2. Analizar cada documento del BOE proporcionado
3. Identificar SOLO los documentos verdaderamente relevantes para la consulta (con puntuación de relevancia ≥ 0.7)
4. Para cada coincidencia, crear un título de notificación y un resumen personalizados
5. Devolver la información en formato JSON con la estructura exacta especificada

# FORMATO DE RESPUESTA REQUERIDO
{
  "matches": [{
    "document_type": "string (RESOLUTION, ORDER, ROYAL_DECREE, LAW, ANNOUNCEMENT)",
    "issuing_body": "string",
    "title": "string (título original del BOE, preservar tal cual)",
    "notification_title": "string (MÁXIMO 80 CARACTERES - ver requisitos)",
    "dates": {
      "document_date": "YYYY-MM-DD",
      "publication_date": "YYYY-MM-DD"
    },
    "code": "string",
    "section": "string",
    "department": "string",
    "links": {
      "pdf": "string",
      "html": "string"
    },
    "relevance_score": "number (0-1)",
    "summary": "string (MÁXIMO 200 CARACTERES - ver requisitos)"
  }],
  "metadata": {
    "match_count": "number",
    "max_relevance": "number"
  }
}

# REQUISITOS PARA NOTIFICATION_TITLE (MÁXIMO 80 CARACTERES)
- DEBE seguir el formato: [TipoDoc]: [Tema Principal] - [Organismo Emisor]
- Ejemplos:
  * "Resolución: Ayudas para renovación de vehículos - Min. Transportes"
  * "Convocatoria: Becas universitarias curso 2025-2026 - Min. Educación"
  * "Ley: Presupuestos Generales del Estado 2025"
- DEBE ser claro, descriptivo e informativo para notificaciones
- NO DEBE exceder los 80 caracteres bajo ninguna circunstancia
- DEBE estar en español
- NO uses títulos genéricos como "Documento BOE" o "Nueva notificación"

# REQUISITOS PARA SUMMARY (MÁXIMO 200 CARACTERES)
- DEBE explicar por qué este documento coincide con la consulta del usuario
- DEBE destacar fechas clave, plazos o requisitos importantes
- DEBE proporcionar información procesable relevante para la consulta
- NO DEBE exceder los 200 caracteres bajo ninguna circunstancia
- DEBE estar en español
- Formato: Texto claro y conciso que explique la relevancia para la consulta

# REQUISITOS TÉCNICOS CRÍTICOS
1. La respuesta DEBE ser un JSON válido - sin formato markdown, sin backticks
2. Todos los campos son OBLIGATORIOS - usa cadenas vacías o 0 para valores faltantes
3. LÍMITES ESTRICTOS DE LONGITUD: notification_title ≤ 80 caracteres, summary ≤ 200 caracteres
4. Incluye SOLO coincidencias relevantes para la consulta del usuario con relevance_score ≥ 0.7
5. Si NO existen coincidencias relevantes, devuelve un array de matches vacío
6. La puntuación de relevancia debe reflejar con precisión cuán bien coincide el documento con la consulta

# CONSIDERACIONES FINALES
- Prioriza la calidad sobre la cantidad - es mejor tener pocas coincidencias precisas que muchas vagas
- Si hay varios documentos similares, incluye solo los más relevantes
- Asegúrate de que el título de notificación y el resumen contengan información diferente y complementaria`;
}

/**
 * Original system prompt (kept for compatibility)
 */
function getSystemPrompt() {
  return `You are a BOE (Boletín Oficial del Estado) analysis assistant. Analyze the provided BOE items and extract key information that matches the user query. Return ONLY a valid JSON object with the EXACT structure shown below.

REQUIRED RESPONSE FORMAT:
{
  "matches": [{
    "document_type": "string (RESOLUTION, ORDER, ROYAL_DECREE, LAW, ANNOUNCEMENT)",
    "issuing_body": "string",
    "title": "string (original BOE title, preserve as-is)",
    "notification_title": "string (EXACTLY 80 CHARS MAX - see rules below)",
    "dates": {
      "document_date": "YYYY-MM-DD",
      "publication_date": "YYYY-MM-DD"
    },
    "code": "string",
    "section": "string",
    "department": "string",
    "links": {
      "pdf": "string",
      "html": "string"
    },
    "relevance_score": "number (0-1)",
    "summary": "string (EXACTLY 200 CHARS MAX - see rules below)"
  }],
  "metadata": {
    "match_count": "number",
    "max_relevance": "number"
  }
}

NOTIFICATION_TITLE REQUIREMENTS (EXACTLY 80 CHARS MAX):
- MUST follow format: [DocType]: [Key Subject] - [Issuing Body]
- Examples:
  * "Resolución: Ayudas para renovación de vehículos - Min. Transportes"
  * "Convocatoria: Becas universitarias curso 2025-2026 - Min. Educación"
  * "Ley: Presupuestos Generales del Estado 2025"
- MUST be clear, descriptive, and informative for notifications
- ABSOLUTELY MUST NOT exceed 80 characters
- MUST be in Spanish
- DO NOT use generic titles like "BOE document" or "New notification"

SUMMARY REQUIREMENTS (EXACTLY 200 CHARS MAX):
- MUST explain why this document matches the user query
- MUST highlight key dates, deadlines, or requirements
- MUST provide actionable information relevant to the query
- ABSOLUTELY MUST NOT exceed 200 characters
- MUST be in Spanish
- Format: Clear, concise text explaining relevance to query

CRITICAL TECHNICAL REQUIREMENTS:
1. Response MUST be VALID JSON - no markdown formatting, no backticks
2. All fields are REQUIRED - use empty strings or 0 for missing values
3. STRICT LENGTH LIMITS: notification_title ≤ 80 chars, summary ≤ 200 chars
4. Include ONLY relevant matches to the user query with relevance_score ≥ 0.6
5. If NO relevant matches exist, return empty matches array`;
}

function processResponse(response, reqId) {
  const cleanContent = response.choices[0].message.content.trim()
    .replace(/^```json\s*/, '')
    .replace(/\s*```$/, '');

  try {
    const parsedResponse = JSON.parse(cleanContent);
    
    // Enforce validation and auto-fix issues where possible
    validateResponse(parsedResponse);
    
    // Log structured response details for debugging
    logger.debug({
      reqId,
      matches: parsedResponse.matches.length,
      first_match_title: parsedResponse.matches[0]?.notification_title?.substring(0, 40) || 'No title',
      title_lengths: parsedResponse.matches.map(m => m.notification_title?.length || 0),
      summary_lengths: parsedResponse.matches.map(m => m.summary?.length || 0)
    }, 'Chunk analysis completed with structured notifications');

    return parsedResponse;
  } catch (parseError) {
    throw handleParseError(parseError, response, reqId);
  }
}

function validateResponse(response) {
  const validationErrors = [];
  
  if (!response.matches) {
    validationErrors.push('Missing matches array');
  } else if (!Array.isArray(response.matches)) {
    validationErrors.push('matches is not an array');
  } else {
    // Validate each match
    response.matches.forEach((match, index) => {
      // Check notification_title length constraint (80 chars max)
      if (match.notification_title && match.notification_title.length > 80) {
        // Truncate notification_title to 80 chars if it's too long
        match.notification_title = match.notification_title.substring(0, 77) + '...';
        validationErrors.push(`Match ${index}: notification_title exceeds 80 chars, truncated`);
      }
      
      // Check summary length constraint (200 chars max)
      if (match.summary && match.summary.length > 200) {
        // Truncate summary to 200 chars if it's too long
        match.summary = match.summary.substring(0, 197) + '...';
        validationErrors.push(`Match ${index}: summary exceeds 200 chars, truncated`);
      }
      
      // Ensure relevance_score is a number between 0-1
      if (typeof match.relevance_score !== 'number' || match.relevance_score < 0 || match.relevance_score > 1) {
        match.relevance_score = typeof match.relevance_score === 'number' 
          ? Math.max(0, Math.min(1, match.relevance_score)) 
          : 0.5;
        validationErrors.push(`Match ${index}: invalid relevance_score, normalized`);
      }
    });
  }
  
  if (!response.metadata) {
    response.metadata = { match_count: response.matches?.length || 0, max_relevance: 0 };
    validationErrors.push('Missing metadata, created default');
  } else {
    if (typeof response.metadata.match_count !== 'number') {
      response.metadata.match_count = response.matches?.length || 0;
      validationErrors.push('Invalid match_count, set to matches length');
    }
    if (typeof response.metadata.max_relevance !== 'number') {
      const maxRelevance = response.matches?.length 
        ? Math.max(...response.matches.map(m => m.relevance_score || 0)) 
        : 0;
      response.metadata.max_relevance = maxRelevance;
      validationErrors.push('Invalid max_relevance, calculated from matches');
    }
  }
  
  if (validationErrors.length > 0) {
    logger.warn(`Response validation issues: ${validationErrors.join(', ')}`);
    // We don't throw an error anymore, just log warnings and fix the issues
  }
}

function handleParseError(error, response, reqId) {
  logger.error({ 
    reqId,
    errorType: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    rawResponse: {
      content: response.choices[0].message.content,
      length: response.choices[0].message.content.length,
      firstChars: response.choices[0].message.content.substring(0, 100)
    }
  }, 'Failed to parse OpenAI response');
  return error;
}

function handleAnalysisError(error, chunk, query, reqId) {
  const errorDetails = {
    reqId,
    errorType: error.name,
    errorMessage: error.message,
    errorCode: error.code,
    errorStatus: error.status
  };

  if (error.response) {
    errorDetails.openaiError = {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data
    };
  }

  logger.error({ 
    ...errorDetails,
    context: {
      chunkSize: chunk.length,
      queryLength: query.length,
      modelUsed: "gpt-4o-mini",
      firstItemTitle: chunk[0]?.title || 'No title'
    }
  }, 'Chunk analysis failed');

  return { matches: [], metadata: { match_count: 0, max_relevance: 0 } };
}