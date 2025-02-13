export function mergeResults(results) {
  const matches = [];
  let maxRelevance = 0;

  results.forEach(result => {
    if (result.matches) {
      matches.push(...result.matches);
      if (result.metadata?.max_relevance > maxRelevance) {
        maxRelevance = result.metadata.max_relevance;
      }
    }
  });

  // Sort matches by relevance score in descending order
  matches.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

  return {
    matches,
    metadata: {
      match_count: matches.length,
      max_relevance: maxRelevance
    }
  };
}