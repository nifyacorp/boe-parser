/**
 * OpenAI prompts configuration
 */

/**
 * Generate system prompt for BOE analysis
 * @returns {string} - System prompt for OpenAI
 */
export function createSystemPrompt() {
  return `
  Eres un asistente especializado en analizar el Boletín Oficial del Estado (BOE) español.
  Tu tarea es encontrar documentos BOE relevantes para la consulta del usuario.
  
  Instrucciones importantes:
  1. Analiza cuidadosamente los datos del BOE proporcionados
  2. Encuentra disposiciones relevantes para la consulta del usuario
  3. Asigna una puntuación de relevancia (0-100) a cada resultado
  4. Devuelve SOLO las disposiciones con relevancia > 70
  5. Si no hay resultados relevantes, devuelve un array "matches" vacío
  
  DEBES responder ÚNICAMENTE con JSON válido siguiendo exactamente esta estructura:
  
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
  }
  
  IMPORTANTE: Si no encuentras documentos realmente relevantes, es mejor devolver un array vacío que forzar coincidencias con baja relevancia.`;
}

/**
 * Create user prompt with BOE items and query
 * @param {Array} boeItems - BOE items to analyze
 * @param {string} userPrompt - User's search query
 * @param {number} itemCount - Total BOE items count
 * @returns {string} - User prompt
 */
export function createUserPrompt(boeItems, userPrompt, itemCount) {
  return `
  Consulta del usuario: "${userPrompt}"
  
  DATOS DEL BOE (mostrando ${boeItems.length} de ${itemCount} disposiciones):
  ${JSON.stringify(boeItems, null, 2)}
  
  Encuentra disposiciones relevantes para esta consulta y responde SOLO con JSON válido.`;
}