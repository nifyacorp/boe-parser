const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

function formatObject(obj) {
  if (obj instanceof Error) {
    return {
      message: obj.message,
      name: obj.name,
      stack: obj.stack,
      ...obj
    };
  }
  
  if (typeof obj === 'object' && obj !== null) {
    return JSON.stringify(obj, null, 2);
  }
  
  return obj;
}

function formatMessage(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const formattedData = Object.entries(data)
    .map(([key, value]) => `\n  ${key}: ${formatObject(value)}`)
    .join('');
    
  return `[${timestamp}] ${level.toUpperCase()}: ${message}${formattedData}`;
}

function shouldLog(level) {
  return LEVELS[level] <= LEVELS[LOG_LEVEL];
}

export const logger = {
  error(data, message) {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, data));
    }
  },

  warn(data, message) {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, data));
    }
  },

  info(data, message) {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, data));
    }
  },

  debug(data, message) {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message, data));
    }
  }
};
