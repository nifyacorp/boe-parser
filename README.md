# BOE Analysis Service 🔍

A Node.js microservice that analyzes content from the Boletín Oficial del Estado (BOE) using AI. This service processes natural language queries against the latest BOE publications to extract relevant information and insights.

## Features

- 🔄 Automatic daily BOE content fetching and parsing
- 🤖 AI-powered content analysis for natural language queries (Gemini and OpenAI)
- 📊 Structured JSON responses with relevance scoring
- 🔐 Secure API key authentication (can use Google Cloud Secret Manager)
- 📝 Comprehensive logging system
- 📚 Interactive API documentation
- ☁️ Cloud-native design for Google Cloud Run
- 📨 Publishes results to Google Cloud Pub/Sub

## Process Flow

The BOE-parser service uses an AI-driven approach to process Spanish Official Bulletin (BOE) content. Here's a detailed breakdown of the process:

```
                                BOE Parser Process Flow
┌──────────────────┐     ┌───────────────────┐     ┌────────────────────┐     ┌──────────────────┐
│                  │     │                   │     │                    │     │                  │
│  1. HTTP Request │     │ 2. BOE Retrieval  │     │  3. AI Analysis    │     │ 4. PubSub        │
│  ───────────────┼────>│ ────────────────  │────>│ ────────────────   │────>│ ────────────     │
│                  │     │                   │     │                    │     │                  │
│ - Subscription   │     │ - Fetch BOE XML   │     │ - Create prompts   │     │ - Format results │
│ - Search prompts │     │ - Parse content   │     │ - Process with AI  │     │ - Add metadata   │
│ - User metadata  │     │ - Structure data  │     │ - Extract matches  │     │ - Publish message│
│                  │     │                   │     │ - Score relevance  │     │                  │
└──────────────────┘     └───────────────────┘     └────────────────────┘     └──────────────────┘
                                                                                        │
                                                                                        │
                                                                                        ▼
┌────────────────────────┐     ┌────────────────────────┐     ┌────────────────────────┐
│                        │     │                        │     │                        │
│  7. User Notification  │     │  6. DB Storage        │     │  5. Notification Worker │
│  ────────────────     │<────│  ────────────────     │<────│  ────────────────      │
│                        │     │                        │     │                        │
│ - Email/push           │     │ - Create notification  │     │ - Process PubSub msg   │
│ - In-app alert         │     │   records              │     │ - Extract matches      │
│ - Result display       │     │ - Associate with user  │     │ - Parse content        │
│                        │     │   and subscription     │     │                        │
└────────────────────────┘     └────────────────────────┘     └────────────────────────┘
```

### Process Steps:

1. **Request Processing:**
   - The service receives a request with search prompts (text queries)
   - The request includes user identification and subscription data
   - The controller validates the request format and authorization

