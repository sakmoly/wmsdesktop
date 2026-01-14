# Update API Token - Fix 403 Forbidden

## 🔍 Problem

The API works when tested directly, but the desktop app gets:
```
{"code":"FORBIDDEN","message":"Invalid or expired token"}
```

This means the token in your settings file is **invalid or expired**.

## ✅ Quick Fix

### Option 1: Use PowerShell Script (Easiest)

Run this command in PowerShell:

```powershell
.\SCRIPTS\GetApiToken.ps1 -UserCode "USER-172188" -Password "password123"
```

*(Replace with your actual credentials)*

The script will:
1. ✅ Login to get a fresh token
2. ✅ Test the token
3. ✅ Update `bin/Debug/net8.0-windows/wms_settings.json` automatically
4. ✅ Update `bin/Release/net8.0-windows/wms_settings.json` (if exists)

### Option 2: Manual Update

**Step 1: Get Token via Postman**

1. **POST** `http://localhost:3000/api/auth/login`
2. **Body:**
   ```json
   {
     "user_code": "USER-172188",
     "password": "password123"
   }
   ```
3. **Copy the `access_token`** from response

**Step 2: Update Settings File**

1. **Open:** `bin/Debug/net8.0-windows/wms_settings.json`
2. **Find:** `"ApiKey": "******-MOCK-KEY-ONLY-******"` (or your old token)
3. **Replace with:** `"ApiKey": "YOUR_NEW_TOKEN_HERE"`
4. **Save file**

**Step 3: Restart Desktop App**

1. **Close the app completely**
2. **Reopen the app**
3. **Open Transaction History**
4. **Click "Load All"**
5. **Data should appear!** ✅

## 🧪 Verify Token Works

Before updating settings, test the token:

```bash
curl -X GET "http://localhost:3000/api/transaction-history?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

If you get data back (or empty array), the token is valid! ✅

## 📋 What Token Looks Like

A valid token is a long string like:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJVU0VSLTE3MjE4OCIsImlhdCI6MTczNTA0ODQ4NCwiZXhwIjoxNzM1MDUyMDg0fQ.xxxxxxxxxxxxx
```

It's usually 200+ characters long.

## ⚠️ Important

1. **Token Expires:** Tokens expire in 7 days
2. **If Token Expires:** Run the script again or login again
3. **Keep Token Secure:** Don't share your token

## 🔧 Troubleshooting

### If Script Fails:

1. **Check API server is running:**
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **Check user exists:**
   ```sql
   SELECT user_code, name, active FROM tabUser WHERE user_code = 'USER-172188';
   ```

3. **Create test user (if needed):**
   ```sql
   INSERT INTO tabUser (user_code, name, password_hash, role, active)
   VALUES ('USER-172188', 'Test User', NULL, 'operator', 1);
   ```
   *(For development, NULL password_hash accepts any password)*

### If Still Getting 403:

1. **Verify token was updated** - Check settings file has new token
2. **Restart app** - Settings are loaded on startup
3. **Check token format** - Should be a long JWT string
4. **Try getting a new token** - Old token might be expired
