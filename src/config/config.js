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
  // Default path where Cloud Run mounts secrets passed via --set-secrets
  const defaultSecretPath = `/etc/secrets/${secretName}`;
  // Allow overriding path via environment variable if needed (optional)
  const secretPath = process.env[`${secretName}_FILE`] || defaultSecretPath;
  try {
    if (fs.existsSync(secretPath)) {
      console.log(`Reading secret from mounted file: ${secretPath}`);
      return fs.readFileSync(secretPath, 'utf8').trim();
    }
  } catch (e) {
    // Log warning but don't crash if file reading fails
    console.warn(`Could not read mounted secret file ${secretPath}: ${e.message}`);
  }
  return null; // Return null if file doesn't exist or isn't readable
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
  gcp: { // Added GCP section for clarity
    projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
  },
  services: {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || readMountedSecret('GEMINI_API_KEY') || '', // Check env, then file
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || readMountedSecret('OPENAI_API_KEY') || '', // Check env, then file
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      organization: process.env.OPENAI_ORGANIZATION || '',
    },
    pubsub: {
      topicId: pubsubTopicName, // Use the loaded topic name
      errorTopicId: pubsubDlqTopicName, // Use the loaded DLQ topic name
      // projectId is now under gcp section
    },
  },
  auth: {
    apiKey: process.env.API_KEY || readMountedSecret('API_KEY') || '', // Check env, then file
  },
  scraper: { // Added scraper config section
      timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10),
      userAgent: process.env.SCRAPER_USER_AGENT || 'BOE Parser Bot/1.0'
  }
};

/**
 * Load secrets from Google Cloud Secret Manager API
 * This acts as a fallback or alternative if env vars/mounted files aren't used/available.
 * Only runs in production.
 * @returns {Promise<void>} - Resolves when secrets are loaded
 */
export async function loadSecrets() {
  if (!IS_PRODUCTION) {
    console.log('Not in production, skipping Secret Manager API calls.');
    return;
  }

  console.log('Production environment. Checking if secrets need fetching via API...');

  const secretsToFetch = [];
  // Check if keys loaded initially (from env/file) are still missing
  if (!config.services.gemini.apiKey) secretsToFetch.push({ secretName: 'GEMINI_API_KEY', configPath: 'services.gemini.apiKey' });
  if (!config.services.openai.apiKey) secretsToFetch.push({ secretName: 'OPENAI_API_KEY', configPath: 'services.openai.apiKey' });
  if (!config.auth.apiKey) secretsToFetch.push({ secretName: 'API_KEY', configPath: 'auth.apiKey' });

  if (secretsToFetch.length === 0) {
    console.log('Required API keys seem to be loaded already (from env vars or mounted files). Skipping Secret Manager API calls.');
    return;
  }

  console.log('Attempting to load missing secrets from Secret Manager API:', secretsToFetch.map(s => s.secretName));

  try {
    const client = new SecretManagerServiceClient();
    const projectId = config.gcp.projectId;

    if (!projectId) {
      console.error('GOOGLE_CLOUD_PROJECT is not set. Cannot load secrets via API.');
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set');
    }

    console.log(`Loading secrets via API from project: ${projectId}`);

    for (const secret of secretsToFetch) {
      const secretResourceName = `projects/${projectId}/secrets/${secret.secretName}/versions/latest`;
      console.log(`Accessing secret via API: ${secret.secretName} (${secretResourceName})`);
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
            console.log(`Successfully loaded secret via API: ${secret.secretName}`);
          } else {
            console.warn(`Secret payload empty via API for: ${secret.secretName}`);
          }
      } catch (secretError) {
          console.warn(`Could not load secret via API: ${secret.secretName}. Error: ${secretError.message}. Code: ${secretError.code}`);
          if (secretError.code === 5) { console.warn(` -> Secret or version not found via API.`); }
          else if (secretError.code === 7) { console.warn(` -> Permission denied accessing secret via API.`); }
      }
    }
    console.log('Finished loading secrets via API.');

  } catch (error) {
    console.error(`Failed to load secrets via Secret Manager API: ${error.message}`, error);
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
    'services.openai.apiKey',
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
      console.warn('Configuration validation failed. The following required keys are missing or empty AFTER checking env, mounted files, and Secret Manager API:', missingKeys);
  }

  return missingKeys;
}

export default config;