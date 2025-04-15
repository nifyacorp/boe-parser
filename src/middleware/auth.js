/**
 * Authentication middleware
 */
import config from '../config/config.js';
import { createAuthenticationError } from '../utils/errors/AppError.js';

// Cache for the API key to avoid repeated Secret Manager lookups
let cachedApiKey = null;
let isFetchingApiKey = false;

/**
 * Fetch API key from Secret Manager
 * Caches the key after the first successful fetch.
 */
async function getApiKey() {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  // Avoid concurrent fetches
  if (isFetchingApiKey) {
    // Wait for the ongoing fetch to complete
    await new Promise(resolve => setTimeout(resolve, 100)); // Simple wait
    return getApiKey(); // Retry getting the cached key
  }

  // Only fetch from Secret Manager
  if (config.auth.apiKeySecretName) {
    isFetchingApiKey = true;
    try {
      console.log('Fetching API key from Secret Manager...');
      const { accessSecretVersion } = await import('../utils/secrets.js');
      cachedApiKey = await accessSecretVersion(config.auth.apiKeySecretName);
      console.log('API key fetched and cached successfully from Secret Manager.');
      isFetchingApiKey = false;
      return cachedApiKey;
    } catch (error) {
      isFetchingApiKey = false;
      console.error(`Failed to fetch API key from Secret Manager (Secret: ${config.auth.apiKeySecretName})`, { error });
      // No fallback to environment variable - return null if Secret Manager fails
      return null;
    }
  }

  // If Secret Manager is not configured
  console.error('API key is not configured in Secret Manager (PARSER_API_KEY)');
  return null;
}

/**
 * Validate API key middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function validateApiKey(req, res, next) {
  const reqId = req.id; // Use request ID for logging context
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.warn(`Missing Authorization header - Request ID: ${reqId}`);
      return next(createAuthenticationError('Authorization header is required'));
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer') {
      console.warn(`Invalid authorization type - Request ID: ${reqId}`);
      return next(createAuthenticationError('Bearer token is required'));
    }

    if (!token) {
      console.warn(`Missing token - Request ID: ${reqId}`);
      return next(createAuthenticationError('API key is required'));
    }

    // Get the valid API key (handles caching)
    const validApiKey = await getApiKey();

    if (!validApiKey) {
      console.error(`Service configuration error: API key could not be loaded - Request ID: ${reqId}`);
      // Do not expose details about key loading failure
      return next(createAuthenticationError('Service configuration error', { statusCode: 500 }));
    }

    if (token !== validApiKey) {
      console.warn(`Invalid API key provided - Request ID: ${reqId}`);
      return next(createAuthenticationError('Invalid API key'));
    }

    // Key is valid
    next();
  } catch (error) {
    // Catch errors during API key fetching or validation
    console.error(`Error during API key validation - Request ID: ${reqId}`, { error: error.message });
    next(createAuthenticationError('Authentication failed', { cause: error }));
  }
}