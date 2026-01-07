# Cycle Count API Configuration Fix

## 🔍 Issue

The desktop application is trying to connect to an invalid API endpoint URL:
```
https://erpnext.printechs.example.com/api
```

This is a placeholder URL that doesn't exist, causing connection errors.

---

## ✅ Solution: Configure Correct API Endpoint

### Step 1: Find Your API Server URL

Your WMS API server should be running on:
- **Local development:** `http://localhost:3000` or `http://127.0.0.1:3000`
- **Network access:** `http://192.168.x.x:3000` (replace with your server's IP address)

### Step 2: Update Settings in Desktop App

1. **Open Desktop Application**
2. **Go to Settings** (click "Settings" in the navigation menu)
3. **Find "API Endpoint URL" field**
4. **Enter the correct URL:**
   - For local: `http://localhost:3000/api`
   - For network: `http://192.168.1.100:3000/api` (replace with your IP)
5. **Enter API Key** (if required)
6. **Click "Save Settings"**

### Step 3: Verify API Server is Running

Make sure your WMS API server is running:

```bash
# Check if server is running
cd wms-api
node src/server.js
```

Or if using PM2:
```bash
pm2 status
```

### Step 4: Test Connection

After updating settings, try to:
1. Submit a Cycle Count Task
2. Complete a Cycle Count Task

If it works, you'll see a success message. If not, check the error message for more details.

---

## 📝 Common API Endpoint URLs

### Local Development:
```
http://localhost:3000/api
```

### Network Access (Same Machine):
```
http://127.0.0.1:3000/api
```

### Network Access (Other Devices):
```
http://192.168.1.100:3000/api
```
(Replace `192.168.1.100` with your actual server IP address)

---

## ⚠️ Important Notes

1. **No HTTPS for Local Development:**
   - Use `http://` not `https://` for local development
   - HTTPS requires SSL certificates

2. **Include `/api` in URL:**
   - The URL should end with `/api`
   - Example: `http://localhost:3000/api` ✅
   - Not: `http://localhost:3000` ❌

3. **Check Firewall:**
   - If accessing from network, ensure port 3000 is open
   - Windows Firewall may block connections

4. **API Key:**
   - If your API requires authentication, make sure the API Key is correct
   - Check your API server configuration for the correct key format

---

## 🔧 Error Messages

### "Cannot connect to API server"
- **Cause:** DNS resolution failed or server is unreachable
- **Solution:** Check API endpoint URL in Settings

### "Connection refused"
- **Cause:** Server is not running or wrong port
- **Solution:** Start the API server and verify the port

### "Request timed out"
- **Cause:** Server is slow or network issues
- **Solution:** Check network connection and server status

---

## 🧪 Testing API Connection

You can test the API connection manually:

### Using curl:
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test cycle count endpoint (with auth)
curl -X POST http://localhost:3000/api/cycle-count/CC-0001/submit \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

### Using Browser:
```
http://localhost:3000/health
```

---

## 📍 Settings File Location

If you prefer to edit settings directly:

**Location:**
- Debug: `bin/Debug/net8.0-windows/wms_settings.json`
- Release: `bin/Release/net8.0-windows/wms_settings.json`

**Edit:**
```json
{
  "ApiEndpointUrl": "http://localhost:3000/api",
  "ApiKey": "your-api-key-here",
  ...
}
```

---

## ✅ After Configuration

Once you've configured the correct API endpoint:

1. ✅ Cycle Count Submit will work
2. ✅ Cycle Count Complete will work
3. ✅ All API calls will use the correct server

The improved error messages will now guide you if there are any connection issues.

