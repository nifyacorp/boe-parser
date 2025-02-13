export const MAX_CHUNK_SIZE = 25;
export const MAX_CONCURRENT_REQUESTS = 2;

export const RESPONSE_SCHEMA = {
  matches: [{
    document_type: ['RESOLUTION', 'ORDER', 'ROYAL_DECREE', 'LAW', 'ANNOUNCEMENT', 'OTHER'],
    issuing_body: '',
    title: '',
    dates: {
      document_date: '',
      publication_date: ''
    },
    code: '',
    section: '',
    department: '',
    links: {
      pdf: '',
      html: ''
    },
    relevance_score: 0,
    summary: ''
  }],
  metadata: {
    match_count: 0,
    max_relevance: 0
  }
};