2. **BOE Content Retrieval:**
   - The parser service fetches the BOE content for a specific date (or today's by default)
   - It uses a scraper module to fetch BOE XML data from oficial sources
   - The XML is parsed into a structured format with sections, departments, and items
   - This creates a dataset of BOE bulletins/announcements for analysis

3. **AI Processing:**
   - The service routes the BOE items and prompts to the AI service
   - By default, it uses Google's Gemini AI (or OpenAI as an alternative)
   - The AI service prepares specialized prompts:
     - A **system prompt** that explains the task
     - A **content prompt** that contains the BOE items and user query
   - The AI model analyzes the data and returns JSON with:
     - Relevance scores for each match (0-100 scale)
     - Generated summaries of matched content
     - Notification-friendly titles
     - Links and metadata for each match

4. **PubSub Publication:**
   - The formatted results are published to Google PubSub
   - This message includes all the matches found, relevance scores, and metadata
   - The structured JSON format allows for easy downstream processing

5. **Notification Worker:**
   - A separate microservice consumes the PubSub message
   - It processes the matches and prepares notifications

6. **Database Storage:**
   - Notifications are stored in the database
   - They're associated with the correct user and subscription

7. **User Notification:**
   - Users are notified about relevant BOE entries based on their subscriptions
   - Notifications can be viewed in the application or sent as emails/alerts

The key innovation in this process is that the AI is prompted to return structured data (JSON) rather than natural language. This allows the service to directly use the AI's output in the application pipeline without complex post-processing.

## Architecture

The service follows a modular architecture with clear separation of concerns:

### Updated Directory Structure (approx.)

```plaintext
src/
├── index.js              # Application entry point
├── config/
│   └── config.js         # Configuration loading (env vars, secrets)
├── routes/
│   ├── index.js          # Main router aggregation
│   ├── analyze.js        # Analysis endpoint routes
│   └── test.js           # Test endpoint routes
├── controllers/
│   ├── analyze.js        # Controller for analysis logic
│   └── test.js           # Controller for test endpoints
├── services/
│   ├── ai/               # AI Service Facade & Implementations
│   │   ├── index.js      # Facade (chooses Gemini/OpenAI)
│   │   ├── client.js     # AI client initialization (Gemini/OpenAI)
│   │   ├── gemini.js     # Gemini specific logic
│   │   ├── openai.js     # OpenAI specific logic
│   │   └── prompts/      # Directory for AI prompts
│   └── parser/           # BOE Parsing Service
│       ├── index.js      # Orchestrates fetching/parsing
│       ├── scraper.js      # Fetches BOE XML/HTML
│       └── textProcessor.js # Text cleaning utilities
├── middleware/
│   ├── index.js          # Middleware registration
│   ├── auth.js           # API key authentication
│   ├── errorHandler.js   # Global error handler
│   ├── requestId.js      # Adds request ID
│   └── validation.js     # Request body validation
└── utils/
    ├── pubsub.js         # Google Cloud Pub/Sub interaction
    ├── secrets.js        # Google Cloud Secret Manager interaction
    └── errors/           # Custom error classes
        └── AppError.js
```

### Key Components

- **Express Server**: REST API endpoints and request handling
- **BOE Scraper**: Intelligent parsing of BOE publications
- **Text Processor**: Query optimization and normalization
- **AI Analyzer**: Advanced content analysis
- **Auth System**: Secure API key validation
- **Logger**: Structured logging with detailed context
- **Secret Manager**: Secure credential management

## Testing the Service

### Using the CLI Test Script

A test script is provided to easily test the BOE parser's PubSub integration:

```bash
# Run with mock data (fast)
node test-pubsub.js --skipAI

# Run with real AI processing (slower)
node test-pubsub.js

# Publish results to PubSub for end-to-end testing
node test-pubsub.js --publish

# Use custom prompts
node test-pubsub.js --prompt="Ayuntamiento Barcelona" --prompt="Subvenciones cultura"

# Get help
node test-pubsub.js --help
```

### Manual Testing

To test the BOE parser manually:

1. Test the health endpoint:
   ```
   curl http://localhost:8080/health
   ```

2. Test the PubSub endpoint with mock data:
   ```
   curl -X POST http://localhost:8080/test-pubsub \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer test-api-key" \
     -d '{"texts":["Ayuntamiento Barcelona licitaciones"], "skipAI": true}'
   ```

3. Test with real AI processing and publish to PubSub:
   ```
   curl -X POST http://localhost:8080/test-pubsub \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer test-api-key" \
     -d '{"texts":["Ayuntamiento Barcelona licitaciones"], "publishToPubSub": true}'
   ```

## Prerequisites

- Node.js (v18 or higher recommended)
- npm
- Google Cloud Project (for Pub/Sub, Secret Manager, Cloud Run)
- Docker (optional, for containerized deployment)

## Environment Variables

This service relies on environment variables for configuration. For local development, create a `.env` file in the root directory by copying `.env.example`.

### Required

These variables **must** be set for the application to function correctly.

| Variable | Description | Example Value |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | Your Google Cloud Project ID. | `my-gcp-project-id` |
| `PUBSUB_TOPIC_NAME` | The Pub/Sub topic ID where analysis results are published. | `processor-results` |
| `GEMINI_API_KEY` | API Key for Google AI (Gemini). **See note below.** | `AIza...` |
| `OPENAI_API_KEY` | API Key for OpenAI. **See note below.** | `sk-...` |
| `API_KEY` | The secret key clients must provide in the `Authorization: Bearer <key>` header. **See note below.** | `my-secret-bearer-token` |

**Note on API Keys / Secrets:** The application loads sensitive keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `API_KEY`) using the following priority order:
1.  **Environment Variable:** Checks `process.env.VAR_NAME` directly.
2.  **Mounted Secret File:** Checks for a file at `/etc/secrets/VAR_NAME` (standard path for secrets mounted via `--set-secrets` in Cloud Run).
3.  **Secret Manager API (Production Only):** If running with `NODE_ENV=production` AND the key wasn't found via the methods above, it attempts to fetch the secret named `VAR_NAME` from Google Cloud Secret Manager using its API. Requires the service account to have the Secret Manager Secret Accessor role.

