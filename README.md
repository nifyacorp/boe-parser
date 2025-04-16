# BOE Parser Service

This service is responsible for parsing and analyzing the Spanish Official Bulletin (BOE) entries using AI to find relevant information based on user queries.

## Architecture Overview

The BOE Parser is built with a modular architecture focused on performance, reliability, and scalability:

```
┌───────────────┐     ┌──────────────┐     ┌───────────────┐     ┌───────────────┐
│  HTTP Request │────▶│ API Controller│────▶│ Parser Service │────▶│   AI Service   │
└───────────────┘     └──────────────┘     └───────────────┘     └───────────────┘
                                                  │                      │
                                                  ▼                      ▼
                                           ┌───────────────┐     ┌───────────────┐
                                           │ External APIs │     │  Gemini API   │
                                           └───────────────┘     └───────────────┘
                                                  │                      │
                                                  └──────────┬───────────┘
                                                             ▼
                                                   ┌───────────────────┐
                                                   │ PubSub Publishing │
                                                   └───────────────────┘
                                                             │
                                                             ▼
                                                   ┌───────────────────┐
                                                   │Notification Worker│
                                                   └───────────────────┘
```

## Process Flow

1. **Request Handling**: Incoming requests are validated and processed by the controller layer
2. **Data Collection**: The service fetches XML data from the BOE official API
3. **Data Processing**: The XML is parsed and prepared for AI analysis
4. **AI Analysis**: The processed data is sent to Gemini AI along with user queries to identify relevant matches
5. **Response Generation**: Structured responses are returned with matched BOE entries
6. **Event Publishing**: Analysis results are published to PubSub for the Notification Worker to process

## Core Components

### Controllers

| Module | Description |
|--------|-------------|
| `analyze.js` | Handles analysis requests, orchestrates the parser and AI services |

### Services

| Module | Description |
|--------|-------------|
| `parser/index.js` | Main parser orchestration service |
| `parser/scraper.js` | Handles fetching and processing BOE content |
| `parser/textProcessor.js` | Text cleaning and normalization utilities |
| `ai/index.js` | AI service orchestration layer |
| `ai/gemini.js` | Implementation of Gemini AI analysis |
| `ai/client.js` | Gemini API client management |
| `ai/prompts/gemini.js` | Prompt engineering for Gemini model |

### Utils

| Module | Description |
|--------|-------------|
| `errors/AppError.js` | Custom error handling framework |
| `pubsub.js` | Utilities for publishing to Google PubSub |
| `schemas/pubsubMessages.js` | Shared schema definitions for PubSub message validation |

## PubSub Communication

The BOE Parser uses a standardized message schema for publishing results to the Notification Worker via Google PubSub. This schema is shared between both services to ensure compatibility.

### Shared Schema Structure

Both the BOE Parser and Notification Worker use an identical schema definition in:
- `src/utils/schemas/pubsubMessages.js`

The schema enforces consistent message structure with validation for required fields, including:

```javascript
{
  trace_id: "string",
  request: {
    subscription_id: "string", // Required: Empty string if not available
    user_id: "string",         // Required: Empty string if not available
    texts: []                  // Array of prompts/search texts
  },
  results: { ... },
  metadata: { ... }
}
```

### Schema Documentation

For detailed information about the message schema, please refer to:
- [PubSub Schema Documentation](docs/PUBSUB_SCHEMA.md)

This documentation explains field requirements, validation process, and troubleshooting common issues.

## Key Functions

### Parser Service

```javascript
// Fetch and parse BOE data
async function parseBOE({ date, prompts, requestId })

// Fetch BOE summary from external API
async function fetchBOESummary(date, requestId)

// Process BOE XML content
function parseBOEXML(xmlData, requestId)
```

### AI Service

```javascript
// Analyze BOE items with AI based on prompts
async function analyzeBOEItems(items, prompt, requestId, options)

// Analyze using Gemini AI specifically
async function analyzeWithGemini(boeItems, prompt, requestId, options)

// Generate system prompt for Gemini
function createSystemPrompt(userPrompt)

// Generate content prompt with BOE data
function createContentPrompt(boeItems, prompt, itemCount)
```

