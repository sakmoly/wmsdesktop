# Fix API Endpoint URL - Transaction History

## 🔍 Problem

The desktop app is trying to connect to:
```
https://erpnext.printechs.example.com/api
```

But your API server is running on:
```
http://localhost:3000
```

## ✅ Solution: Update API Endpoint URL in Settings

### Method 1: Through Settings UI (Recommended)

1. **Open Desktop Application**
2. **Click "Settings"** in the navigation menu (usually in the left sidebar)
3. **Find "API Endpoint URL" field**
4. **Change it from:**
   ```
   https://erpnext.printechs.example.com/api
   ```
   **To:**
   ```
   http://localhost:3000/api
   ```
5. **Click "Save Settings"** (or settings auto-save)
6. **Restart the desktop app** (if needed)

### Method 2: Edit Settings File Directly

1. **Locate settings file:**
   - **Debug build:** `bin/Debug/net8.0-windows/wms_settings.json`
   - **Release build:** `bin/Release/net8.0-windows/wms_settings.json`

2. **Open the file in a text editor**

3. **Find the `ApiEndpointUrl` field and change it:**
   ```json
   {
     "Company": "Printechs Advanced Printing Trading Co.",
     "ApiEndpointUrl": "http://localhost:3000/api",
     "ApiKey": "your-api-key-here",
     ...
   }
   ```

4. **Save the file**

5. **Restart the desktop app**

## 🧪 Verify the Fix

After updating the settings:

1. **Open Transaction History view**
2. **Click "Load All" button**
3. **Check Error Log** - should show:
   ```
   TransactionHistoryService: Calling API: http://localhost:3000/api/transaction-history?limit=10000
   ```
4. **Data should load successfully!**

## 📋 Common API Endpoint URLs

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

## ⚠️ Important Notes

1. **Use `http://` not `https://`** for local development
2. **Include `/api` at the end** of the URL
3. **Make sure API server is running** on port 3000
4. **Restart desktop app** after changing settings

## 🔧 Quick Test

After updating, test the API directly:
```bash
# In browser or Postman
GET http://localhost:3000/api/transaction-history?limit=10
Authorization: Bearer YOUR_API_KEY
```

If this works, the desktop app should work too after updating the settings!
