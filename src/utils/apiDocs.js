export function getApiDocs() {
  return {
    "api_version": "1.0",
    "description": "DOGA (Diario Oficial de Galicia) Analysis Service API",
    "endpoints": {
      "/analyze-text": {
        "method": "POST",
        "description": "Analyzes multiple text queries against the latest DOGA content in parallel",
        "request": {
          "content_type": "application/json",
          "body": {
            "texts": {
              "type": "array",
              "description": "Array of text prompts to analyze",
              "required": true,
              "example": [
                "Find all resolutions about public employment",
                "List announcements about environmental grants",
                "Show orders related to education"
              ]
            }
          }
        },
        "response": {
          "content_type": "application/json",
          "structure": {
            "query_date": {
              "type": "string",
              "format": "YYYY-MM-DD",
              "description": "Date when the query was processed"
            },
            "doga_info": {
              "type": "object",
              "description": "Information about the DOGA issue being analyzed",
              "properties": {
                "issue_number": "DOGA issue number",
                "publication_date": "Publication date",
                "source_url": "URL of the DOGA website"
              }
            },
            "results": {
              "type": "array",
              "description": "Analysis results for each prompt",
              "items": {
                "prompt": "Original search query",
                "matches": {
                  "type": "array",
                  "items": {
                    "document_type": "Type of document (ORDER, RESOLUTION, ANNOUNCEMENT, etc.)",
                    "issuing_body": "Organization that issued the document",
                    "title": "Complete document title",
                    "dates": {
                      "document_date": "Original document date",
                      "publication_date": "Publication date in DOGA"
                    },
                    "procedure_code": "Official procedure code if available",
                    "category": "Main document category",
                    "subcategory": "Document subcategory",
                    "url": "Direct link to the document",
                    "relevance_score": "Match relevance (0-1)",
                    "summary": "Brief content summary"
                  }
                },
                "metadata": {
                  "match_count": "Number of matches found",
                  "max_relevance": "Highest relevance score"
                }
              }
            },
            "metadata": {
              "type": "object",
              "description": "Query execution metadata",
              "properties": {
                "total_items_processed": "Number of DOGA items analyzed",
                "processing_time_ms": "Total processing time in milliseconds"
              }
            }
          }
        },
        "example_response": {
          "query_date": "2025-01-16",
          "doga_info": {
            "issue_number": "10",
            "publication_date": "2025-01-16",
            "source_url": "https://www.xunta.gal/diario-oficial-galicia"
          },
          "results": [{
            "prompt": "Find all resolutions about public employment",
            "matches": [{
              "document_type": "RESOLUTION",
              "issuing_body": "Servicio Gallego de Salud",
              "title": "RESOLUCIÓN de 30 de diciembre de 2024, conjunta de la Dirección General de Recursos Humanos",
              "dates": {
                "document_date": "2024-12-30",
                "publication_date": "2025-01-16"
              },
              "procedure_code": "ED531F",
              "category": "III. Otras disposiciones",
              "subcategory": "Servicio Gallego de Salud",
              "url": "https://www.xunta.gal/dog/Publicados/2025/20250116/AnuncioG0003-070125-0004_es.html",
              "relevance_score": 0.95,
              "summary": "Resolution regarding public employment training program"
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
        },
        "errors": {
          "400": {
            "description": "Bad Request - Invalid input",
            "example": {
              "error": "Array of text prompts is required"
            }
          },
          "500": {
            "description": "Internal Server Error",
            "example": {
              "error": "Failed to analyze with OpenAI: API error"
            }
          }
        }
      },
      "/help": {
        "method": "GET",
        "description": "Returns API documentation and usage information",
        "response": {
          "content_type": "application/json",
          "description": "This documentation"
        }
      }
    }
  };
}
