# Configure ERPNext URL for Item Sync

## 🔍 Problem

Items are not fetching (showing 0 items) because the ERPNext URL is not configured correctly.

---

## ✅ Solution: Configure ERPNext URL in Settings

### Step 1: Open Settings

1. **Open the Desktop Application**
2. **Click "Settings"** in the left navigation menu (under "Masters" section)
3. **You should see the Settings tab with various configuration fields**

### Step 2: Configure API Endpoint URL

In the Settings view, find the **"API Endpoint URL"** field and set it to your ERPNext base URL.

#### Correct Format for ERPNext:

The URL should be the **base URL of your ERPNext server**, without the `/api/method/` part.

**Examples:**

✅ **Correct:**
```
http://192.168.103.187:88
```

✅ **Also Correct (with /api):**
```
http://192.168.103.187:88/api
```

❌ **Wrong (WMS API server):**
```
http://localhost:3000/api
```

❌ **Wrong (with full method path):**
```
http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact
```

#### How It Works:

The sync service automatically constructs the full ERPNext API URL from your base URL:

- **If you enter:** `http://192.168.103.187:88`
- **It constructs:** `http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact`

- **If you enter:** `http://192.168.103.187:88/api`
- **It removes `/api` and constructs:** `http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact`

---

## 🔧 Step-by-Step Configuration

### Method 1: Through Settings UI (Recommended)

1. **Open Desktop App**
2. **Navigate to:** Settings (left sidebar → Masters → Settings)
3. **Find:** "API Endpoint URL" field (Row 1, Column 1)
4. **Enter your ERPNext base URL:**
   ```
   http://192.168.103.187:88
   ```
   (Replace with your actual ERPNext server IP and port)
5. **Settings auto-save** (or click "Save Settings" if available)
6. **Try syncing items again**

### Method 2: Edit Settings File Directly

1. **Locate settings file:**
   - **Debug build:** `bin/Debug/net8.0-windows/wms_settings.json`
   - **Release build:** `bin/Release/net8.0-windows/wms_settings.json`

2. **Open the file in a text editor**

3. **Find and update `ApiEndpointUrl`:**
   ```json
   {
     "Company": "Printechs Advanced Printing Trading Co.",
     "ApiEndpointUrl": "http://192.168.103.187:88",
     "ApiKey": "your-erpnext-api-key-here",
     ...
   }
   ```

4. **Save the file**

5. **Restart the desktop app**

6. **Try syncing items again**

---

## 🔑 API Key Configuration

**Important:** You also need a valid ERPNext API Key/Token.

### How to Get ERPNext API Key:

1. **Login to ERPNext** (web interface)
2. **Go to:** User Settings → API Access
3. **Generate API Key** or **API Secret**
4. **Copy the key**

### Configure in Settings:

1. **Open Settings** in desktop app
2. **Find "API Key" field** (currently shows as masked/disabled)
3. **Note:** The API Key field might be read-only in the UI
4. **Edit settings file directly** to set `ApiKey`:
   ```json
   {
     "ApiKey": "your-actual-erpnext-api-key-here"
   }
   ```

---

## 🧪 Verify Configuration

### Check Current Settings:

1. **Open Settings view**
2. **Check "API Endpoint URL"** - should show your ERPNext base URL
3. **Check error logs** after sync attempt:
   - Location: `ErrorLogs/error_YYYY-MM-DD.log`
   - Look for: `ErpNextItemApiService: Fetching items from...`

### Test Sync:

1. **Go to Items view**
2. **Click "Sync Items" button**
3. **Check the result:**
   - ✅ **Success:** Should show items fetched > 0
   - ❌ **Failure:** Check error message and logs

### Check Error Logs:

After a failed sync, check the error log file:
```
ErrorLogs/error_2026-01-26.log
```

Look for messages like:
- `ErpNextItemApiService: Fetching items from http://...`
- `ErpNextItemApiService: HTTP error connecting to ERPNext: ...`
- `ErpNextItemApiService: API returned 401/403/404: ...`

---

## 📋 Common Issues and Solutions

### Issue 1: "Total fetched: 0"

**Possible Causes:**
- ❌ Wrong ERPNext URL
- ❌ Invalid API Key
- ❌ ERPNext server not accessible
- ❌ No items match the filter (`custom_dcs = MENFOTSLP`)

