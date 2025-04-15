/**
 * Configuration management module
 */
import dotenv from 'dotenv';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import fs from 'fs'; // Import fs for reading files
import path from 'path'; // Import path

// Load environment variables from .env file (primarily for local dev)
dotenv.config();

// Helper function to read mounted secrets (common in Cloud Run)
function readMountedSecret(secretName) {
  const defaultSecretPath = `/etc/secrets/${secretName}`;
  const secretPath = process.env[`${secretName}_FILE`] || defaultSecretPath;
  try {
    if (fs.existsSync(secretPath)) {
      const value = fs.readFileSync(secretPath, 'utf8').trim();
      if (value) {
          console.log(`SUCCESS: Read secret '${secretName}' from mounted file: ${secretPath}`);
          return value;
      } else {
          console.warn(`WARN: Found mounted secret file for '${secretName}' but it is empty: ${secretPath}`);
          return null;
      }
    } else {
      return null;
    }
  } catch (e) {
    console.warn(`ERROR: Could not read mounted secret file ${secretPath} for '${secretName}': ${e.message}`);
  }
  return null;
}

// Environment constants
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_DEVELOPMENT = NODE_ENV === 'development';

// Read PubSub names from environment variables provided in the image
const pubsubTopicName = process.env.PUBSUB_TOPIC_NAME || 'boe-notifications';
const pubsubDlqTopicName = process.env.PUBSUB_DLQ_TOPIC_NAME || `${pubsubTopicName}-dlq`;

// Configuration object
const config = {
  env: {
    NODE_ENV,
    IS_PRODUCTION,
    IS_DEVELOPMENT,
  },
  server: {
    port: process.env.PORT || 3000,
  },
  gcp: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
  },
  services: {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
    },
    pubsub: {
      topicId: pubsubTopicName,
      errorTopicId: pubsubDlqTopicName,
    },
  },
  auth: {
    apiKey: process.env.PARSER_API_KEY || '', // Try direct env var first
    apiKeySecretName: 'PARSER_API_KEY',
  },
  scraper: {
      timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10),
      userAgent: process.env.SCRAPER_USER_AGENT || 'BOE Parser Bot/1.0'
  }
};

/**
 * Load secrets from Google Cloud Secret Manager API
 * This acts as a fallback or alternative if env vars/mounted files aren't used/available.
 * @returns {Promise<void>} - Resolves when secrets are loaded
 */
export async function loadSecrets() {
  console.log('Checking if secrets need fetching via Secret Manager...');

  // First check if we can read from mounted secrets (Cloud Run volume mounts)
  const apiKeyFromMounted = readMountedSecret('PARSER_API_KEY');
  if (apiKeyFromMounted) {
    config.auth.apiKey = apiKeyFromMounted;
    console.log('Successfully loaded auth.apiKey from mounted secret');
  }

  // If we got the API key from mounted secret, remove it from the fetch list
  const secretsToFetch = [];
  // Define the mapping between config paths and actual Secret Manager names
  const secretMap = {
      'services.gemini.apiKey': 'GEMINI_API_KEY',
      'auth.apiKey': 'PARSER_API_KEY',
      // Add other mappings if needed
  };

  // Check if auth.apiKey still needs to be loaded
  if (!config.auth.apiKey) {
    console.log('auth.apiKey not found in environment or mounted secret, will try Secret Manager');
    secretsToFetch.push({ configPath: 'auth.apiKey' });
  }
  
  // Check if other keys are needed
  if (!config.services.gemini.apiKey) secretsToFetch.push({ configPath: 'services.gemini.apiKey' });

  if (secretsToFetch.length === 0) {
    console.log('No secrets need to be loaded from Secret Manager.');
    return;
  }

  // Get the actual secret names for the ones we need to fetch
  const secretsToFetchWithNames = secretsToFetch.map(s => ({ ...s, secretName: secretMap[s.configPath] }));

  console.log('Attempting to load secrets from Secret Manager:', secretsToFetchWithNames.map(s => s.secretName));

  try {
    const client = new SecretManagerServiceClient();
    const projectId = config.gcp.projectId;

    if (!projectId) {
      console.error('GOOGLE_CLOUD_PROJECT is not set. Cannot load secrets via API.');
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set');
    }

    console.log(`Loading secrets via API from project: ${projectId}`);

    // Use the mapped secret names
    for (const secret of secretsToFetchWithNames) {
      if (!secret.secretName) {
          console.warn(`No Secret Manager name mapping found for config path: ${secret.configPath}`);
          continue;
      }
      const secretResourceName = `projects/${projectId}/secrets/${secret.secretName}/versions/latest`;
      console.log(`Accessing secret via API: ${secret.secretName} (${secretResourceName}) for config path ${secret.configPath}`);
      try {
          const [version] = await client.accessSecretVersion({ name: secretResourceName });
          if (version.payload?.data) {
            const value = version.payload.data.toString('utf8');
            const keys = secret.configPath.split('.');
            let current = config;
            for (let i = 0; i < keys.length - 1; i++) {
              current = current[keys[i]] = current[keys[i]] || {};
            }
            current[keys[keys.length - 1]] = value;
            console.log(`Successfully loaded secret via API: ${secret.secretName} into ${secret.configPath}`);
          } else {
            console.warn(`Secret payload empty via API for: ${secret.secretName}`);
          }
      } catch (secretError) {
          console.error(`Could not load secret via API: ${secret.secretName}. Error: ${secretError.message}. Code: ${secretError.code}`);
          console.error('Full error:', JSON.stringify(secretError));
          if (secretError.code === 5) { console.error(` -> Secret or version not found via API.`); }
          else if (secretError.code === 7) { console.error(` -> Permission denied accessing secret via API. Ensure service account has Secret Manager Secret Accessor role.`); }
      }
    }
    console.log('Finished loading secrets via API.');

  } catch (error) {
    console.error(`Failed to load secrets via Secret Manager API: ${error.message}`, error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

/**
 * Validate required configuration after potential secret loading
 * @returns {Array<string>} - List of missing required configuration keys
 */
export function validateConfig() {
  // Re-validate after attempting all loading methods
  const requiredKeys = [
    'gcp.projectId',
    'services.gemini.apiKey',
    'auth.apiKey',
    'services.pubsub.topicId'
  ];

  const missingKeys = [];

  for (const key of requiredKeys) {
    const paths = key.split('.');
    let current = config;
    let isMissing = false;

    for (const path of paths) {
      if (current === null || typeof current === 'undefined' || !Object.prototype.hasOwnProperty.call(current, path)) {
        isMissing = true;
        break;
      }
      current = current[path];
    }

    if (isMissing || current === null || typeof current === 'undefined' || current === '') {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
      console.warn('Configuration validation failed. The following required keys are missing or empty (checked env vars and potentially Secret Manager API for keys):', missingKeys);
      if (missingKeys.includes('auth.apiKey')) {
        console.error('The API key is required and should be loaded from Secret Manager with secret name: PARSER_API_KEY');
      }
  }

  return missingKeys;
}

export default config;