# WMS API Server - Deployment Package

## Quick Start

1. **Configure Environment**
   - Copy `.env.template` to `.env`
   - Edit `.env` with your database credentials and settings

2. **Run the Server**
   - Double-click `wms-api.exe` to start the server
   - Or run from command line: `wms-api.exe`

3. **Verify Installation**
   - Open browser: http://localhost:3000/health
   - Should see: {"status":"ok","message":"WMS API Server is running"}

## Configuration

Edit `.env` file to configure:

- **Database**: Set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
- **Server**: Set PORT (default: 3000) and HOST (default: 0.0.0.0)
- **Security**: Set JWT_SECRET (required for authentication)
- **Logging**:
  - **Error_log=1**: Enable error logging (saves to \log\Error_log\ directory)
  - **Detailed_log=1**: Enable detailed logging (info, debug, warnings)
  - Set to 0 to disable each logging type

## Logging

The server supports two types of logging:

1. **Error Logging** (`Error_log=1`):
   - All errors are saved to `\log\Error_log\error_YYYY-MM-DD.log`
   - Errors are always shown in console regardless of setting
   - Recommended: Always keep enabled (Error_log=1)

2. **Detailed Logging** (`Detailed_log=1`):
   - Logs all info, debug, and warning messages
   - Saves to `\log\detailed_YYYY-MM-DD.log`
   - Set to 0 to disable (only errors will be logged if Error_log=1)
   - Recommended: Enable for debugging, disable for production

Log files are created daily (one file per day) in the `log` directory.

## Network Access

By default, the server binds to `0.0.0.0:3000`, making it accessible on your network.

To access from other devices:
- Find your computer's IP address: `ipconfig` (Windows) or `ifconfig` (Linux/Mac)
- Access: http://YOUR_IP:3000/health

## Windows Firewall

If the server doesn't respond from other devices, you may need to:
1. Allow the application through Windows Firewall
2. Or run: `netsh advfirewall firewall add rule name="WMS API" dir=in action=allow protocol=TCP localport=3000`

## Troubleshooting

- **Port already in use**: Change PORT in .env file
- **Database connection failed**: Check DB_* settings in .env
- **Server won't start**: Check .env file exists and is properly configured

## API Endpoints

- Health Check: GET http://localhost:3000/health
- API Base: http://localhost:3000/api
- Login: POST http://localhost:3000/api/auth/login

## Support

For issues or questions, contact your system administrator.
