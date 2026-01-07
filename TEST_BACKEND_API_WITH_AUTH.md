# Test Backend API with Authentication ✅

## ✅ Good News!

The authentication error means:
- ✅ **Route is registered** - The endpoint exists
- ✅ **Backend is responding** - Server is running
- ✅ **Route is working** - Just needs authentication token

## 🔑 How to Get Authentication Token

### Option 1: Login to Get Token

**Step 1: Login to get token**
```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

**Step 2: Use the token to test ASN endpoint**
```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Option 2: Use Existing Token from Mobile App

If your mobile app is already logged in, you can:
1. Check mobile app logs for the token
2. Or use the same token the mobile app uses

### Option 3: Check Desktop App Settings

The desktop app might have the API key stored. Check:
- `wms_settings.json` file
- Desktop app settings/configuration

## 🧪 Quick Test Script

**Complete test (login + get ASNs):**
```bash
# Step 1: Login
TOKEN=$(curl -s -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password"}' \
  | jq -r '.data.token')

# Step 2: Test ASN endpoint
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.[0].asn_no'
```

**Expected:** `"ASN-0001"` (4-digit format) ✅

## 🔍 What to Check

### 1. Check ASN Format in Response

After getting a valid token, test:
```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[0]'
```

**Check the `asn_no` field:**
- ✅ **If `"asn_no": "ASN-0001"`** (4-digit) → Backend is correct!
- ❌ **If `"asn_no": "ASN-00001"`** (5-digit) → Backend is still normalizing

### 2. Check All ASNs

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.[] | .asn_no'
```

**Expected output:**
```
"ASN-0001"
"ASN-0002"
"ASN-0003"
"ASN-0004"
"ASN-0005"
```

All should be 4-digit format ✅

## 📋 Alternative: Temporarily Remove Auth for Testing

If you want to test without authentication (for development only):

**Update `wms-api/src/routes/masterRoutes.js`:**
```javascript
// Temporarily remove authenticateToken for testing
router.get('/asns', getAllAsns);  // Remove authenticateToken
```

**Then test:**
```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  | jq '.[0].asn_no'
```

**⚠️ Remember to add authentication back for production!**

## 🎯 Next Steps

1. **Get authentication token** (login or use existing token)
2. **Test ASN endpoint** with token
3. **Check ASN format** in response
4. **If 5-digit format** → Backend still normalizing (check code)
5. **If 4-digit format** → Backend is correct! (check mobile app cache)

---

**Status:** ✅ Route is working - just needs authentication token  
**Action:** Get token and test the endpoint

