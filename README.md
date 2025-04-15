# BOE Parser Service

This service is responsible for parsing and analyzing the Spanish Official Bulletin (BOE) entries using AI to find relevant information based on user queries.

## Process Flow

1. **Data Collection**: The service fetches XML data from the BOE official API
2. **Data Processing**: The XML is parsed and cleaned to extract only necessary information, reducing token usage
3. **AI Analysis**: The processed data is sent to an AI service (Gemini) along with user queries to identify relevant matches
4. **Response Generation**: Structured responses are returned with matched BOE entries

## API Endpoints

### `/api/analyze-text`

This is the primary endpoint for analyzing BOE content with user queries.

**Request Format**:
```json
{
  "texts": ["User query 1", "User query 2"],
  "subscription_id": "user_subscription_id",
  "user_id": "user_id",
  "date": "YYYY-MM-DD"
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
        "metadata": {}
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

## Implementation Notes

- The service does not access the database directly - all necessary information is provided in the request.
- The `subscription_id` is passed through from the request and included in the response.
- XML parsing is optimized to reduce token usage by cleaning and extracting only the necessary information.
- The AI service filters and prioritizes BOE items based on relevance to the user query.
- Only dispositions with high relevance (score > 70) are returned as matches.

## Error Handling

The service implements robust error handling for:
- BOE API connection issues
- XML parsing failures
- AI service errors

All errors are logged with detailed information for debugging purposes.