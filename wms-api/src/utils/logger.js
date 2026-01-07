// wms-api/src/utils/logger.js
// Centralized logging utility with configurable levels

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// Handle both ESM (import.meta.url) and CommonJS (__dirname) environments
// When bundled with pkg, import.meta.url may be undefined
let __dirname;
try {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = path.dirname(__filename);
  } else {
    // Fallback for CommonJS or when import.meta is not available
    __dirname = process.pkg ? path.dirname(process.execPath) : path.resolve('.');
  }
} catch (error) {
  // If fileURLToPath fails, use process.execPath or current directory
  __dirname = process.pkg ? path.dirname(process.execPath) : path.resolve('.');
}

// Get logging configuration from environment variables
const ERROR_LOG_ENABLED = process.env.Error_log === '1' || process.env.ERROR_LOG === '1';
const DETAILED_LOG_ENABLED = process.env.Detailed_log === '1' || process.env.DETAILED_LOG === '1';

// Determine log directory (relative to project root or executable location)
function getLogDirectory() {
  // Try to find project root or use current directory
  let logDir;
  
  // If running from executable (pkg), use process.execPath directory
  if (process.pkg) {
    logDir = path.join(path.dirname(process.execPath), 'log');
  } else {
    // Development mode - use project root
    logDir = path.join(__dirname, '..', '..', 'log');
  }
  
  // Ensure log directory exists
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Ensure Error_log subdirectory exists
  const errorLogDir = path.join(logDir, 'Error_log');
  if (!fs.existsSync(errorLogDir)) {
    fs.mkdirSync(errorLogDir, { recursive: true });
  }
  
  return { logDir, errorLogDir };
}

// Get formatted timestamp
function getTimestamp() {
  return new Date().toISOString();
}

// Format log message
function formatLogMessage(level, message, data = null) {
  const timestamp = getTimestamp();
  let logEntry = `[${timestamp}] [${level}] ${message}`;
  
  if (data) {
    if (typeof data === 'object') {
      try {
        logEntry += `\n${JSON.stringify(data, null, 2)}`;
      } catch (e) {
        logEntry += `\n${String(data)}`;
      }
    } else {
      logEntry += ` ${String(data)}`;
    }
  }
  
  return logEntry;
}

// Write to error log file
function writeErrorLogFile(message) {
  if (!ERROR_LOG_ENABLED) return;
  
  try {
    const { errorLogDir } = getLogDirectory();
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFile = path.join(errorLogDir, `error_${dateStr}.log`);
    
    const logEntry = formatLogMessage('ERROR', message) + '\n';
    fs.appendFileSync(logFile, logEntry, 'utf8');
  } catch (error) {
    // Silent fail - don't crash the app if logging fails
    console.error('Failed to write error log file:', error.message);
  }
}

// Write to detailed log file
function writeDetailedLogFile(level, message, data = null) {
  if (!DETAILED_LOG_ENABLED) return;
  
  try {
    const { logDir } = getLogDirectory();
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFile = path.join(logDir, `detailed_${dateStr}.log`);
    
    const logEntry = formatLogMessage(level, message, data) + '\n';
    fs.appendFileSync(logFile, logEntry, 'utf8');
  } catch (error) {
    // Silent fail - don't crash the app if logging fails
    console.error('Failed to write detailed log file:', error.message);
  }
}

/**
 * Logger utility with configurable levels
 */
export const logger = {
  /**
   * Log error messages
   * Always logged to console if Error_log=1, also saved to file
   */
  error: (message, data = null) => {
    const logMessage = formatLogMessage('ERROR', message, data);
    
    if (ERROR_LOG_ENABLED) {
      console.error(logMessage);
      writeErrorLogFile(message + (data ? `\n${JSON.stringify(data, null, 2)}` : ''));
    } else {
      // Still show errors in console even if file logging is disabled
      console.error(logMessage);
    }
  },

  /**
   * Log warning messages
   * Only logged if Detailed_log=1
   */
  warn: (message, data = null) => {
    if (!DETAILED_LOG_ENABLED) return;
    
    const logMessage = formatLogMessage('WARN', message, data);
    console.warn(logMessage);
    writeDetailedLogFile('WARN', message, data);
  },

  /**
   * Log informational messages
   * Only logged if Detailed_log=1
   */
  info: (message, data = null) => {
    if (!DETAILED_LOG_ENABLED) return;
    
    const logMessage = formatLogMessage('INFO', message, data);
    console.log(logMessage);
    writeDetailedLogFile('INFO', message, data);
  },

  /**
   * Log debug messages
   * Only logged if Detailed_log=1
   */
  debug: (message, data = null) => {
    if (!DETAILED_LOG_ENABLED) return;
    
    const logMessage = formatLogMessage('DEBUG', message, data);
    console.log(logMessage);
    writeDetailedLogFile('DEBUG', message, data);
  },

  /**
   * Log success messages
   * Only logged if Detailed_log=1
   */
  success: (message, data = null) => {
    if (!DETAILED_LOG_ENABLED) return;
    
    const logMessage = formatLogMessage('SUCCESS', message, data);
    console.log(logMessage);
    writeDetailedLogFile('SUCCESS', message, data);
  },
};

// Log startup configuration
if (DETAILED_LOG_ENABLED || ERROR_LOG_ENABLED) {
  console.log('\n📋 Logging Configuration:');
  console.log(`  Error Log: ${ERROR_LOG_ENABLED ? '✅ Enabled (saving to log/Error_log/)' : '❌ Disabled'}`);
  console.log(`  Detailed Log: ${DETAILED_LOG_ENABLED ? '✅ Enabled' : '❌ Disabled'}`);
  console.log('');
}

export default logger;
