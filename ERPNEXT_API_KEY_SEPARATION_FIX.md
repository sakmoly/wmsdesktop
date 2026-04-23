# ERPNext API Key Separation Fix

## 🔍 Issue Found

**Error:** `401 Unauthorized` when syncing items from ERPNext

**Root Cause:** The `ApiKey` field in settings was being used for both:
- **WMS API**: JWT token (format: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)
- **ERPNext API**: API Key:Secret (format: `api-key:api-secret`)

These are **completely different** authentication methods and cannot be shared!

---

## ✅ Fix Applied

### 1. Added Separate Field for ERPNext API Key

**Added to `WmsSettings.cs`:**
```csharp
public string ErpNextApiKey { get; set; } = string.Empty;
```

### 2. Updated Settings Service

**Updated `SettingsService.cs`:**
- Added `ErpNextApiKey` to `WmsSettingsDto`
- Updated `LoadSettings()` to load `ErpNextApiKey`
- Updated `SaveSettings()` to save `ErpNextApiKey`

### 3. Updated ERPNext API Service

**Updated `ErpNextItemApiService.cs`:**
- Changed from using `settings.ApiKey` to `settings.ErpNextApiKey`
- Falls back to `settings.ApiKey` for backward compatibility

```csharp
// Use ErpNextApiKey (separate from WMS API key which is a JWT token)
var erpNextApiKey = !string.IsNullOrWhiteSpace(settings.ErpNextApiKey)
    ? settings.ErpNextApiKey
    : settings.ApiKey; // Fallback for backward compatibility
```

### 4. Added UI Field

**Updated `SettingsView.xaml` and `SettingsView.xaml.cs`:**
- Added "ERPNext API Key" password field
- Renamed "API Key" to "WMS API Key" for clarity
- Added handler for `ErpNextApiKeyPasswordBox`

---

## 📝 Configuration Steps

### Step 1: Open Settings

1. Open the WMS Desktop application
2. Go to **Settings** view

### Step 2: Configure ERPNext API Key

1. Find the **"ERPNext API Key"** field (new field)
2. Enter your ERPNext API key in format: `api-key:api-secret`
   - Example: `9c9cddef8b35474:8c32cc7ca4afbec`
3. The **"WMS API Key"** field should contain your JWT token (for WMS API login)

### Step 3: Verify Configuration

Your `wms_settings.json` should now have:
```json
{
  "ApiEndpointUrl": "http://192.168.103.219:3000/api",
  "ErpNextApiUrl": "http://192.168.103.187:88",
  "ApiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // WMS API JWT token
  "ErpNextApiKey": "9c9cddef8b35474:8c32cc7ca4afbec"  // ERPNext API Key:Secret
}
```

---

## 🧪 Testing

### Test 1: Use "Test Sync" Button

1. Open **Items** view
2. Click **"Test Sync"** button
3. Review test results:
   - ✅ Check Settings
   - ✅ Test API Call
   - ✅ Validate Items
   - ✅ Test Database Connection
   - ✅ Test Sync Process

### Test 2: Manual Sync

1. Open **Items** view
2. Click **"Sync Items"** button
3. Should now work without 401 errors!

---

## 🔑 Getting ERPNext API Key

If you don't have an ERPNext API key:

1. **Login to ERPNext** web interface
2. Go to **User Settings** → **API Access**
3. **Generate** new API Key and Secret
4. Format: `api-key:api-secret` (with colon)
5. Copy and paste into **"ERPNext API Key"** field in Settings

---

## ✅ Summary

**Problem:** Single `ApiKey` field used for two different authentication systems
**Solution:** Separated into `ApiKey` (WMS JWT) and `ErpNextApiKey` (ERPNext Key:Secret)
**Status:** ✅ Fixed - Ready to test!

**Next Steps:**
1. Rebuild the application
2. Configure ERPNext API Key in Settings
3. Test sync using "Test Sync" button
4. If successful, use "Sync Items" to sync items
