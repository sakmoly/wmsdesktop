# Fix 401 Unauthorized Error - Quick Guide

## 🚨 Problem

Getting `401 Unauthorized` even with Authorization header set.

## ✅ Quick Fix

### Step 1: Get Fresh Token

**Token expires in 15 minutes!** If you waited, it expired.

1. **Login again:**
   ```
   POST http://localhost:3000/api/auth/login
   Body: {
     "user_code": "sysadmin",
     "password": "123"
   }
   ```

2. **Copy the ENTIRE `access_token`** (it's very long!)

### Step 2: Use Authorization Tab (NOT Headers Tab)

**❌ DON'T manually add header in Headers tab**

**✅ DO use Authorization tab:**

1. Click **"Authorization"** tab
2. **Type:** Select `Bearer Token` from dropdown
3. **Token:** Paste your fresh token
4. Postman automatically formats it as `Bearer {token}`

### Step 3: Verify

1. After setting Authorization, check **Headers** tab
2. You should see: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
3. Make sure there's a **space** after "Bearer"

## 🔍 Common Issues

### Issue 1: Token Expired
- **Symptom:** 401 error
- **Fix:** Login again, get fresh token

### Issue 2: Token Truncated
- **Symptom:** Token looks incomplete
- **Fix:** Copy entire token from login response

### Issue 3: Wrong Header Format
- **Symptom:** Header set manually, still 401
- **Fix:** Use Authorization tab instead

### Issue 4: Extra Spaces
- **Symptom:** Token has spaces before/after
- **Fix:** Copy token exactly, no extra spaces

## ✅ Success Indicators

After fixing:
- ✅ Status: `200 OK`
- ✅ Response: Array of ASN objects
- ✅ Check `asn_no` format: Should be `"ASN-0001"` (4-digit)

---

**Most likely:** Token expired. Login again and use Authorization tab!

