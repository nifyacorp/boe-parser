#!/usr/bin/env node

/**
 * BOE Parser PubSub Test Script
 * 
 * This script tests the PubSub functionality of the BOE parser by sending
 * test requests to the /test-pubsub endpoint and displaying the results.
 * 
 * Usage: 
 *   node test-pubsub.js [--skipAI] [--publish] [--prompt="Your prompt here"]
 *
 * Options:
 *   --skipAI         Skip AI processing and use mock results (much faster)
 *   --publish        Publish results to PubSub topic
 *   --prompt="..."   Custom prompt to use (can be specified multiple times)
 */

import fetch from 'node-fetch';
import { parseArgs } from 'node:util';

// Parse command line arguments
const options = {
  skipAI: {
    type: 'boolean',
    short: 's',
    default: false
  },
  publish: {
    type: 'boolean',
    short: 'p',
    default: false
  },
  prompt: {
    type: 'string',
    short: 't',
    multiple: true
  },
  userId: {
    type: 'string',
    short: 'u',
    default: 'test-user-' + Math.floor(Math.random() * 10000)
  },
  subscriptionId: {
    type: 'string',
    short: 'i',
    default: 'test-subscription-' + Math.floor(Math.random() * 10000)
  },
  url: {
    type: 'string',
    default: 'http://localhost:8080'
  },
  help: {
    type: 'boolean',
    short: 'h',
    default: false
  }
};

const { values, positionals } = parseArgs({ options, allowPositionals: true });

// Show help and exit
if (values.help) {
  console.log(`
BOE Parser PubSub Test Script

Usage: 
  node test-pubsub.js [--skipAI] [--publish] [--prompt="Your prompt here"]

Options:
  --skipAI, -s       Skip AI processing and use mock results (much faster)
  --publish, -p      Publish results to PubSub topic
  --prompt, -t       Custom prompt to use (can be specified multiple times)
  --userId, -u       User ID to use in the request
  --subscriptionId, -i  Subscription ID to use in the request
  --url              URL of the BOE parser service (default: http://localhost:8080)
  --help, -h         Show this help message
  `);
  process.exit(0);
}

// If no prompts are provided, use defaults
const prompts = values.prompt && values.prompt.length > 0
  ? values.prompt
  : ["Ayuntamiento Barcelona licitaciones", "Subvenciones cultura"];

// Define the API URL
const apiUrl = `${values.url}/test-pubsub`;

console.log(`
BOE Parser PubSub Test
=====================
URL: ${apiUrl}
Prompts: ${prompts.join(", ")}
Skip AI: ${values.skipAI ? "Yes" : "No"}
Publish to PubSub: ${values.publish ? "Yes" : "No"}
User ID: ${values.userId}
Subscription ID: ${values.subscriptionId}
`);

// Create the request payload
const payload = {
  texts: prompts,
  userId: values.userId,
  subscriptionId: values.subscriptionId,
  skipAI: values.skipAI,
  publishToPubSub: values.publish
};

console.log("Sending request to BOE Parser...");
console.time("Request completed in");

// Send the request
try {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + 'test-api-key'  // Any value will work for test
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
  }
  
  const result = await response.json();
  console.timeEnd("Request completed in");
  
  // Process the response
  console.log("\nRequest ID:", result.reqId);
  console.log("Status:", result.status);
  console.log("Processing time:", result.processing_time_ms, "ms");
  
  if (result.pubsub_message_id) {
    console.log("\nPubSub Message ID:", result.pubsub_message_id);
  } else if (values.publish) {
    console.log("\nPubSub Error:", result.message_payload.pubsub_error || "Unknown error");
  }
  
  // Results summary
  console.log("\nResults Summary:");
  console.log("- Prompts processed:", result.results_summary.prompt_count);
  console.log("- Total matches found:", result.results_summary.total_matches);
  console.log("\nMatches per prompt:");
  
  result.results_summary.matches_per_prompt.forEach((item, index) => {
    console.log(`  ${index + 1}. "${item.prompt}": ${item.match_count} matches`);
  });
  
  // If we have matches, show details of the first few
  if (result.message_payload.results.matches.length > 0) {
    console.log("\nExample matches:");
    const maxExamples = Math.min(3, result.message_payload.results.matches.length);
    
    for (let i = 0; i < maxExamples; i++) {
      const match = result.message_payload.results.matches[i];
      console.log(`\n  ${i + 1}. ${match.document_type}: ${match.title}`);
      console.log(`     Relevance: ${match.relevance_score.toFixed(2)}`);
      console.log(`     Department: ${match.department}`);
      console.log(`     Summary: ${match.summary.substring(0, 100)}...`);
    }
    
    if (result.message_payload.results.matches.length > maxExamples) {
      console.log(`\n  ...and ${result.message_payload.results.matches.length - maxExamples} more matches`);
    }
  }
  
  // If PubSub message was published, show info on how to check results
  if (result.pubsub_message_id) {
    console.log(`
To verify the notification pipeline:
1. The message has been sent to PubSub with ID: ${result.pubsub_message_id}
2. Within 1-2 minutes, check if notifications were created in the database
   by running: node scripts/test-notification-pipeline.js
    `);
  }
  
} catch (error) {
  console.timeEnd("Request completed in");
  console.error("Error:", error.message);
  process.exit(1);
}