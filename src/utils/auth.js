import { logger } from './logger.js';
import { getSecret } from './secrets.js';

// Use BOE_API_KEY as the secret name to match what's expected in the logs
const API_KEY_SECRET_NAME = 'BOE_API_KEY';
let cachedApiKey = null;
let cacheExpiry = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getApiKey() {
  // First check environment variable
  if (process.env.BOE_API_KEY) {
    return process.env.BOE_API_KEY;
  }
  
  // If not in env, try Secret Manager with caching
  const now = Date.now();
  if (!cachedApiKey || !cacheExpiry || now > cacheExpiry) {
    try {
      console.log('BOE_API_KEY not found in environment, attempting to load from Secret Manager...');
      logger.debug('Fetching API key from Secret Manager');
      cachedApiKey = await getSecret(API_KEY_SECRET_NAME);
      cacheExpiry = now + CACHE_DURATION;
      logger.debug('API key fetched and cached successfully');
    } catch (error) {
      logger.error({ 
        error: error.message,
        stack: error.stack,
        secretName: API_KEY_SECRET_NAME
      }, 'Failed to retrieve API key from Secret Manager');
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
      logger.warn({ 
        reqId: req.id,
        providedKeyLength: token.length,
        expectedKeyLength: validApiKey.length,
        keyMismatch: true
      }, 'Invalid API key');
      return res.status(401).json({ error: 'Invalid API key' });
    }

    next();
  } catch (error) {
    logger.error({ reqId: req.id, error: error.message }, 'Error validating API key');
    return res.status(500).json({ error: 'Service configuration error' });
  }
}