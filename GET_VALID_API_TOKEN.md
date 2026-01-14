# Get Valid API Token - Fix 403 Forbidden Error

## 🔍 Problem

You're getting **403 Forbidden** because the API key in settings is a placeholder:
```
"ApiKey": "******-MOCK-KEY-ONLY-******"
```

## ✅ Solution: Get a Valid Token

### Step 1: Login to Get Token

**Option A: Using Postman**

1. **Open Postman**
2. **Create new POST request:**
   - URL: `http://localhost:3000/api/auth/login`
   - Method: `POST`
   - Headers: `Content-Type: application/json`
   - Body (raw JSON):
   ```json
   {
     "user_code": "USER-172188",
     "password": "password123"
   }
   ```
   *(Replace with your actual user_code and password)*

3. **Send request**
4. **Copy the `access_token` from response:**
   ```json
   {
     "success": true,
     "data": {
       "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       ...
     }
   }
   ```

**Option B: Using cURL**

```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "user_code": "USER-172188",
    "password": "password123"
  }'
```

Copy the `access_token` from the response.

### Step 2: Update Settings File

1. **Open:** `bin/Debug/net8.0-windows/wms_settings.json`

2. **Replace the ApiKey value:**
   ```json
   {
     "Company": "Printechs Advanced Printing Trading Co.",
     "ApiEndpointUrl": "http://localhost:3000/api",
     "ApiKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     ...
   }
   ```
   *(Paste your actual token here)*

3. **Save the file**

4. **Also update Release build:**
   - `bin/Release/net8.0-windows/wms_settings.json`

### Step 3: Restart Desktop App

1. **Close the desktop app completely**
2. **Reopen the desktop app**
3. **Open Transaction History view**
4. **Click "Load All" button**
5. **Data should load successfully!**

## 🧪 Verify Token Works

Before updating settings, test the token:

```bash
curl -X GET "http://localhost:3000/api/transaction-history?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

If you get data back, the token is valid! ✅

## 📋 Quick Reference

**Login Endpoint:**
```
POST http://localhost:3000/api/auth/login
```

**Request Body:**
```json
{
  "user_code": "YOUR_USER_CODE",
  "password": "YOUR_PASSWORD"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "YOUR_TOKEN_HERE",
    "expires_in": 604800,
    "user": { ... }
  }
}
```

**Settings File Location:**
- Debug: `bin/Debug/net8.0-windows/wms_settings.json`
- Release: `bin/Release/net8.0-windows/wms_settings.json`

## ⚠️ Important Notes

1. **Token Expires:** Tokens expire in 7 days (604800 seconds)
2. **If Token Expires:** Login again to get a new token
3. **Keep Token Secure:** Don't share your token publicly
4. **Use Same Token:** Use the same token for all API calls until it expires

## 🔧 Troubleshooting

### If Login Fails:

1. **Check if user exists in database:**
   ```sql
   SELECT user_code, name, active FROM tabUser WHERE user_code = 'USER-172188';
   ```

2. **Create test user (if needed):**
   ```sql
   INSERT INTO tabUser (user_code, name, password_hash, role, active)
   VALUES ('USER-172188', 'Test User', NULL, 'operator', 1);
   ```
   *(For development, NULL password_hash accepts any password)*

3. **Verify API server is running:**
   ```bash
   curl http://localhost:3000/api/health
   ```

### If Still Getting 403:

1. **Verify token is correct** - Copy the full token (it's long!)
2. **Check token hasn't expired** - Login again if needed
3. **Verify Authorization header format** - Should be `Bearer {token}`