## API Endpoints

### `POST /api/analyze-text`

Primary endpoint for analyzing BOE content with user queries.

**Request Format**:
```json
{
  "texts": ["User query 1", "User query 2"],
  "subscription_id": "user_subscription_id",
  "user_id": "user_id",
  "date": "YYYY-MM-DD",
  "service": "gemini"
}
```

**Response Format**:
```json
{
  "trace_id": "request_trace_id",
  "request": {
    "texts": ["User query 1", "User query 2"],
    "subscription_id": "user_subscription_id",
    "user_id": "user_id"
  },
  "results": {
    "boe_info": {
      "issue_number": "123",
      "publication_date": "2025-04-15",
      "source_url": "https://www.boe.es/datosabiertos/api/boe/sumario/20250415"
    },
    "query_date": "2025-04-15",
    "results": [
      {
        "prompt": "User query 1",
        "matches": [
          {
            "document_type": "RESOLUTION",
            "title": "Original BOE title",
            "notification_title": "Optimized notification title",
            "issuing_body": "Issuing organization",
            "summary": "Brief summary of relevance",
            "relevance_score": 85,
            "links": {
              "html": "HTML URL",
              "pdf": "PDF URL"
            }
          }
        ],
        "metadata": {
          "processing_time_ms": 1200,
          "model_used": "gemini-2.0-flash-lite",
          "token_usage": {
            "input_tokens": 12000,
            "output_tokens": 500,
            "total_tokens": 12500
          }
        }
      }
    ]
  },
  "metadata": {
    "processing_time_ms": 1200,
    "total_items_processed": 50,
    "status": "success"
  }
}
```

## AI Model Configuration

The service uses Google's Gemini AI with the following configuration:

- **Default Model**: `gemini-2.0-flash-lite` (configured in `config.js`)
- **Temperature**: 0.2 (lower for more deterministic results)
- **Top-K**: 1
- **Top-P**: 1
- **Max Output Tokens**: 8192

## Error Handling and Resilience

The service implements robust error handling for various scenarios:

```
┌───────────────────┐
│    API Request    │
└─────────┬─────────┘
          ▼
┌───────────────────┐     ┌───────────────────┐
│  Fetch BOE Data   │─────│ Return Empty Data │
│     Success?      │ No  │   (Fallback)      │
└─────────┬─────────┘     └───────────────────┘
          │ Yes
          ▼
┌───────────────────┐     ┌───────────────────┐
│ Parse XML Content │─────│  Return Cleaned   │
│     Success?      │ No  │ Content (Fallback)│
└─────────┬─────────┘     └───────────────────┘
          │ Yes
          ▼
┌───────────────────┐     ┌───────────────────┐
│  AI Analysis      │─────│ Return Error Info │
│     Success?      │ No  │   (Fallback)      │
└─────────┬─────────┘     └───────────────────┘
          │ Yes
          ▼
┌───────────────────┐
│  Return Results   │
└───────────────────┘
```

All errors are logged with detailed information for debugging purposes, and the service is designed to provide graceful degradation rather than complete failure.

## Token Usage Monitoring

The service implements detailed token usage tracking:

1. **XML Content**: Estimates tokens for raw XML data
2. **System Prompt**: Tracks tokens used in system prompts
3. **Content Prompt**: Monitors tokens used for BOE content
4. **Response**: Estimates tokens in AI response
5. **Total**: Tracks total token usage for each request

Token usage is logged and included in response metadata for monitoring and optimization purposes.

## Implementation Notes

- The service requires no database - all necessary information is provided in the request.
- XML parsing is optimized to preserve all information while preparing it for AI processing.
- The `subscription_id` and `user_id` are passed through for downstream services.
- Only dispositions with high relevance (score > 70) are returned as matches.
- Actual token usage may vary slightly from estimates (which use a 4 characters per token approximation).