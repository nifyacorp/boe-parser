# BOE Analysis Service

A Node.js microservice that analyzes content from the Boletín Oficial del Estado (BOE) using OpenAI's GPT-4. The service processes user queries against the latest BOE publications to extract relevant information and insights.

## Features

- Automatic daily BOE content fetching
- Natural language query processing
- AI-powered content analysis using GPT-4
- Structured JSON responses with detailed metadata
- Cloud-native design for Google Cloud Run
- Comprehensive logging with Pino
- Interactive API documentation via /help endpoint

## Architecture

The service follows a modular architecture with clear separation of concerns:

```
src/
├── index.js           # Main application entry point
├── services/         
│   ├── scraper.js     # BOE HTML scraping functionality
│   ├── textProcessor.js # Text processing and cleaning
│   └── openai.js      # OpenAI integration
└── utils/
    ├── logger.js      # Logging utility
    ├── secrets.js     # Secret management
    └── apiDocs.js     # API documentation
```

### Key Components

- **Express Server**: Handles HTTP requests and routing
- **BOE Scraper**: Fetches and parses BOE HTML content
- **Text Processor**: Cleans and normalizes input text
- **OpenAI Analyzer**: Processes content using GPT-4
- **Secret Manager**: Securely handles API keys and credentials
- **Logger**: Structured logging for Cloud Run
- **API Documentation**: Interactive endpoint documentation

## Prerequisites

- Node.js 18 or higher
- Google Cloud Project with Secret Manager enabled
- OpenAI API key
- Docker (for containerization)

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| PORT | Server port | No | 8080 |
| GOOGLE_CLOUD_PROJECT | Google Cloud project ID | Yes | - |
| OPENAI_API_KEY | OpenAI API key (can be provided directly or stored in Secret Manager) | Yes | - |

## Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd boe-analysis-service
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure the OpenAI API key (choose one method):
   
   **Option 1: Environment Variable**
   - Set the OPENAI_API_KEY environment variable directly
   
   **Option 2: Google Cloud Secret Manager**
   - Create a secret named `OPENAI_API_KEY`
   - Store your OpenAI API key in the secret

4. Build the Docker image:
   ```bash
   docker build -t boe-analysis-service .
   ```

## Deployment

### Google Cloud Run

1. Push the image to Google Container Registry:
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

### Documentation Endpoint

Get API documentation and examples:

```bash
GET /help
```

Returns comprehensive API documentation including:
- Available endpoints
- Request/response structures
- Example payloads
- Error formats

### Analyze Text Endpoint

`POST /analyze-text`

Analyzes multiple text queries against the latest BOE content in parallel, returning structured results.

#### Request Body

```json
{
  "texts": [
    "Find all resolutions about public employment",
    "List announcements about environmental grants",
    "Show orders related to education"
  ]
}
```

#### Response

The endpoint returns a structured JSON response with the following format:

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

#### Response Fields

- `query_date`: Date when the query was processed
- `boe_info`: Information about the BOE issue being analyzed
  - `issue_number`: BOE issue number
  - `publication_date`: Publication date
  - `source_url`: URL of the BOE website
- `results`: Array of analysis results for each prompt
  - `prompt`: Original search query
  - `matches`: Array of matching documents
    - `document_type`: Type of document (RESOLUTION, ORDER, ROYAL_DECREE, LAW, ANNOUNCEMENT)
    - `issuing_body`: Organization that issued the document
    - `title`: Complete document title
    - `dates`: Document dates
    - `code`: BOE document code
    - `section`: Main document section
    - `department`: Government department
    - `links`: Document URLs (PDF and HTML versions)
    - `relevance_score`: Match relevance (0-1)
    - `summary`: Brief content summary
  - `metadata`: Match-specific metadata
    - `match_count`: Number of matches found
    - `max_relevance`: Highest relevance score
- `metadata`: Query execution metadata
  - `total_items_processed`: Number of BOE items analyzed
  - `processing_time_ms`: Total processing time in milliseconds

#### Error Response

```json
{
  "error": "Array of text prompts is required"
}
```

#### Features

- Multiple prompts in a single request
- Parallel processing for better performance
- Structured JSON responses with detailed metadata
- Relevance scoring for matches
- Document categorization and summarization
- Processing time tracking
- Comprehensive error handling

## Development

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Run tests:
   ```bash
   npm test
   ```

3. Lint code:
   ```bash
   npm run lint
   ```

## Docker Support

The service includes a Dockerfile for containerization:

```dockerfile
FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV PORT=8080
CMD [ "npm", "start" ]
```

## Logging

The service uses Pino for structured logging, optimized for Cloud Run:

- Log levels: INFO, ERROR
- JSON format
- Request tracing
- Error stack traces
- Performance metrics

## Security

- Uses Google Cloud Secret Manager for sensitive data
- Environment variable configuration
- Input validation and sanitization
- Error handling and logging
- Container security best practices

## License

[Add your license information here]
