/**
 * Logger module for structured logging
 */
import pino from 'pino';

// Configure log level based on environment
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Configure logger options
const loggerOptions = {
  level: LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label };
    },
    bindings: () => {
      return {
        service: 'boe-parser',
        env: process.env.NODE_ENV || 'development',
      };
    },
  },
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Use pino-pretty in development for human-readable logs
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
};

// Create logger instance
const logger = pino(loggerOptions);

/**
 * Create a child logger with additional context
 * @param {Object} bindings - Additional context for logs
 * @returns {Object} Child logger instance
 */
export function createChildLogger(bindings = {}) {
  return logger.child(bindings);
}

export default logger;