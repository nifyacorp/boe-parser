import OpenAI from 'openai';
import dotenv from 'dotenv';
import { createSystemPrompt } from './src/services/openai/helpers.js';

dotenv.config();

// Configure the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mockBOEItems = [
  {
    title: "Resolución de 15 de marzo de 2025, de la Dirección General de Trabajo, por la que se registra y publica el Convenio colectivo para el sector de la construcción.",
    publication_date: "2025-03-25",
    document_date: "2025-03-15",
    href: "https://www.boe.es/boe/dias/2025/03/25/pdfs/BOE-A-2025-1234.pdf",
    section: "III. Otras disposiciones",
    department: "MINISTERIO DE TRABAJO Y ECONOMÍA SOCIAL",
    url: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-1234",
    document_type: "RESOLUTION"
  },
  {
    title: "Orden DEF/214/2025, de 18 de marzo, por la que se aprueba la convocatoria de proceso selectivo para el acceso por promoción interna, a la Escala de Oficiales del Cuerpo Jurídico Militar.",
    publication_date: "2025-03-25",
    document_date: "2025-03-18",
    href: "https://www.boe.es/boe/dias/2025/03/25/pdfs/BOE-A-2025-2345.pdf",
    section: "II. Autoridades y personal",
    department: "MINISTERIO DE DEFENSA",
    url: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-2345",
    document_type: "ORDER"
  },
  {
    title: "Ley 12/2025, de 20 de marzo, de reforma de la Ley 35/2006, de 28 de noviembre, del Impuesto sobre la Renta de las Personas Físicas y otras normas tributarias.",
    publication_date: "2025-03-25",
    document_date: "2025-03-20",
    href: "https://www.boe.es/boe/dias/2025/03/25/pdfs/BOE-A-2025-3456.pdf",
    section: "I. Disposiciones generales",
    department: "JEFATURA DEL ESTADO",
    url: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-3456",
    document_type: "LAW"
  },
  {
    title: "Anuncio de la Universidad Complutense de Madrid por el que se convoca concurso público para la contratación de personal docente e investigador para el curso académico 2025-2026.",
    publication_date: "2025-03-25",
    document_date: "2025-03-10",
    href: "https://www.boe.es/boe/dias/2025/03/25/pdfs/BOE-B-2025-4567.pdf",
    section: "V. Anuncios",
    department: "UNIVERSIDADES",
    url: "https://www.boe.es/diario_boe/txt.php?id=BOE-B-2025-4567",
    document_type: "ANNOUNCEMENT"
  }
];

async function testStructuredNotifications() {
  try {
    console.log("Testing structured notification generation...\n");
    
    // Example user query
    const userQuery = "Busco información sobre convocatorias de empleo público y procesos selectivos";
    
    const systemPrompt = `You are a BOE (Boletín Oficial del Estado) analysis assistant. Analyze the provided BOE items and extract key information that matches the user query. Return ONLY a valid JSON object with the EXACT structure shown below.

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
    
    // Send the request to OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `User Query: ${userQuery}\n\nBOE Content: ${JSON.stringify(mockBOEItems)}`
        }
      ],
      response_format: { type: "json_object" }
    });
    
    // Parse and display the result
    const result = JSON.parse(response.choices[0].message.content);
    
    console.log("GENERATED STRUCTURED NOTIFICATIONS:");
    console.log("==================================\n");
    
    result.matches.forEach((match, index) => {
      console.log(`Match ${index + 1}:`);
      console.log(`Title: "${match.notification_title}" (${match.notification_title.length} chars)`);
      console.log(`Summary: "${match.summary}" (${match.summary.length} chars)`);
      console.log(`Relevance: ${match.relevance_score}`);
      console.log(`Document Type: ${match.document_type}`);
      console.log(`Department: ${match.department}`);
      console.log("---\n");
    });
    
    console.log(`Total matches: ${result.matches.length}`);
    console.log(`Max relevance: ${result.metadata.max_relevance}`);
    
  } catch (error) {
    console.error("Error in test:", error);
  }
}

testStructuredNotifications();