**Solutions:**
1. **Verify ERPNext URL** is correct (see above)
2. **Verify API Key** is valid
3. **Test ERPNext accessibility:**
   ```bash
   # From command prompt
   curl http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact
   ```
4. **Check filter** - ensure items in ERPNext have `custom_dcs = MENFOTSLP`

### Issue 2: "Connection Error" or "Timeout"

**Possible Causes:**
- ❌ ERPNext server is down
- ❌ Network connectivity issues
- ❌ Firewall blocking connection
- ❌ Wrong IP address or port

**Solutions:**
1. **Verify ERPNext is running:**
   - Open ERPNext in web browser
   - Check if it's accessible
2. **Check network:**
   - Ping the ERPNext server: `ping 192.168.103.187`
   - Check if port 88 is open
3. **Check firewall:**
   - Allow port 88 in Windows Firewall
   - Check ERPNext server firewall settings

### Issue 3: "401 Unauthorized" or "403 Forbidden"

**Possible Causes:**
- ❌ Invalid API Key
- ❌ API Key expired
- ❌ API Key doesn't have required permissions

**Solutions:**
1. **Regenerate API Key** in ERPNext
2. **Update API Key** in settings file
3. **Check API Key permissions** in ERPNext

### Issue 4: "404 Not Found"

**Possible Causes:**
- ❌ Wrong API method path
- ❌ ERPNext API method doesn't exist
- ❌ Wrong ERPNext version

**Solutions:**
1. **Verify API method exists:**
   - Check ERPNext custom app: `printechs_wms.api.item.get_items_compact`
   - Ensure it's installed and enabled
2. **Test API method directly:**
   ```bash
   curl -X POST http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"filters":[["custom_dcs","=","MENFOTSLP"]],"fields":["item_code"],"limit":10,"offset":0}'
   ```

---

## 🔍 Debugging Steps

### Step 1: Check Settings File

Open `wms_settings.json` and verify:
```json
{
  "ApiEndpointUrl": "http://192.168.103.187:88",
  "ApiKey": "your-valid-api-key"
}
```

### Step 2: Check Error Logs

After attempting sync, check:
```
ErrorLogs/error_YYYY-MM-DD.log
```

Look for:
- `ErpNextItemApiService: Fetching items from...` (shows constructed URL)
- Any error messages

### Step 3: Test ERPNext API Manually

Use a tool like Postman or curl to test the ERPNext API:

```bash
curl -X POST http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": [["custom_dcs", "=", "MENFOTSLP"]],
    "fields": ["item_code", "item_name"],
    "limit": 10,
    "offset": 0
  }'
```

**Expected Response:**
```json
{
  "message": {
    "data": [
      {
        "item_code": "ITEM-001",
        "item_name": "Item Name"
      }
    ]
  }
}
```

### Step 4: Verify Filter

Ensure items in ERPNext have the correct `custom_dcs` value:

1. **Login to ERPNext**
2. **Open an Item** that should be synced
3. **Check `custom_dcs` field** - should be `MENFOTSLP`
4. **If different**, either:
   - Update items in ERPNext, OR
   - Change filter in code (see below)

---

## 🔧 Change Filter (If Needed)

If your items use a different `custom_dcs` value, you can change the filter:

**File:** `Services/ErpNextItemApiService.cs`

**Find:**
```csharp
var filters = new List<object>
{
    new[] { "custom_dcs", "=", "MENFOTSLP" }
};
```

**Change to:**
```csharp
var filters = new List<object>
{
    new[] { "custom_dcs", "=", "YOUR_VALUE_HERE" }
};
```

---

## ✅ Summary

**To configure ERPNext URL for Item Sync:**

1. ✅ **Open Settings** (left sidebar → Masters → Settings)
2. ✅ **Set "API Endpoint URL"** to: `http://YOUR_ERPNEXT_IP:PORT`
   - Example: `http://192.168.103.187:88`
3. ✅ **Set "API Key"** in settings file to your ERPNext API key
4. ✅ **Save settings**
5. ✅ **Try syncing items again**

**Settings File Location:**
- `bin/Debug/net8.0-windows/wms_settings.json`
- `bin/Release/net8.0-windows/wms_settings.json`

---

## 📞 Still Having Issues?

1. **Check error logs:** `ErrorLogs/error_YYYY-MM-DD.log`
2. **Verify ERPNext is accessible** from your machine
3. **Test ERPNext API manually** using curl/Postman
4. **Verify API Key** is valid and has permissions
5. **Check filter** matches your ERPNext items
