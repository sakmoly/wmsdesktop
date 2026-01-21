# Quick Token Update - Fix 403 Forbidden

## 🔍 Current Issue

Your API token has **expired**. The token in `wms_settings.json` is for user `sysadmin` and is no longer valid.

## ✅ Quick Fix - Get New Token

### Option 1: PowerShell Script (Easiest)

**Run this command in PowerShell:**

```powershell
.\SCRIPTS\GetApiToken.ps1 -UserCode "sysadmin" -Password "your_password_here"
```

*(Replace `your_password_here` with the actual password for sysadmin)*

The script will:
1. ✅ Login to get a fresh token
2. ✅ Test the token
3. ✅ Update `bin/Debug/net8.0-windows/wms_settings.json` automatically
4. ✅ Update `bin/Release/net8.0-windows/wms_settings.json` (if exists)

### Option 2: Postman (Manual)

1. **Open Postman**
2. **POST** `http://localhost:3000/api/auth/login`
3. **Headers:** `Content-Type: application/json`
4. **Body (raw JSON):**
   ```json
   {
     "user_code": "sysadmin",
     "password": "your_password_here"
   }
   ```
5. **Send request**
6. **Copy the `access_token`** from response:
   ```json
   {
     "success": true,
     "data": {
       "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       ...
     }
   }
   ```
7. **Open:** `bin/Debug/net8.0-windows/wms_settings.json`
8. **Replace:** `"ApiKey": "old_token"` with `"ApiKey": "new_token"`
9. **Save file**

### Option 3: cURL (Command Line)

```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"user_code\": \"sysadmin\", \"password\": \"your_password_here\"}"
```

Copy the `access_token` from response and update `wms_settings.json`.

## 🔄 After Updating Token

1. **Close the desktop app completely** (if running)
2. **Reopen the desktop app**
3. **Open Transaction History view**
4. **Click "Load All" button**
5. **Data should appear!** ✅

## ⚠️ Important

- **Token expires in 7 days** - you'll need to update it again
- **Settings file location:** `bin/Debug/net8.0-windows/wms_settings.json`
- **Always restart the app** after updating the token

## 🧪 Verify Token Works

Test the token before updating settings:

```bash
curl -X GET "http://localhost:3000/api/transaction-history?limit=10" \
  -H "Authorization: Bearer YOUR_NEW_TOKEN_HERE"
```

If you get data back (or empty array), the token is valid! ✅
