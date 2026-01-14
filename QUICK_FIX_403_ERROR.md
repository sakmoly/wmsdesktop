# Quick Fix for 403 Forbidden Error

## 🔍 Problem

You're getting **403 Forbidden** because the API key is still the placeholder:
```
"ApiKey": "******-MOCK-KEY-ONLY-******"
```

## ✅ Quick Solution: Use PowerShell Script

I've created a script that will:
1. Login to get a token
2. Test the token
3. Update your settings file automatically

### Step 1: Run the Script

Open PowerShell in the project directory and run:

```powershell
.\SCRIPTS\GetApiToken.ps1 -UserCode "USER-172188" -Password "password123"
```

*(Replace `USER-172188` and `password123` with your actual credentials)*

The script will:
- ✅ Login to get token
- ✅ Test the token
- ✅ Update `bin/Debug/net8.0-windows/wms_settings.json`
- ✅ Update `bin/Release/net8.0-windows/wms_settings.json` (if exists)

### Step 2: Restart Desktop App

1. **Close the desktop app completely**
2. **Reopen the desktop app**
3. **Open Transaction History view**
4. **Click "Load All" button**
5. **Data should appear!** ✅

## 🔧 Manual Method (If Script Doesn't Work)

### Step 1: Get Token via Postman

1. **Open Postman**
2. **POST** `http://localhost:3000/api/auth/login`
3. **Body:**
   ```json
   {
     "user_code": "USER-172188",
     "password": "password123"
   }
   ```
4. **Copy the `access_token` from response**

### Step 2: Update Settings File

1. **Open:** `bin/Debug/net8.0-windows/wms_settings.json`
2. **Find:** `"ApiKey": "******-MOCK-KEY-ONLY-******"`
3. **Replace with:** `"ApiKey": "YOUR_TOKEN_HERE"`
4. **Save file**

### Step 3: Restart App

Close and reopen the desktop app.

## 🧪 Verify Token Works

Test the token before updating settings:

```bash
curl -X GET "http://localhost:3000/api/transaction-history?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

If you get data (or an empty array), the token is valid! ✅

## ⚠️ Important Notes

1. **Token Expires:** Tokens expire in 7 days
2. **If Token Expires:** Run the script again to get a new token
3. **Keep Token Secure:** Don't share your token publicly

## 📋 What the Script Does

1. **Logs in** to `http://localhost:3000/api/auth/login`
2. **Gets the token** from the response
3. **Tests the token** by calling the API
4. **Updates settings files** with the new token
5. **Shows success message** with next steps

## 🔍 Troubleshooting

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

### If Still Getting 403:

1. **Verify token was updated** - Check settings file
2. **Restart app** - Settings are loaded on startup
3. **Check token hasn't expired** - Run script again if needed
