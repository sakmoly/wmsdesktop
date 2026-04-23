# How to Login After URL Change

## 🔍 Problem

After changing the URL settings, you can't login because the login endpoint is pointing to the wrong server.

---

## ✅ Solution: Configure Both URLs Correctly

You need to set **two separate URLs**:

1. **WMS API Endpoint URL** - For login and WMS operations
2. **ERPNext API URL** - For item sync from ERPNext

---

## 📋 Step-by-Step Configuration

### Method 1: Through Settings UI (Recommended)

1. **Open the Desktop Application**
2. **If you see the login window**, you can still access settings:
   - Close the login window (click X or Cancel)
   - The main window should show Settings by default
   - OR click "Settings" in the left sidebar

3. **In Settings view, configure:**

   **a) WMS API Endpoint URL:**
   - Find "WMS API Endpoint URL" field
   - Set it to your **WMS API server**:
     ```
     http://localhost:3000/api
     ```
     OR
     ```
     http://192.168.103.219:3000/api
     ```
     (Replace with your actual WMS API server IP and port)

   **b) ERPNext API URL:**
   - Find "ERPNext API URL" field
   - Set it to your **ERPNext server**:
     ```
     http://192.168.103.187:88
     ```
     (Your ERPNext server base URL)

   **c) API Key:**
   - Find "API Key" field
   - This is for ERPNext authentication (for item sync)
   - Leave empty if you don't need item sync right now

4. **Settings auto-save** (or wait a moment)

5. **Try to login again:**
   - Close and reopen the app if needed
   - Enter your username and password
   - Login should now work!

---

### Method 2: Edit Settings File Directly

If you can't access the Settings UI, edit the settings file directly:

1. **Locate settings file:**
   - **Debug build:** `bin/Debug/net8.0-windows/wms_settings.json`
   - **Release build:** `bin/Release/net8.0-windows/wms_settings.json`

2. **Open the file in a text editor** (Notepad, VS Code, etc.)

3. **Update the settings:**
   ```json
   {
     "Company": "Printechs Advanced Printing Trading Co.",
     "ApiEndpointUrl": "http://localhost:3000/api",
     "ErpNextApiUrl": "http://192.168.103.187:88",
     "ApiKey": "your-erpnext-api-key-if-needed",
     ...
   }
   ```

   **Important:**
   - `ApiEndpointUrl` = **WMS API server** (for login)
   - `ErpNextApiUrl` = **ERPNext server** (for item sync)

4. **Save the file**

5. **Restart the desktop app**

6. **Try to login**

---

## 🔍 Find Your WMS API Server URL

If you don't know your WMS API server URL, check:

### Option 1: Check if WMS API is running locally

**Default local URL:**
```
http://localhost:3000/api
```

**Test if it's running:**
```bash
# Open command prompt and run:
curl http://localhost:3000/health
```

If you get a response like `{"status":"ok"}`, then use:
```
http://localhost:3000/api
```

### Option 2: Check network IP

If the WMS API server is on another machine:

1. **Find the server's IP address:**
   - On the server machine, run: `ipconfig` (Windows) or `ifconfig` (Linux)
   - Look for IPv4 address (e.g., `192.168.103.219`)

2. **Use the IP with port:**
   ```
   http://192.168.103.219:3000/api
   ```

### Option 3: Check WMS API server configuration

- Check the WMS API server's configuration file
- Look for the port it's running on (default: 3000)
- Use: `http://SERVER_IP:PORT/api`

---

## 🧪 Verify Configuration

### Test 1: Check Settings File

Open `wms_settings.json` and verify:
```json
{
  "ApiEndpointUrl": "http://localhost:3000/api",  // ✅ WMS API (for login)
  "ErpNextApiUrl": "http://192.168.103.187:88",  // ✅ ERPNext (for item sync)
  ...
}
```

### Test 2: Test WMS API Server

Before trying to login, verify the WMS API server is accessible:

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","message":"WMS API Server is running"}
```

### Test 3: Try Login

1. **Open desktop app**
2. **Enter username and password**
3. **Click "Sign In"**
4. **Check error logs** if it fails:
   - Location: `ErrorLogs/error_YYYY-MM-DD.log`
   - Look for: `AuthService: Attempting login to...`
   - Should show: `http://localhost:3000/api/auth/login` (or your WMS API URL)

---

## ⚠️ Common Issues

### Issue 1: "Cannot connect to server"

**Cause:** WMS API server is not running or wrong URL

**Solution:**
1. **Start the WMS API server:**
   ```bash
   cd wms-api
   npm start
   ```

2. **Verify it's running:**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Update `ApiEndpointUrl`** to match the server URL

### Issue 2: "404 NotFound" on login

**Cause:** `ApiEndpointUrl` is still pointing to ERPNext

**Solution:**
1. **Check `wms_settings.json`**
2. **Verify `ApiEndpointUrl`** is set to WMS API server (not ERPNext)
3. **Should be:** `http://localhost:3000/api` or `http://YOUR_IP:3000/api`
4. **Should NOT be:** `http://192.168.103.187:88` (that's ERPNext)

### Issue 3: Settings file not found

**Cause:** Settings file doesn't exist yet

**Solution:**
1. **Run the desktop app once** (it will create the file)
2. **Or create it manually:**
   ```json
   {
     "Company": "Printechs Advanced Printing Trading Co.",
     "ApiEndpointUrl": "http://localhost:3000/api",
     "ErpNextApiUrl": "http://192.168.103.187:88",
     "ApiKey": "",
     "SyncFrequencyMinutes": 15,
     "DefaultPickingWarehouse": "WH-MAIN",
     "DatabaseType": "MySQL",
     "DatabaseHost": "localhost",
     "DatabaseName": "wms_desktop",
     "DatabaseUserName": "root",
     "DatabasePassword": "",
     "DatabasePort": 3306,
     "DatabaseExists": false,
     "TablesExist": false,
     "InventoryTrackingMode": "BinLevel"
   }
   ```

---

## 📝 Quick Reference

### Correct Configuration

```json
{
  "ApiEndpointUrl": "http://localhost:3000/api",        // ✅ WMS API (login)
  "ErpNextApiUrl": "http://192.168.103.187:88",        // ✅ ERPNext (item sync)
  "ApiKey": "your-erpnext-key-if-needed"               // Optional (for item sync)
}
```

### What Each URL is Used For

| Setting | Used For | Example |
|---------|----------|---------|
| `ApiEndpointUrl` | Login, WMS operations | `http://localhost:3000/api` |
| `ErpNextApiUrl` | Item sync from ERPNext | `http://192.168.103.187:88` |
| `ApiKey` | ERPNext authentication | (for item sync only) |

---

## ✅ Summary

**To login after URL change:**

1. ✅ **Set `ApiEndpointUrl`** to your WMS API server:
   - `http://localhost:3000/api` (local)
   - `http://YOUR_IP:3000/api` (network)

2. ✅ **Set `ErpNextApiUrl`** to your ERPNext server:
   - `http://192.168.103.187:88`

3. ✅ **Save settings** (auto-saves in UI, or save file manually)

4. ✅ **Restart desktop app**

5. ✅ **Login should work!**

---

## 🆘 Still Can't Login?

1. **Check WMS API server is running:**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Check error logs:**
   - `ErrorLogs/error_YYYY-MM-DD.log`
   - Look for the URL being used for login

3. **Verify settings file:**
   - Open `wms_settings.json`
   - Check `ApiEndpointUrl` is correct

4. **Try default local URL:**
   ```
   http://localhost:3000/api
   ```
