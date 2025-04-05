/**
 * Configuration management module
 */
import dotenv from 'dotenv';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

// Load environment variables from .env file
dotenv.config();

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
      apiKey: process.env.GEMINI_API_KEY || '', // Will be loaded from Secret Manager in prod
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '', // Will be loaded from Secret Manager in prod
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
    apiKey: process.env.API_KEY || '', // Will be loaded from Secret Manager in prod
  },
  scraper: { // Added scraper config section
      timeout: parseInt(process.env.SCRAPER_TIMEOUT_MS || '15000', 10),
      userAgent: process.env.SCRAPER_USER_AGENT || 'BOE Parser Bot/1.0'
  }
};

/**
 * Load secrets from Google Cloud Secret Manager
 * Only runs in production.
 * @returns {Promise<void>} - Resolves when secrets are loaded
 */
export async function loadSecrets() {
  if (!IS_PRODUCTION) {
    console.log('Not in production, skipping secret manager for API keys.');
    return;
  }

  console.log('Production environment detected. Attempting to load secrets from Secret Manager...');

  try {
    const client = new SecretManagerServiceClient();
    const projectId = config.gcp.projectId; // Use projectId from gcp section

    if (!projectId) {
      // This shouldn't happen in Cloud Run usually, but good practice to check
      console.error('GOOGLE_CLOUD_PROJECT environment variable is not set. Cannot load secrets.');
      // Decide if this is a fatal error for your app
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set');
    }

    console.log(`Loading secrets from project: ${projectId}`);

    // Define secrets to load (using env var names as secret names by convention)
    const secretsToLoad = [
      { secretName: 'GEMINI_API_KEY', configPath: 'services.gemini.apiKey' },
      { secretName: 'OPENAI_API_KEY', configPath: 'services.openai.apiKey' },
      { secretName: 'API_KEY', configPath: 'auth.apiKey' },
      // Add other secrets here if needed, e.g.:
      // { secretName: 'DATABASE_PASSWORD', configPath: 'database.password' },
    ];

    for (const secret of secretsToLoad) {
      const secretResourceName = `projects/${projectId}/secrets/${secret.secretName}/versions/latest`;
      console.log(`Accessing secret: ${secret.secretName} (${secretResourceName})`);
      try {
          const [version] = await client.accessSecretVersion({ name: secretResourceName });
          if (version.payload?.data) {
            const value = version.payload.data.toString('utf8');
            // Update config using dot notation path
            const keys = secret.configPath.split('.');
            let current = config;
            for (let i = 0; i < keys.length - 1; i++) {
              current = current[keys[i]] = current[keys[i]] || {}; // Create nested objects if they don't exist
            }
            current[keys[keys.length - 1]] = value;
            console.log(`Successfully loaded secret: ${secret.secretName}`);
          } else {
            console.warn(`Secret payload empty for: ${secret.secretName}`);
          }
      } catch (secretError) {
          // Log specific secret loading errors but don't necessarily stop the app
          // The validateConfig function later will catch if required keys are still missing.
          console.warn(`Could not load secret: ${secret.secretName}. Error: ${secretError.message}. Code: ${secretError.code}`);
          if (secretError.code === 5) { // 5 = NOT_FOUND
              console.warn(` -> Secret or version not found. Ensure secret '${secret.secretName}' exists and the service account has access.`);
          } else if (secretError.code === 7) { // 7 = PERMISSION_DENIED
              console.warn(` -> Permission denied accessing secret '${secret.secretName}'. Check IAM permissions for Secret Manager Secret Accessor role.`);
          }
      }
    }
    console.log('Finished loading secrets.');

  } catch (error) {
    // Catch errors initializing the client or other unexpected issues
    console.error(`Failed to load secrets from Secret Manager: ${error.message}`, error);
    // Depending on the app's needs, you might want to rethrow or exit
    throw error;
  }
}

/**
 * Validate required configuration after potential secret loading
 * @returns {Array<string>} - List of missing required configuration keys
 */
export function validateConfig() {
  const requiredKeys = [
    'gcp.projectId', // Project ID is generally needed
    'services.gemini.apiKey',
    'services.openai.apiKey',
    'auth.apiKey',
    'services.pubsub.topicId' // PubSub topic is essential
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

    // Check if the final value is null, undefined, or an empty string
    if (isMissing || current === null || typeof current === 'undefined' || current === '') {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
      console.warn('Configuration validation failed. The following required keys are missing or empty:', missingKeys);
  }

  return missingKeys;
}

export default config;