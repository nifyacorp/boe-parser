import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const isDevelopment = process.env.NODE_ENV === 'development';

const loggerConfig = {
  level: LOG_LEVEL,
  messageKey: 'message',
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res
  },
  formatters: {
    level: (label) => ({ severity: label.toUpperCase() }),
    bindings: () => ({})
  },
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  base: null
};

// Only use pino-pretty in development
if (isDevelopment) {
  loggerConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      messageFormat: '{msg} {payload}',
      singleLine: false,
      levelFirst: true
    }
  };
}

export const logger = pino(loggerConfig);