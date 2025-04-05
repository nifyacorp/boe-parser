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
  services: {
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      organization: process.env.OPENAI_ORGANIZATION || '',
    },
    pubsub: {
      topicName: process.env.PUBSUB_TOPIC || 'boe-notifications',
      projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
    },
  },
  auth: {
    apiKey: process.env.API_KEY || '',
  },
};

/**
 * Load secrets from Google Cloud Secret Manager
 * @returns {Promise<void>} - Resolves when secrets are loaded
 */
export async function loadSecrets() {
  if (!IS_PRODUCTION) {
    console.log('Not in production, skipping secret manager');
    return;
  }

  try {
    const client = new SecretManagerServiceClient();
    const projectId = config.services.pubsub.projectId;

    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set');
    }

    // Define secrets to load
    const secretsToLoad = [
      { name: 'GEMINI_API_KEY', configPath: 'services.gemini.apiKey' },
      { name: 'OPENAI_API_KEY', configPath: 'services.openai.apiKey' },
      { name: 'API_KEY', configPath: 'auth.apiKey' },
    ];

    // Load each secret
    for (const secret of secretsToLoad) {
      const [version] = await client.accessSecretVersion({
        name: `projects/${projectId}/secrets/${secret.name}/versions/latest`,
      });

      if (version.payload?.data) {
        // Update config with secret value
        const value = version.payload.data.toString();
        const paths = secret.configPath.split('.');
        let current = config;
        
        // Navigate to the right location in the config object
        for (let i = 0; i < paths.length - 1; i++) {
          current = current[paths[i]];
        }
        
        // Update the value
        current[paths[paths.length - 1]] = value;
      }
    }
  } catch (error) {
    console.error('Error loading secrets:', error.message);
    throw error;
  }
}

/**
 * Validate required configuration
 * @returns {Array<string>} - List of missing required configuration keys
 */
export function validateConfig() {
  const requiredKeys = [
    'services.gemini.apiKey',
    'services.openai.apiKey',
    'auth.apiKey',
  ];

  const missingKeys = [];

  for (const key of requiredKeys) {
    const paths = key.split('.');
    let current = config;
    let isMissing = false;

    // Check if the key exists and has a value
    for (const path of paths) {
      if (!current || !current[path]) {
        isMissing = true;
        break;
      }
      current = current[path];
    }

    if (isMissing || current === '') {
      missingKeys.push(key);
    }
  }

  return missingKeys;
}

export default config;