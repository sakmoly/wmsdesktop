# API Server IP Address Configuration Guide

## Overview
This guide explains how to configure the WMS API server to use an IP address instead of localhost, allowing access from other devices on the network.

---

## Step 1: Find Your Server's IP Address

### Windows:
```powershell
ipconfig
```
Look for **IPv4 Address** under your active network adapter (usually starts with 192.168.x.x or 10.x.x.x)

### Linux/Mac:
```bash
ifconfig
# or
ip addr show
```

**Example IP Address:** `192.168.1.100`

---

## Step 2: Configure API Server (Backend)

### Option A: Using Environment Variable (Recommended)

1. **Edit or create `.env` file** in `wms-api` directory:
```env
# Server Configuration
PORT=3000
HOST=0.0.0.0  # Bind to all network interfaces

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=wms_desktop

# JWT Configuration
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d
```

2. **Restart the API server:**
```bash
cd wms-api
npm start
```

The server will now be accessible at:
- `http://YOUR_IP_ADDRESS:3000` (from other devices)
- `http://localhost:3000` (from the same machine)

### Option B: Bind to Specific IP Address

If you want to bind to a specific IP address only:

1. **Edit `.env` file:**
```env
HOST=192.168.1.100  # Replace with your actual IP
PORT=3000
```

2. **Restart the server**

---

## Step 3: Configure Desktop Application

### Method 1: Through Settings UI (Recommended)

1. **Open Desktop Application**
2. **Go to Settings** (usually in menu or toolbar)
3. **Find "API Endpoint URL" field**
4. **Enter your IP address:**
   ```
   http://192.168.1.100:3000/api
   ```
   (Replace `192.168.1.100` with your actual IP address)
5. **Save Settings**

### Method 2: Edit Settings File Directly

1. **Locate settings file:**
   - Location: `bin/Debug/net8.0-windows/wms_settings.json` or `bin/Release/net8.0-windows/wms_settings.json`
   
2. **Edit the file:**
```json
{
  "Company": "Your Company",
  "ApiEndpointUrl": "http://192.168.1.100:3000/api",
  "ApiKey": "your-api-key",
  ...
}
```

3. **Replace `192.168.1.100` with your actual IP address**

---

## Step 4: Configure Mobile Application

Update the mobile app's API base URL configuration:

1. **Find API configuration in mobile app** (usually in settings or config file)
2. **Set API Base URL to:**
   ```
   http://192.168.1.100:3000
   ```
   (Replace `192.168.1.100` with your actual IP address)

---

## Step 5: Verify Configuration

### Test API Server Accessibility

From another device on the same network:

```bash
# Test health endpoint
curl http://192.168.1.100:3000/health

# Expected response:
# {"status":"ok","message":"WMS API Server is running"}
```

### Test from Desktop App

1. Open Desktop Application
2. Check if it can connect to the API
3. Try syncing data or making an API call

### Test from Mobile App

1. Open Mobile Application
2. Try logging in or fetching data
3. Verify API calls are successful

---

## Troubleshooting

### Issue: Cannot connect from other devices

**Solutions:**
1. **Check Firewall:**
   - Windows: Allow port 3000 in Windows Firewall
   - Linux: `sudo ufw allow 3000`
   - Mac: Allow in System Preferences > Security & Privacy > Firewall

2. **Verify IP Address:**
   - Make sure you're using the correct IP address
   - Ensure the server and client are on the same network

3. **Check Server Status:**
   ```bash
   # On server machine
   curl http://localhost:3000/health
   ```

4. **Check Network:**
   - Ensure both devices are on the same network (same WiFi/LAN)
   - Some networks block device-to-device communication

### Issue: Connection refused

**Solutions:**
1. **Verify server is running:**
   ```bash
   # Check if server is listening
   netstat -an | findstr :3000  # Windows
   netstat -an | grep :3000      # Linux/Mac
   ```

2. **Check HOST binding:**
   - Ensure `HOST=0.0.0.0` in `.env` file
   - Restart server after changing `.env`

### Issue: CORS errors

**Solution:**
- The server already has CORS enabled (`app.use(cors())`)
- If issues persist, check that the API URL in client apps matches exactly

---

## Security Considerations

### For Production:

1. **Use HTTPS:**
   - Set up SSL/TLS certificate
   - Use `https://` instead of `http://`

2. **Restrict Access:**
   - Use firewall rules to limit access
   - Consider using VPN for remote access

3. **Authentication:**
   - Ensure JWT authentication is properly configured
   - Use strong JWT_SECRET

---

## Quick Reference

### Server Configuration (.env)
```env
HOST=0.0.0.0          # Bind to all interfaces
PORT=3000             # Server port
```

### Desktop App Settings
```
API Endpoint URL: http://YOUR_IP:3000/api
```

### Mobile App Settings
```
API Base URL: http://YOUR_IP:3000
```

### Health Check URL
```
http://YOUR_IP:3000/health
```

---

## Example Configuration

**Server IP:** `192.168.1.100`  
**Port:** `3000`

**Desktop App API URL:**
```
http://192.168.1.100:3000/api
```

**Mobile App API URL:**
```
http://192.168.1.100:3000
```

**Health Check:**
```
http://192.168.1.100:3000/health
```

---

**Note:** After changing the IP address configuration, restart both the API server and the desktop/mobile applications for changes to take effect.

