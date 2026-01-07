# Backend API Testing Guide - ASN Format Verification

## ✅ Route Confirmed Working!

The authentication error confirms:
- ✅ Route `/api/master/asns` is registered
- ✅ Backend server is running
- ✅ Endpoint is responding
- ⚠️ Just needs authentication token

## 🔑 Get Authentication Token

### Method 1: Login Endpoint

```bash
# Login to get token
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

**Save the token from response.**

### Method 2: Check Mobile App

If mobile app is already logged in:
- Check mobile app logs for the token
- Or use the same credentials mobile app uses

### Method 3: Check Desktop App Config

Check desktop app settings:
- `wms_settings.json` file
- Desktop app configuration screen

## 🧪 Test ASN Endpoint

### Step 1: Test with Token

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  | jq '.[0]'
```

### Step 2: Check ASN Format

**Look at the `asn_no` field in the response:**

**✅ CORRECT (4-digit):**
```json
{
  "asn_no": "ASN-0001",  // ✅ 4-digit format
  "status": "Submitted",
  ...
}
```

**❌ WRONG (5-digit):**
```json
{
  "asn_no": "ASN-00001",  // ❌ 5-digit format (still normalizing)
  "status": "Submitted",
  ...
}
```

### Step 3: Check All ASNs

```bash
curl -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  | jq '.[] | .asn_no'
```

**Expected output (all 4-digit):**
```
"ASN-0001"
"ASN-0002"
"ASN-0003"
"ASN-0004"
"ASN-0005"
```

## 🔍 What the Results Mean

### If Backend Returns 4-Digit Format ✅

**Backend is correct!** The issue might be:
1. **Mobile app cache** - Clear mobile app cache and restart
2. **Mobile app using different endpoint** - Check which endpoint mobile calls
3. **Mobile app normalizing** - Check mobile app code for normalization

### If Backend Returns 5-Digit Format ❌

**Backend is still normalizing.** Check:
1. **Files not copied to actual backend** - Copy files from workspace
2. **Normalization code still present** - Search and remove normalization
3. **Wrong controller being used** - Verify correct controller file

## 📋 Quick Test Script

**Complete test (login + check ASN format):**

```bash
#!/bin/bash

# Step 1: Login and get token
echo "Logging in..."
TOKEN=$(curl -s -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password"}' \
  | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Login failed"
  exit 1
fi

echo "✅ Token obtained"

# Step 2: Test ASN endpoint
echo "Testing ASN endpoint..."
RESPONSE=$(curl -s -X GET "http://localhost:3000/api/master/asns" \
  -H "Authorization: Bearer $TOKEN")

# Step 3: Check ASN format
ASN_NO=$(echo "$RESPONSE" | jq -r '.[0].asn_no')
echo "First ASN: $ASN_NO"

# Step 4: Verify format
if [[ "$ASN_NO" =~ ^ASN-[0-9]{4}$ ]]; then
  echo "✅ CORRECT: 4-digit format ($ASN_NO)"
else
  echo "❌ WRONG: Not 4-digit format ($ASN_NO)"
fi
```

## 🎯 Summary

1. ✅ **Route is working** - Authentication error confirms endpoint exists
2. 🔑 **Get authentication token** - Login or use existing token
3. 🧪 **Test endpoint** - Call with token
4. 🔍 **Check format** - Verify 4-digit format in response
5. ✅ **If correct** - Check mobile app cache
6. ❌ **If wrong** - Check backend code for normalization

---

**Status:** ✅ Route confirmed - Need authentication token to test  
**Next:** Get token and verify ASN format in response

