# Restart API Server

## Issue
The mobile app cannot connect to the API server at `http://192.168.103.219:3000`.

**Error:** `Network request failed`

## Solution

The API server needs to be restarted after code changes. The server might have crashed or stopped.

### Steps to Restart:

1. **Stop any running API server:**
   ```powershell
   # Find and kill Node.js processes running the API
   Get-Process -Name node | Stop-Process -Force
   ```

2. **Navigate to API directory:**
   ```powershell
   cd "D:\Development Project\Printechs WMS\Wms.Desktop\wms-api"
   ```

3. **Start the API server:**
   ```powershell
   node src/server.js
   ```

   OR if using PM2:
   ```powershell
   pm2 restart wms-api
   # or
   pm2 start ecosystem.config.js
   ```

4. **Verify the server is running:**
   ```powershell
   # Check if port 3000 is listening
   netstat -ano | Select-String ":3000"
   
   # Test the API health endpoint
   curl http://localhost:3000/api/health
   # or
   curl http://192.168.103.219:3000/api/health
   ```

### If Using PM2 (Recommended for Production):

```powershell
cd "D:\Development Project\Printechs WMS\Wms.Desktop\wms-api"

# Check status
pm2 status

# Restart
pm2 restart wms-api

# View logs
pm2 logs wms-api
```

### Troubleshooting:

1. **Check if port 3000 is already in use:**
   ```powershell
   netstat -ano | Select-String ":3000"
   ```

2. **Check server logs for errors:**
   - If using PM2: `pm2 logs wms-api`
   - If running directly: Check console output

3. **Verify IP address:**
   - The server might be running on `localhost` (127.0.0.1) instead of `192.168.103.219`
   - Check `src/server.js` for the host configuration
   - The server should bind to `0.0.0.0` to be accessible from other devices

4. **Firewall/Network:**
   - Ensure Windows Firewall allows port 3000
   - Verify the device (192.168.103.219) is on the same network

### Quick Start Command:

```powershell
cd "D:\Development Project\Printechs WMS\Wms.Desktop\wms-api"; node src/server.js
```

