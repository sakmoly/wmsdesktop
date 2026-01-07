# Logging Configuration Guide

## Overview

The WMS API Server supports configurable logging with two levels:

1. **Error Logging** - Captures all errors
2. **Detailed Logging** - Captures info, debug, and warnings

## Environment Variables

Add these to your `.env` file:

```env
# Error Logging
# Set to 1 to enable error logging (saves to \log\Error_log\ directory)
# Set to 0 to disable error log file (errors still appear in console)
Error_log=1

# Detailed Logging
# Set to 1 to enable detailed logging (info, debug, warnings)
# Set to 0 to disable all detailed logs
Detailed_log=1
```

## Log File Locations

### Error Logs
- **Directory**: `\log\Error_log\`
- **File Format**: `error_YYYY-MM-DD.log`
- **Example**: `error_2026-01-01.log`
- **Contents**: All error messages with timestamps

### Detailed Logs
- **Directory**: `\log\`
- **File Format**: `detailed_YYYY-MM-DD.log`
- **Example**: `detailed_2026-01-01.log`
- **Contents**: All info, debug, warning, and success messages

## Log Levels

### Error (`logger.error()`)
- **Always logged** to console (even if `Error_log=0`)
- **Saved to file** when `Error_log=1`
- Used for: exceptions, failures, critical errors

### Warning (`logger.warn()`)
- **Only logged** when `Detailed_log=1`
- Used for: non-critical issues, validation warnings

### Info (`logger.info()`)
- **Only logged** when `Detailed_log=1`
- Used for: general information, server startup, requests

### Debug (`logger.debug()`)
- **Only logged** when `Detailed_log=1`
- Used for: detailed debugging information

### Success (`logger.success()`)
- **Only logged** when `Detailed_log=1`
- Used for: successful operations

## Configuration Examples

### Production (Minimal Logging)
```env
Error_log=1
Detailed_log=0
```
- Only errors are logged to file
- Console shows errors only
- Minimal disk usage

### Development (Full Logging)
```env
Error_log=1
Detailed_log=1
```
- All errors and detailed logs are saved
- Maximum debugging information
- Higher disk usage

### No File Logging
```env
Error_log=0
Detailed_log=0
```
- No log files created
- Errors still appear in console
- Zero disk usage for logs

## Usage in Code

### Import the Logger
```javascript
import { logger } from '../utils/logger.js';
```

### Log Errors
```javascript
try {
  // some code
} catch (error) {
  logger.error('Failed to process request', {
    errorType: error.constructor.name,
    message: error.message,
    stack: error.stack
  });
}
```

### Log Information
```javascript
logger.info('Processing request', { userId, action });
```

### Log Debug Messages
```javascript
logger.debug('Database query executed', { query, params });
```

### Log Warnings
```javascript
logger.warn('Deprecated API endpoint used', { endpoint, version });
```

### Log Success
```javascript
logger.success('Operation completed successfully', { itemCount });
```

## Log File Rotation

- Log files are automatically rotated daily
- Each day gets a new file with format: `error_YYYY-MM-DD.log` or `detailed_YYYY-MM-DD.log`
- Old log files are not automatically deleted (you may want to set up cleanup)

## Log Directory Structure

```
wms-api/
├── log/
│   ├── Error_log/
│   │   ├── error_2026-01-01.log
│   │   ├── error_2026-01-02.log
│   │   └── ...
│   ├── detailed_2026-01-01.log
│   ├── detailed_2026-01-02.log
│   └── ...
└── ...
```

## Troubleshooting

### Log Files Not Created

1. Check `.env` file exists and contains `Error_log=1` or `Detailed_log=1`
2. Check write permissions in the application directory
3. Check available disk space
4. Look for errors in console output

### Log Files Too Large

1. Set `Detailed_log=0` to disable detailed logging
2. Manually delete old log files
3. Set up automatic log rotation/cleanup

### Can't Find Log Directory

- Log directory is created automatically on first log write
- Location:
  - **Development**: `wms-api/log/`
  - **Executable**: `log/` (same directory as executable)

## Best Practices

1. **Always enable error logging** (`Error_log=1`) in production
2. **Disable detailed logging** (`Detailed_log=0`) in production for performance
3. **Enable both** during development and debugging
4. **Monitor log file sizes** and set up cleanup/rotation
5. **Review error logs regularly** to identify issues early
