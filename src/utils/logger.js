import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const isDevelopment = process.env.NODE_ENV === 'development';

const loggerConfig = {
  level: LOG_LEVEL,
  messageKey: 'message',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageFormat: '{msg} {payload}',
      singleLine: false,
      levelFirst: true
    }
  },
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res
  },
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
    bindings: () => ({}),
    log: (object) => {
      // Ensure objects are properly stringified
      const processed = {};
      for (const [key, value] of Object.entries(object)) {
        if (typeof value === 'object' && value !== null) {
          processed[key] = JSON.stringify(value, null, 2);
        } else {
          processed[key] = value;
        }
      }
      return processed;
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime
};

export const logger = pino(loggerConfig);