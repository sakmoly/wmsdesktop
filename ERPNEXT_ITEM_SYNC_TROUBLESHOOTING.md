# ERPNext Item Sync Troubleshooting Guide

## 🔍 Current Configuration Check

Your current settings:
```json
{
  "ApiEndpointUrl": "http://192.168.103.219:3000/api",  // ✅ WMS API (correct)
  "ErpNextApiUrl": "http://192.168.103.187:88",        // ✅ ERPNext (correct)
  "ApiKey": "9c9cddef8b35474:8c32cc7ca4afbec"          // ✅ API Key:Secret format (correct)
}
```

**Configuration looks correct!** ✅

---

## 🔧 Fixed: ERPNext Authentication Format

**Issue Found:** ERPNext uses `token` authentication (not `Bearer`) for API Key:Secret format.

**Fixed:** Updated `ErpNextItemApiService.cs` to use correct authentication:
- **Before:** `Authorization: Bearer api-key:api-secret` ❌
- **After:** `Authorization: token api-key:api-secret` ✅

---

## 🧪 Diagnostic Steps

### Step 1: Check Error Logs

After attempting sync, check the error log:
- **Location:** `ErrorLogs/error_YYYY-MM-DD.log`
- **Look for:**
  - `ErpNextItemApiService: Fetching items from...` (shows the URL being called)
  - `ErpNextItemApiService: API returned...` (shows HTTP status and error)
  - `ErpNextItemApiService: HTTP error...` (shows connection errors)

### Step 2: Test ERPNext API Manually

Test the ERPNext API endpoint directly:

```bash
curl -X POST "http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact" \
  -H "Authorization: token 9c9cddef8b35474:8c32cc7ca4afbec" \
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

**If you get an error:**
- **401 Unauthorized:** API key/secret is invalid
- **404 Not Found:** API method doesn't exist
- **403 Forbidden:** API key doesn't have permissions
- **Connection error:** ERPNext server not accessible

### Step 3: Verify API Method Exists

Check if the ERPNext API method exists:
- **Method:** `printechs_wms.api.item.get_items_compact`
- **Location:** ERPNext custom app
- **Verify:** Login to ERPNext → Check if custom app is installed

### Step 4: Verify Filter Matches Items

Check if items in ERPNext have `custom_dcs = MENFOTSLP`:

**In ERPNext:**
1. Open an Item
2. Check `custom_dcs` field
3. Should be `MENFOTSLP` (or whatever filter value you're using)

**If no items match the filter:**
- Either update the filter in code, OR
- Update items in ERPNext to have the correct `custom_dcs` value

---

## ⚠️ Common Issues and Solutions

### Issue 1: "401 Unauthorized"

**Cause:** Invalid API key/secret or wrong authentication format

**Solution:**
1. **Verify API key format:**
   - Should be: `api-key:api-secret`
   - Your format: `9c9cddef8b35474:8c32cc7ca4afbec` ✅ (looks correct)

2. **Regenerate API key in ERPNext:**
   - Login to ERPNext
   - Go to User Settings → API Access
   - Generate new API Key and Secret
   - Update in settings: `"ApiKey": "new-key:new-secret"`

3. **Verify authentication header:**
   - Should be: `Authorization: token api-key:api-secret`
   - Fixed in code ✅

### Issue 2: "404 Not Found"

**Cause:** API method doesn't exist or wrong endpoint

**Solution:**
1. **Verify API method exists:**
   - Check ERPNext custom app: `printechs_wms`
   - Verify method: `printechs_wms.api.item.get_items_compact`
   - Ensure custom app is installed and enabled

2. **Test endpoint manually** (see Step 2 above)

3. **Check ERPNext version compatibility**

### Issue 3: "403 Forbidden"

**Cause:** API key doesn't have required permissions

**Solution:**
1. **Check user permissions in ERPNext:**
   - The user who generated the API key must have:
     - Read access to Item doctype
     - Access to custom API method

2. **Regenerate API key with a user that has proper permissions**

### Issue 4: "Connection Error" or "Timeout"

**Cause:** ERPNext server not accessible

**Solution:**
1. **Test connectivity:**
   ```bash
   ping 192.168.103.187
   curl http://192.168.103.187:88
   ```

2. **Check firewall:**
   - Ensure port 88 is open
   - Check ERPNext server firewall settings

3. **Verify ERPNext is running:**
   - Check ERPNext server status
   - Try accessing ERPNext web interface

### Issue 5: "Total fetched: 0" (No Items)

**Cause:** Filter doesn't match any items

**Solution:**
1. **Check filter value:**
   - Current filter: `custom_dcs = MENFOTSLP`
   - Verify items in ERPNext have this value

2. **Test without filter:**
   - Temporarily remove filter in code to see if items exist
   - Or change filter to match your items

3. **Check field name:**
   - Verify field is `custom_dcs` (not `custom_dc` or other name)

---

## 🔍 Debug Checklist

Before reporting an issue, check:

- [ ] **ERPNext URL is correct:** `http://192.168.103.187:88`
- [ ] **API Key format is correct:** `api-key:api-secret` (with colon)
- [ ] **API method exists:** `printechs_wms.api.item.get_items_compact`
- [ ] **ERPNext server is accessible:** Can ping/curl the server
- [ ] **API key is valid:** Test manually with curl
- [ ] **Filter matches items:** Items have `custom_dcs = MENFOTSLP`
- [ ] **Error logs checked:** See actual error message
- [ ] **Database connection works:** Can connect to local MySQL

