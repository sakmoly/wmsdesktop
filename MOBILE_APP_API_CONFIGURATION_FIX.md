# Mobile App API Configuration Fix

## ✅ Server Status
- Health endpoint working: `http://192.168.103.219:3000/health` ✅
- Login endpoint exists: `POST /api/auth/login` ✅
- Server accessible from network ✅

## 🔍 Issue: Mobile App Cannot Connect

Since the health endpoint works from mobile browser, the issue is **mobile app configuration**.

---

## 📱 Mobile App API Configuration

### Correct Configuration:

**API Base URL:**
```
http://192.168.103.219:3000
```

**Login Endpoint (Full URL):**
```
POST http://192.168.103.219:3000/api/auth/login
```

**Request Body:**
```json
{
  "user_code": "USER-172188",
  "password": "password123"
}
```

**Headers:**
```
Content-Type: application/json
```

---

## ❌ Common Mistakes in Mobile App

### Mistake 1: Wrong Base URL Format
- ❌ `http://192.168.103.219:3000/api` (desktop app uses this)
- ❌ `http://192.168.103.219:3000/`
- ❌ `https://192.168.103.219:3000` (unless using SSL)
- ✅ `http://192.168.103.219:3000` (correct)

### Mistake 2: Wrong Login Endpoint
- ❌ `POST http://192.168.103.219:3000/login`
- ❌ `POST http://192.168.103.219:3000/auth/login`
- ✅ `POST http://192.168.103.219:3000/api/auth/login` (correct)

### Mistake 3: Wrong Request Format
- ❌ `{ "username": "...", "password": "..." }` (wrong field name)
- ✅ `{ "user_code": "...", "password": "..." }` (correct)

### Mistake 4: Missing Headers
- ❌ No `Content-Type: application/json` header
- ✅ Must include `Content-Type: application/json`

---

## 🧪 Test Login Endpoint from Mobile Browser

1. **Install a REST client app** on your mobile device (e.g., "REST Client", "Postman", "HTTP & REST Client")

2. **Test Login:**
   - Method: `POST`
   - URL: `http://192.168.103.219:3000/api/auth/login`
   - Headers: `Content-Type: application/json`
   - Body:
     ```json
     {
       "user_code": "USER-172188",
       "password": "password123"
     }
     ```

3. **Expected Response:**
   ```json
   {
     "success": true,
     "data": {
       "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
       "expires_in": 604800,
       "user": {
         "user_code": "USER-172188",
         "name": "John Doe"
       }
     }
   }
   ```

If this works from mobile browser → Mobile app configuration issue  
If this fails → Check server logs for errors

---

## 🔧 Mobile App Configuration Checklist

### 1. API Base URL
- [ ] Base URL is: `http://192.168.103.219:3000`
- [ ] No trailing slash
- [ ] No `/api` suffix
- [ ] Using `http://` not `https://`

### 2. Login Endpoint
- [ ] Full URL: `http://192.168.103.219:3000/api/auth/login`
- [ ] Method: `POST`
- [ ] Headers include: `Content-Type: application/json`

### 3. Request Body
- [ ] Using `user_code` (not `username`)
- [ ] Using `password` field
- [ ] JSON format is correct

### 4. Error Handling
- [ ] App handles connection errors
- [ ] App shows proper error messages
- [ ] App logs API requests/responses for debugging

---

## 🐛 Debugging Steps

### Step 1: Check Mobile App Logs
Look for:
- What URL is the app trying to connect to?
- What error message is returned?
- Is it a connection error or API error?

### Step 2: Verify API URL in Mobile App
1. Open mobile app settings
2. Check API Base URL configuration
3. Ensure it's exactly: `http://192.168.103.219:3000`

### Step 3: Test with Mobile Browser
1. Open mobile browser
2. Go to: `http://192.168.103.219:3000/health`
3. Should see: `{"status":"ok","message":"WMS API Server is running"}`
4. If this works → App configuration issue
5. If this fails → Network/firewall issue

### Step 4: Check Server Logs
When mobile app tries to connect, check server console for:
- Incoming requests
- Error messages
- Which endpoint is being called

---

## 📋 Mobile App API Endpoints Reference

### Authentication
```
POST http://192.168.103.219:3000/api/auth/login
Body: { "user_code": "...", "password": "..." }
```

### Master Data (Requires Auth Token)
```
GET http://192.168.103.219:3000/api/master/asns
Header: Authorization: Bearer {token}
```

### ASN Details
```
GET http://192.168.103.219:3000/api/asn/{asn_no}
Header: Authorization: Bearer {token}
```

### Putaway
```
GET http://192.168.103.219:3000/api/putaway/tasks
POST http://192.168.103.219:3000/api/putaway/scan-transfer-carton
Header: Authorization: Bearer {token}
```

---

## ✅ Quick Verification

**Test from Mobile Browser:**
```
http://192.168.103.219:3000/health
```
✅ Should work (you confirmed this)

**Test Login from Mobile Browser (using REST client):**
```
POST http://192.168.103.219:3000/api/auth/login
Content-Type: application/json
Body: { "user_code": "test", "password": "test" }
```
✅ Should return 400 (validation) or 401 (invalid) - not connection error

**If both work but mobile app doesn't:**
→ Mobile app configuration issue
→ Check API Base URL in mobile app settings
→ Check how mobile app constructs API URLs
→ Check mobile app error logs

---

## 🎯 Most Likely Issues

1. **Mobile app using wrong base URL:**
   - Check mobile app settings
   - Should be: `http://192.168.103.219:3000`
   - NOT: `http://192.168.103.219:3000/api`

2. **Mobile app not adding `/api` prefix:**
   - Base URL: `http://192.168.103.219:3000`
   - Login endpoint: Base URL + `/api/auth/login`
   - Full: `http://192.168.103.219:3000/api/auth/login`

3. **Mobile app using wrong request format:**
   - Must use `user_code` (not `username`)
   - Must include `Content-Type: application/json` header

---

**Next Step:** Check your mobile app's API configuration and ensure it matches the format above.

