# Authentication Token Fix - 403 Forbidden Error

**Date**: 2026-01-21  
**Status**: ✅ **FIXED** - Token validation added

---

## 🔍 Problem

The desktop app is getting **403 Forbidden** errors:
```
{"code":"FORBIDDEN","message":"Invalid or expired token"}
```

**Root Cause**: The API token in `wms_settings.json` is either:
- Missing/empty
- Invalid/expired
- A placeholder value (e.g., `"******-MOCK-KEY-ONLY-******"`)

---

## ✅ Fixes Applied

### 1. Added Token Validation

**Files Modified:**
- `Services/TransactionHistoryService.cs`
- `Services/ItemLocationStockService.cs`

**Changes:**
- Added validation to check if API key is missing or a placeholder before making requests
- Throws `InvalidOperationException` with clear message if token is invalid

```csharp
// Validate API key before making request
if (string.IsNullOrWhiteSpace(settings.ApiKey) || 
    settings.ApiKey.Contains("MOCK-KEY") || 
    settings.ApiKey.Contains("******"))
{
    ErrorLogService.LogError("Invalid API key in settings. Please login to get a valid token.");
    throw new InvalidOperationException("API key is missing or invalid. Please login to get a valid token.");
}
```

### 2. Enhanced Error Messages

Added detailed error messages for 403 Forbidden responses:
- Clear instructions on how to fix the issue
- References to the PowerShell script for getting a new token
- Instructions for manual token update

---

## 🔧 How to Fix the Token Issue

### Option 1: Use PowerShell Script (Recommended)

1. **Open PowerShell** in the project directory
2. **Run the script:**
   ```powershell
   .\SCRIPTS\GetApiToken.ps1 -UserCode "USER-402498" -Password "your_password"
   ```
   *(Replace with your actual user code and password)*

3. **The script will:**
   - ✅ Login to get a fresh token
   - ✅ Test the token
   - ✅ Update `bin/Debug/net8.0-windows/wms_settings.json` automatically
   - ✅ Update `bin/Release/net8.0-windows/wms_settings.json` (if exists)

4. **Restart the desktop app**

### Option 2: Manual Update via Postman

1. **POST** `http://localhost:3000/api/auth/login`
2. **Body:**
   ```json
   {
     "user_code": "USER-402498",
     "password": "your_password"
   }
   ```
3. **Copy the `access_token`** from response
4. **Open:** `bin/Debug/net8.0-windows/wms_settings.json`
5. **Replace:** `"ApiKey": "YOUR_OLD_TOKEN"` with `"ApiKey": "YOUR_NEW_TOKEN"`
6. **Save file**
7. **Restart desktop app**

### Option 3: Manual Update via cURL

```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "user_code": "USER-402498",
    "password": "your_password"
  }'
```

Copy the `access_token` from response and update `wms_settings.json`.

---

## 🧪 Verify Token Works

Before updating settings, test the token:

```bash
curl -X GET "http://localhost:3000/api/transaction-history?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

If you get data back (or empty array), the token is valid! ✅

---

## 📋 Token Format

A valid token is a long JWT string like:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJVU0VSLTQwMjQ5OCIsImlhdCI6MTczNTA0ODQ4NCwiZXhwIjoxNzM1MDUyMDg0fQ.xxxxxxxxxxxxx
```

It's usually 200+ characters long and has three parts separated by dots.

---

## ⚠️ Important Notes

1. **Token Expires**: Tokens expire in 7 days
2. **If Token Expires**: Run the PowerShell script again to get a new token
3. **Settings Location**: 
   - Debug: `bin/Debug/net8.0-windows/wms_settings.json`
   - Release: `bin/Release/net8.0-windows/wms_settings.json`
4. **After Updating**: Always restart the desktop app completely

---

## ✅ Verification

After updating the token:

1. **Restart desktop app**
2. **Open Transaction History view**
3. **Click "Load All" button**
4. **Check error logs** - should see successful API calls
5. **Data should appear!** ✅

---

## 📝 Summary

- **Issue**: 403 Forbidden due to invalid/expired API token
- **Fix**: Added token validation and enhanced error messages
- **Action Required**: Get a new token using PowerShell script or Postman
- **Next Steps**: Update `wms_settings.json` and restart desktop app

The desktop app will now provide clearer error messages when the token is invalid, making it easier to diagnose and fix authentication issues.
