import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { logger } from './logger.js';

const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'delta-entity-447812-p2';
const client = new SecretManagerServiceClient();

export async function getSecret(name) {
  try {
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set');
    }

    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${name}/versions/latest`,
    });

    return version.payload.data.toString();
  } catch (error) {
    logger.error({
      error: error.message,
      secretName: name,
      projectId,
      stack: error.stack
    }, 'Error fetching secret');
    throw new Error(`Failed to fetch secret: ${error.message}`);
  }
}