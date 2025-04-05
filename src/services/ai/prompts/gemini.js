/**
 * Gemini prompts configuration
 */

/**
 * Generate system prompt for BOE analysis
 * @param {string} userPrompt - User's search prompt
 * @returns {string} - System prompt for Gemini
 */
export function createSystemPrompt(userPrompt) {
  return `
  Analiza el contenido del Boletín Oficial del Estado (BOE) y encuentra documentos relevantes para la consulta del usuario.
  
  La consulta del usuario es: "${userPrompt}"
  
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
}

/**
 * Create content analysis prompt
 * @param {Array} boeItems - BOE items to analyze
 * @param {string} userPrompt - User's search prompt
 * @param {number} itemCount - Total BOE items count
 * @returns {string} - Content analysis prompt
 */
export function createContentPrompt(boeItems, userPrompt, itemCount) {
  return `
  Estás analizando datos del Boletín Oficial del Estado (BOE) para la siguiente consulta:
  
  "${userPrompt}"
  
  DATOS DEL BOE (mostrando ${boeItems.length} de ${itemCount} disposiciones):
  ${JSON.stringify(boeItems, null, 2)}
  
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
}