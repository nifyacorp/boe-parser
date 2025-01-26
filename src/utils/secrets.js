import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { logger } from './logger.js';

const client = new SecretManagerServiceClient();

export async function getSecret(name) {
  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/${name}/versions/latest`,
    });

    return version.payload.data.toString();
  } catch (error) {
    logger.error('Error fetching secret', { error: error.message, secretName: name });
    throw new Error(`Failed to fetch secret: ${error.message}`);
  }
}
