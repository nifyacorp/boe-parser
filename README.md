# BOE Analysis Service 🔍

A Node.js microservice that analyzes content from the Boletín Oficial del Estado (BOE) using AI. This service processes natural language queries against the latest BOE publications to extract relevant information and insights.

## Features

- 🔄 Automatic daily BOE content fetching and parsing
- 🤖 AI-powered content analysis for natural language queries
- 📊 Structured JSON responses with relevance scoring
- 🔐 Secure API key authentication via Google Cloud Secret Manager
- 📝 Comprehensive logging system
- 📚 Interactive API documentation
- ☁️ Cloud-native design for Google Cloud Run

## Architecture

The service follows a modular architecture with clear separation of concerns:

### Directory Structure

```plaintext
src/
├── index.js              # Application entry point
├── services/
│   ├── scraper.js        # BOE content fetching and parsing
│   ├── textProcessor.js  # Query preprocessing
│   └── openai.js        # AI analysis integration
└── utils/
    ├── auth.js          # API key validation
    ├── logger.js        # Structured logging
    ├── secrets.js       # Secret management
    └── apiDocs.js       # API documentation
```

### Key Components

- **Express Server**: REST API endpoints and request handling
- **BOE Scraper**: Intelligent parsing of BOE publications
- **Text Processor**: Query optimization and normalization
- **AI Analyzer**: Advanced content analysis
- **Auth System**: Secure API key validation
- **Logger**: Structured logging with detailed context
- **Secret Manager**: Secure credential management

## Prerequisites

- Node.js 18+
- Google Cloud Project
- Docker
- Access to BOE Analysis Service API key

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| PORT | Server port number | No | 8080 |
| GOOGLE_CLOUD_PROJECT | GCP project ID | Yes | - |
| LOG_LEVEL | Logging level (debug, info, warn, error) | No | debug |

## Setup

1. Clone the repository:
   ```bash
   git clone [repository-url]
   cd boe-analysis-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Google Cloud Secret Manager:
   - Set up `PARSER_API_KEY` secret for API authentication

4. Build the Docker image:
   ```bash
   docker build -t boe-analysis-service .
   ```

## Deployment

### Google Cloud Run

1. Push the image to Container Registry:
   ```bash
   gcloud builds submit --tag gcr.io/PROJECT_ID/boe-analysis-service
   ```

2. Deploy to Cloud Run:
   ```bash
   gcloud run deploy boe-analysis-service \
     --image gcr.io/PROJECT_ID/boe-analysis-service \
     --platform managed \
     --region REGION \
     --project PROJECT_ID \
     --set-env-vars GOOGLE_CLOUD_PROJECT=PROJECT_ID
   ```

## API Usage

### Authentication

All requests require an API key in the Authorization header:

```http
Authorization: Bearer YOUR_API_KEY
```

### Endpoints

#### 1. Get API Documentation
```http
GET /help
```

Returns comprehensive API documentation.

#### 2. Analyze BOE Content
```http
POST /analyze-text
Content-Type: application/json
```

Analyze multiple queries against latest BOE content.

Request body:
```json
{
  "texts": [
    "Find all resolutions about public employment",
    "List announcements about environmental grants",
    "Show orders related to education"
  ]
}
```

Response format:

```json
{
  "query_date": "2025-01-16",
  "boe_info": {
    "issue_number": "10",
    "publication_date": "2025-01-16",
    "source_url": "https://www.boe.es"
  },
  "results": [{
    "prompt": "Find all resolutions about public employment",
    "matches": [{
      "document_type": "RESOLUTION",
      "issuing_body": "Ministerio de Hacienda",
      "title": "Full document title",
      "dates": {
        "document_date": "2024-12-30",
        "publication_date": "2025-01-16"
      },
      "code": "BOE-A-2025-1234",
      "section": "III. Otras disposiciones",
      "department": "MINISTERIO DE HACIENDA",
      "links": {
        "pdf": "https://www.boe.es/boe/dias/2025/01/16/pdfs/BOE-A-2025-1234.pdf",
        "html": "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-1234"
      },
      "relevance_score": 0.95,
      "summary": "Brief description of the document content"
    }],
    "metadata": {
      "match_count": 1,
      "max_relevance": 0.95
    }
  }],
  "metadata": {
    "total_items_processed": 45,
    "processing_time_ms": 1234
  }
}
```

## Rate Limits

- 100 requests per minute per API key
- Maximum 5 queries per request
- Maximum query length: 500 characters

## Error Handling

The service uses standard HTTP status codes:

- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `429`: Too Many Requests
- `500`: Internal Server Error

Error response format:
```json
{
  "error": "Descriptive error message"
}
```

## Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## Security

- API key authentication
- Secure secret management
- Input validation
- Rate limiting
- Error logging

## License
