/**
 * Production-friendly logging utility
 * Conditionally logs based on environment and log level
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1, 
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor() {
    this.level = this.getLogLevel();
  }

  getLogLevel() {
    const env = process.env.NODE_ENV;
    const logLevel = process.env.LOG_LEVEL;

    // In production, default to INFO level unless explicitly set
    if (env === 'production') {
      return LOG_LEVELS[logLevel] || LOG_LEVELS.INFO;
    }
    
    // In development, default to DEBUG level
    return LOG_LEVELS[logLevel] || LOG_LEVELS.DEBUG;
  }

  error(...args) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(...args);
    }
  }

  warn(...args) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(...args);
    }
  }

  info(...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(...args);
    }
  }

  debug(...args) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(...args);
    }
  }

  // For important operational messages that should always appear
  important(...args) {
    console.log(...args);
  }
}

export const logger = new Logger();
export default logger;