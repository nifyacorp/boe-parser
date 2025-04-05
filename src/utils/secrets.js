/**
 * Secret Manager utility
 */
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
// Removed logger import
import config from '../config/config.js';

let secretsCache = {};
let client;

function getClient() {
  if (!client) {
    client = new SecretManagerServiceClient();
  }
  return client;
}

async function accessSecretVersion(secretName) {
  try {
    const name = `projects/${config.gcp.projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await getClient().accessSecretVersion({ name });
    return version.payload.data.toString('utf8');
  } catch (error) {
    // Replaced logger.error with console.error
    console.error(`Failed to access secret: ${secretName}`, { error });
    throw error; // Re-throw after logging
  }
}

// Add functions to load secrets into cache, etc.

export { accessSecretVersion };