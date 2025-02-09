import { logger } from './logger.js';
import { getSecret } from './secrets.js';

let cachedApiKey = null;

async function getApiKey() {
  if (!cachedApiKey) {
    try {
      cachedApiKey = await getSecret('PARSER_API_KEY');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to retrieve API key from Secret Manager');
      throw new Error('Failed to retrieve API key');
    }
  }
  return cachedApiKey;
}

export async function validateApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    logger.warn({ reqId: req.id }, 'Missing Authorization header');
    return res.status(401).json({ error: 'Authorization header is required' });
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer') {
    logger.warn({ reqId: req.id }, 'Invalid authorization type');
    return res.status(401).json({ error: 'Bearer token is required' });
  }

  if (!token) {
    logger.warn({ reqId: req.id }, 'Missing token');
    return res.status(401).json({ error: 'API key is required' });
  }

  try {
    const validApiKey = await getApiKey();

    if (token !== validApiKey) {
      logger.warn({ reqId: req.id }, 'Invalid API key');
      return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
  } catch (error) {
    logger.error({ reqId: req.id, error: error.message }, 'Error validating API key');
    return res.status(500).json({ error: 'Service configuration error' });
  }
}