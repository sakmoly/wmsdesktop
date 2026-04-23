# Fix Login Error - ERPNext URL Conflict

## 🔍 Problem

You're getting a **404 NotFound** error when trying to login:

```
[2026-01-27 15:17:44] INFO: AuthService: Attempting login to http://192.168.103.187:88/api/auth/login for user sysadmin
[2026-01-27 15:17:44] INFO: AuthService: Login response status: NotFound
[2026-01-27 15:17:44] ERROR: AuthService: Login failed with status NotFound: {"exc_type":"DoesNotExistError"}
```

**Root Cause:** The `ApiEndpointUrl` setting is being used for **both**:
1. **WMS API Server** (for login and other WMS operations)
2. **ERPNext Server** (for item sync)

You've set it to ERPNext URL (`http://192.168.103.187:88`), so the login is trying to authenticate against ERPNext instead of the WMS API server.

---

## ✅ Solution: Separate URLs

I've added a **separate `ErpNextApiUrl` setting** so you can configure both URLs independently.

### Step 1: Configure Settings

1. **Open Settings** in the desktop app
2. **Set "WMS API Endpoint URL"** to your WMS API server:
   ```
   http://localhost:3000/api
   ```
   or
   ```
   http://192.168.103.219:3000/api
   ```
   (Your actual WMS API server URL)

3. **Set "ERPNext API URL"** to your ERPNext server:
   ```
   http://192.168.103.187:88
   ```
   (Your ERPNext server base URL)

4. **Set "API Key"** to your ERPNext API key (for item sync)

5. **Settings auto-save**

### Step 2: Verify Configuration

**WMS API Endpoint URL:**
- Used for: Login, authentication, WMS operations
- Example: `http://localhost:3000/api` or `http://192.168.103.219:3000/api`

**ERPNext API URL:**
- Used for: Item sync from ERPNext
- Example: `http://192.168.103.187:88`

**API Key:**
- Used for: ERPNext authentication (for item sync)

---

## 🔧 Manual Configuration (Settings File)

If you prefer to edit the settings file directly:

1. **Open:** `bin/Debug/net8.0-windows/wms_settings.json`

2. **Update the settings:**
   ```json
   {
     "Company": "Printechs Advanced Printing Trading Co.",
     "ApiEndpointUrl": "http://localhost:3000/api",
     "ErpNextApiUrl": "http://192.168.103.187:88",
     "ApiKey": "your-erpnext-api-key-here",
     ...
   }
   ```

3. **Save the file**

4. **Restart the desktop app**

---

## 📋 URL Configuration Guide

### WMS API Endpoint URL

**Purpose:** WMS API server for login and WMS operations

**Format:**
- `http://localhost:3000/api` (local development)
- `http://192.168.103.219:3000/api` (network access)

**Used by:**
- `AuthService` - Login
- `TransactionHistoryService` - Transaction history
- `PutawayApiService` - Putaway operations
- Other WMS API services

### ERPNext API URL

**Purpose:** ERPNext server for item sync

**Format:**
- `http://192.168.103.187:88` (ERPNext base URL)
- `http://192.168.103.187:88/api` (also works, will be normalized)

**Used by:**
- `ErpNextItemApiService` - Item sync from ERPNext

**Note:** The service automatically constructs the full API URL:
- Input: `http://192.168.103.187:88`
- Constructed: `http://192.168.103.187:88/api/method/printechs_wms.api.item.get_items_compact`

---

## 🧪 Test Login

After configuring:

1. **Close and restart the desktop app**
2. **Try to login**
3. **Check error logs** - should show:
   ```
   AuthService: Attempting login to http://localhost:3000/api/auth/login
   ```
   (or your WMS API server URL, NOT ERPNext URL)

4. **Login should succeed!**

---

## ⚠️ Backward Compatibility

If `ErpNextApiUrl` is not set, the item sync service will fall back to using `ApiEndpointUrl` for backward compatibility. However, **it's recommended to set both URLs separately** to avoid confusion.

---

## ✅ Summary

**Before (Problem):**
- `ApiEndpointUrl` = `http://192.168.103.187:88` (ERPNext)
- Login tries: `http://192.168.103.187:88/api/auth/login` ❌ (doesn't exist on ERPNext)

**After (Fixed):**
- `ApiEndpointUrl` = `http://localhost:3000/api` (WMS API)
- `ErpNextApiUrl` = `http://192.168.103.187:88` (ERPNext)
- Login tries: `http://localhost:3000/api/auth/login` ✅ (correct WMS API)
- Item sync uses: `http://192.168.103.187:88` ✅ (correct ERPNext)

---

## 📞 Still Having Issues?

1. **Verify WMS API server is running:**
   ```bash
   curl http://localhost:3000/health
   ```

2. **Check error logs** for the actual URL being used

3. **Verify both URLs are set correctly** in Settings

4. **Restart the desktop app** after changing settings
