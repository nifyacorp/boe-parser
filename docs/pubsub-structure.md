# BOE Parser Service PubSub Message Structure

## Work Tasks Topic (`boe-analysis-tasks`)

### Message Structure
```json
{
  "task_id": "boe-analysis-20250124-abc123",
  "service_id": "boe-parser-v1",
  "timestamp": "2025-01-24T13:45:30.123Z",
  "priority": 1,
  "retry_count": 0,
  "max_retries": 3,
  "payload": {
    "texts": [
      "Find all resolutions about public employment",
      "List announcements about environmental grants"
    ],
    "callback": {
      "topic": "boe-analysis-notifications",
      "routing_key": "client-xyz-123"
    },
    "metadata": {
      "client_id": "client-xyz-123",
      "request_id": "req-456",
      "correlation_id": "corr-789"
    }
  }
}
```

### Field Descriptions

- `task_id`: Unique identifier for the task
- `service_id`: Target service identifier (used for routing)
- `timestamp`: Task creation timestamp
- `priority`: Task priority (1-5, where 1 is highest)
- `retry_count`: Number of retry attempts
- `max_retries`: Maximum number of retries allowed
- `payload`:
  - `texts`: Array of text queries to analyze
  - `callback`: Notification configuration
  - `metadata`: Request tracking information

## Notifications Topic (`boe-analysis-notifications`)

### Message Structure
```json
{
  "notification_id": "boe-notif-20250124-xyz789",
  "task_id": "boe-analysis-20250124-abc123",
  "timestamp": "2025-01-24T13:46:15.456Z",
  "status": "completed",
  "service_id": "boe-parser-v1",
  "payload": {
    "query_date": "2025-01-24",
    "boe_info": {
      "issue_number": "20",
      "publication_date": "2025-01-24",
      "source_url": "https://www.boe.es"
    },
    "results": [
      {
        "prompt": "Find all resolutions about public employment",
        "matches": [
          {
            "document_type": "RESOLUTION",
            "issuing_body": "Ministerio de Hacienda",
            "title": "Full document title",
            "dates": {
              "document_date": "2025-01-20",
              "publication_date": "2025-01-24"
            },
            "code": "BOE-A-2025-1234",
            "section": "III. Otras disposiciones",
            "department": "MINISTERIO DE HACIENDA",
            "links": {
              "pdf": "https://www.boe.es/boe/dias/2025/01/24/pdfs/BOE-A-2025-1234.pdf",
              "html": "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-1234"
            },
            "relevance_score": 0.95,
            "summary": "Brief description of the document content"
          }
        ],
        "metadata": {
          "match_count": 1,
          "max_relevance": 0.95
        }
      }
    ],
    "metadata": {
      "total_items_processed": 45,
      "processing_time_ms": 1234,
      "client_id": "client-xyz-123",
      "request_id": "req-456",
      "correlation_id": "corr-789"
    }
  },
  "error": null
}
```

### Error Response Example
```json
{
  "notification_id": "boe-notif-20250124-xyz790",
  "task_id": "boe-analysis-20250124-abc124",
  "timestamp": "2025-01-24T13:46:20.789Z",
  "status": "failed",
  "service_id": "boe-parser-v1",
  "payload": null,
  "error": {
    "code": "BOE_SCRAPING_ERROR",
    "message": "Failed to fetch BOE content: HTTP 503",
    "details": {
      "retry_count": 3,
      "last_error": "Service Unavailable",
      "timestamp": "2025-01-24T13:46:20.123Z"
    }
  }
}
```

### Field Descriptions

- `notification_id`: Unique identifier for the notification
- `task_id`: Reference to the original task
- `timestamp`: Notification creation timestamp
- `status`: Processing status (completed, failed, partial)
- `service_id`: Service that processed the task
- `payload`: Analysis results (null if failed)
- `error`: Error details (null if successful)

## Status Codes

- `completed`: Task completed successfully
- `failed`: Task failed after all retries
- `partial`: Some queries succeeded, others failed
- `invalid`: Task validation failed
- `timeout`: Processing exceeded time limit

## Best Practices

1. **Message Persistence**
   - Messages should be durable
   - Use message TTL for expired tasks
   - Implement dead letter queues

2. **Error Handling**
   - Include detailed error information
   - Maintain original request context
   - Support retry mechanisms

3. **Monitoring**
   - Track message processing times
   - Monitor queue depths
   - Alert on error patterns

4. **Security**
   - Encrypt sensitive data
   - Validate message signatures
   - Implement access controls

5. **Performance**
   - Keep messages compact
   - Use appropriate message routing
   - Implement batch processing