---

## 🧪 Test Script

Use this PowerShell script to test the ERPNext API:

```powershell
$erpNextUrl = "http://192.168.103.187:88"
$apiKey = "9c9cddef8b35474:8c32cc7ca4afbec"
$apiMethod = "printechs_wms.api.item.get_items_compact"

$body = @{
    filters = @(
        @("custom_dcs", "=", "MENFOTSLP")
    )
    fields = @("item_code", "item_name", "item_group","barcode")
    limit = 10
    offset = 0
} | ConvertTo-Json

$headers = @{
    "Authorization" = "token $apiKey"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "$erpNextUrl/api/method/$apiMethod" `
        -Method Post `
        -Headers $headers `
        -Body $body
    
    Write-Host "✅ Success! Items found: $($response.message.data.Count)"
    $response.message.data | ForEach-Object {
        Write-Host "  - $($_.item_code): $($_.item_name)"
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)"
}
```

---

## ✅ Summary

**Your Configuration:**
- ✅ WMS API URL: `http://192.168.103.219:3000/api` (correct)
- ✅ ERPNext URL: `http://192.168.103.187:88` (correct)
- ✅ API Key: `9c9cddef8b35474:8c32cc7ca4afbec` (correct format)

**Fixed:**
- ✅ Authentication changed from `Bearer` to `token` format

**Next Steps:**
1. **Rebuild the application** (to apply the authentication fix)
2. **Try syncing items again**
3. **Check error logs** if it still fails
4. **Test ERPNext API manually** with curl/PowerShell script above

---

## 📞 Still Not Working?

1. **Check error logs** - `ErrorLogs/error_YYYY-MM-DD.log`
2. **Test ERPNext API manually** - Use the PowerShell script above
3. **Verify API method exists** - Check ERPNext custom app
4. **Check filter matches items** - Verify `custom_dcs` field values
5. **Test with different filter** - Try without filter or different value

---

## 📦 Mobile: "No cartons found" / "GET /api/asn/{asn_no} not implemented (404)"

This message appears when the **mobile app** gets a **404** for `GET /api/asn/{asn_no}`. The endpoint **is implemented** in **wms-api** (see `wms-api/src/routes/index.js` and `masterController.getAsnByNumber`). Past logs show it working (e.g. `GET /api/asn/ASN-0003`, `ASN-365425486`).

### Why you might see 404

1. **Wrong API base URL (most likely)**  
   The mobile must call **wms-api**, not ERPNext.  
   - ✅ Correct: `http://<wms-api-host>:3000` (e.g. `http://192.168.103.219:3000`)  
   - ❌ Wrong: ERPNext URL (e.g. `http://...:88`) — that server does not have `/api/asn/:asn_no`, so you get 404.

2. **wms-api not running or not reachable**  
   Ensure wms-api is running on the host/port the mobile uses and that the device can reach it (same network, no firewall blocking).

3. **ASN not in database**  
   If the backend is hit but ASN doesn’t exist, wms-api returns 404 with `{"code":"NOT_FOUND","message":"ASN ASN-0007 not found"}`. The app may still show "endpoint not implemented" when it sees any 404.

### What to do

1. **Confirm mobile API base URL**  
   In the mobile app config, the base URL must be the **wms-api** root (e.g. `http://192.168.103.219:3000`), so that `GET /api/asn/ASN-0007` becomes `http://192.168.103.219:3000/api/asn/ASN-0007`.

2. **Test the endpoint directly**  
   From a machine that can reach wms-api (browser, Postman, or curl):
   ```bash
   curl -H "Authorization: Bearer <token>" "http://192.168.103.219:3000/api/asn/ASN-0007"
   ```
   - **200** + JSON → endpoint works; then check mobile URL and auth.  
   - **404** → either wms-api isn’t the one being called, or that ASN doesn’t exist in the DB.

3. **Check wms-api logs**  
   When you tap Start Inbound for ASN-0007, see if wms-api logs a request like `GET /api/asn/ASN-0007`.  
   - If **yes** and response is 404 → ASN-0007 not in DB (or wrong DB).  
   - If **no** → request is going to another server (wrong base URL).
