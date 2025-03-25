import OpenAI from 'openai';
import dotenv from 'dotenv';
import { getEnhancedSystemPrompt } from './src/services/openai/helpers.js';

dotenv.config();

// Configure the OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Sample BOE items
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
  },
  {
    title: "Real Decreto 389/2025, de 22 de marzo, por el que se establecen las bases reguladoras para la concesión de ayudas estatales destinadas a la renovación de flotas de transporte de mercancías y viajeros por carretera.",
    publication_date: "2025-03-25",
    document_date: "2025-03-22",
    href: "https://www.boe.es/boe/dias/2025/03/25/pdfs/BOE-A-2025-5678.pdf",
    section: "I. Disposiciones generales",
    department: "MINISTERIO DE TRANSPORTES Y MOVILIDAD SOSTENIBLE",
    url: "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-5678",
    document_type: "ROYAL_DECREE"
  }
];

async function testGPT4OMini() {
  try {
    console.log("Testing BOE Parser with GPT-4o-mini (200K context)...\n");
    
    // User ID and subscription ID (would come from the request in a real scenario)
    const userId = "65c6074d-dbc4-4091-8e45-b6aecffd9ab9";
    const subscriptionId = "bbcde7bb-bc04-4a0b-8c47-01682a31cc15";
    
    // Example user query
    const userQuery = "Estoy buscando convocatorias y concursos para plazas docentes o investigadoras en universidades";
    
    // Create the enhanced prompt for GPT-4o-mini
    const messages = [
      {
        role: "system",
        content: getEnhancedSystemPrompt()
      },
      {
        role: "user",
        content: `
El usuario con ID ${userId} ha enviado la siguiente consulta para buscar en el Boletín Oficial del Estado (BOE) de hoy:

"${userQuery}"

Tu misión es analizar todos los elementos del BOE y seleccionar ÚNICAMENTE aquellos que corresponden a lo que busca el usuario. Para cada coincidencia, debes generar un título de notificación claro y conciso (máximo 80 caracteres) y un resumen informativo (máximo 200 caracteres) que explique por qué este documento es relevante para la consulta.

A continuación se presentan los elementos del BOE para analizar:

${JSON.stringify(mockBOEItems)}

Por favor, analiza cuidadosamente cada elemento y devuelve los resultados en formato JSON siguiendo EXACTAMENTE la estructura especificada en tus instrucciones. Recuerda que el usuario recibirá notificaciones basadas en tu análisis.
`
      }
    ];
    
    console.log("Sending request to GPT-4o-mini...");
    console.log(`User query: "${userQuery}"`);
    console.log(`Processing ${mockBOEItems.length} BOE items\n`);
    
    // Send the request to OpenAI
    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: messages,
      response_format: { type: "json_object" }
    });
    const endTime = Date.now();
    
    // Parse the result
    const result = JSON.parse(response.choices[0].message.content);
    
    console.log("GPT-4o-mini ANALYSIS RESULTS:");
    console.log("==============================\n");
    
    // Display matches
    if (result.matches && result.matches.length > 0) {
      result.matches.forEach((match, index) => {
        console.log(`Match ${index + 1}:`);
        console.log(`Title: "${match.notification_title}" (${match.notification_title.length} chars)`);
        console.log(`Summary: "${match.summary}" (${match.summary.length} chars)`);
        console.log(`Relevance: ${match.relevance_score}`);
        console.log(`Document Type: ${match.document_type}`);
        console.log(`Department: ${match.department}`);
        console.log("---\n");
      });
    } else {
      console.log("No relevant matches found for the query.\n");
    }
    
    // Display processing stats
    console.log("Processing Stats:");
    console.log(`Total matches: ${result.matches?.length || 0}`);
    console.log(`Max relevance: ${result.metadata?.max_relevance || 0}`);
    console.log(`Processing time: ${(endTime - startTime) / 1000} seconds\n`);
    
    // What happens next with these results?
    console.log("WHAT HAPPENS NEXT:");
    console.log("=================");
    console.log("1. The BOE parser publishes these results to the PubSub 'processor-results' topic");
    console.log("2. The Notification Worker service receives the message from the topic");
    console.log("3. For each match, the Notification Worker:");
    console.log("   - Creates a notification record in the database");
    console.log("   - Sends a real-time notification via WebSocket");
    console.log("   - Publishes to email notification topics based on user preferences");
    console.log("4. The Email Notification service sends emails for immediate alerts");
    console.log("5. Users see the notification with the title and summary we generated");
    
  } catch (error) {
    console.error("Error in test:", error);
  }
}

testGPT4OMini();