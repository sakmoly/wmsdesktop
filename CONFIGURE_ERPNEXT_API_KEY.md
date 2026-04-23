# Configure ERPNext API Key - Quick Guide

## 🚨 Issue: ErpNextApiKey is Empty

Your `wms_settings.json` shows:
```json
{
  "ErpNextApiKey": ""  // ❌ EMPTY!
}
```

This causes the code to fall back to using the JWT token (`ApiKey`), which doesn't work for ERPNext authentication.

---

## ✅ Solution: Configure ERPNext API Key

### Step 1: Open Settings in WMS Desktop

1. Launch the WMS Desktop application
2. Navigate to **Settings** view
3. Find the **"ERPNext API Key"** field (it's a password field)

### Step 2: Enter Your ERPNext API Key

1. In the **"ERPNext API Key"** field, enter: `9c9cddef8b35474:8c32cc7ca4afbec`
   - This is the same key you're using in Postman
   - Format: `api-key:api-secret` (with colon)

2. The **"WMS API Key"** field should remain as your JWT token (for WMS API login)

### Step 3: Save Settings

1. Settings are saved automatically when you change them
2. Or click any "Save" button if available

### Step 4: Verify Configuration

After saving, your `wms_settings.json` should have:
```json
{
  "ApiEndpointUrl": "http://192.168.103.219:3000/api",
  "ErpNextApiUrl": "http://192.168.103.187:88",
  "ApiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",  // WMS JWT token
  "ErpNextApiKey": "9c9cddef8b35474:8c32cc7ca4afbec"  // ✅ ERPNext API Key:Secret
}
```

---

## 🧪 Test After Configuration

1. **Rebuild the application** (if you made code changes)
2. **Open Items view**
3. **Click "Test Sync" button**
4. Should now work! ✅

---

## 📝 Alternative: Manual Edit (Not Recommended)

If you can't access the Settings UI, you can manually edit `wms_settings.json`:

**Location:** `bin/Debug/net8.0-windows/wms_settings.json`

**Change:**
```json
"ErpNextApiKey": ""
```

**To:**
```json
"ErpNextApiKey": "9c9cddef8b35474:8c32cc7ca4afbec"
```

**⚠️ Warning:** Manual edits will be overwritten if you change settings in the UI!

---

## ✅ Summary

**Problem:** `ErpNextApiKey` is empty, causing fallback to JWT token
**Solution:** Configure `ErpNextApiKey` in Settings UI with value: `9c9cddef8b35474:8c32cc7ca4afbec`
**Status:** Ready to configure!