Therefore, you can provide these keys either as regular environment variables (`--set-env-vars`) or, more securely, by mounting them from Secret Manager (`--set-secrets=ENV_VAR_NAME=SECRET_NAME:latest`).

### Optional

These variables have default values but can be overridden.

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | Environment mode (`development` or `production`). Affects logging, secret loading. | `development` |
| `PORT` | Port the server listens on. Cloud Run injects its own. | `3000` |
| `PUBSUB_DLQ_TOPIC_NAME` | The Pub/Sub topic ID for publishing errors/DLQ messages. | `${PUBSUB_TOPIC_NAME}-dlq` |
| `GEMINI_MODEL` | The specific Gemini model to use. | `gemini-1.5-pro` |
| `OPENAI_MODEL` | The specific OpenAI model to use. | `gpt-4o-mini` |
| `OPENAI_ORGANIZATION` | OpenAI Organization ID (if applicable). | *empty* |
| `SCRAPER_TIMEOUT_MS` | Timeout in milliseconds for fetching BOE content. | `15000` |
| `SCRAPER_USER_AGENT` | User-Agent string for the BOE scraper. | `BOE Parser Bot/1.0` |

## Setup

1.  Clone the repository:
    ```bash
    git clone [repository-url]
    cd boe-parser # Or your project directory name
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment:
    *   Copy `.env.example` to `.env`.
    *   Fill in the required values in `.env` (especially API keys for local testing).
    *   **For Production/Cloud Run:** Set the required environment variables in the Cloud Run service configuration. If using Secret Manager for API keys, ensure the secrets exist and the Cloud Run service account has the "Secret Manager Secret Accessor" IAM role.

## Running Locally

```bash
# Start the server (using .env variables)
npm start

# Start in development mode with auto-reloading
npm run dev
```

The server will typically start on port 3000 (or the `PORT` specified).

## Deployment (Google Cloud Run Example)

1.  Ensure your `gcloud` CLI is configured (project, authentication).
2.  Push the image to Google Artifact Registry (or Container Registry):
    ```bash
    # Replace REGION and PROJECT_ID
    gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/boe-parser/boe-parser-image:latest
    ```
3.  Deploy to Cloud Run:
    ```bash
    # Replace REGION, PROJECT_ID, and set appropriate variables
    gcloud run deploy boe-parser-service \
      --image REGION-docker.pkg.dev/PROJECT_ID/boe-parser/boe-parser-image:latest \
      --platform managed \
      --region REGION \
      --project PROJECT_ID \
      --allow-unauthenticated \ # Or configure authentication
      --set-env-vars NODE_ENV=production,GOOGLE_CLOUD_PROJECT=PROJECT_ID,PUBSUB_TOPIC_NAME=processor-results,PUBSUB_DLQ_TOPIC_NAME=processor-results-dlq \ # Add other OPTIONAL vars if needed
      # Set secrets if using Secret Manager for API Keys (replace SECRET_NAME with actual secret name)
      --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,API_KEY=API_KEY:latest
    ```
    *   Adjust `--allow-unauthenticated` based on your needs.
    *   Use `--set-env-vars` for non-sensitive configuration.
    *   Use `--set-secrets` to securely mount secrets from Secret Manager as environment variables. The format is `ENV_VAR_NAME=SECRET_NAME:VERSION`. Use the actual name of your secret in Secret Manager.

## API Endpoints

(Refer to `ENDPOINTS.md` or previous sections for details - keep this concise)

-   `GET /health`: Health check.
-   `POST /api/analyze-text`: Main analysis endpoint (Requires `Authorization: Bearer <API_KEY>`).
-   `GET /api/check-gemini`: Test Gemini connection (Requires Auth).
-   `GET /api/check-openai`: Test OpenAI connection (Requires Auth).
-   `POST /api/test-pubsub`: Test publishing a mock message (Requires Auth).

## Development

```bash
# Run linting checks
npm run lint

# Run tests (if configured in package.json)
npm test
```

## Security

- API key authentication
- Secure secret management
- Input validation
- Rate limiting
- Error logging

## License