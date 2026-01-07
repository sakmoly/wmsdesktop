# Postman Authentication Troubleshooting - 401 Error

## 🚨 Issue: 401 Unauthorized Even With Token

You're getting `401 Unauthorized` even though the Authorization header is set. Let's fix this.

## 🔍 Possible Causes

### 1. Token Expired ⚠️ **MOST LIKELY**

The token expires in **900 seconds (15 minutes)**. If you waited too long, it expired.

**Solution:** Login again to get a fresh token.

### 2. Token Format Issue

The token might be truncated or have extra characters.

**Solution:** Make sure you copy the **entire token** from the login response.

### 3. Authorization Header Format

The backend might expect a different format.

**Solution:** Try these variations:

**Option A: Use Authorization Tab (Recommended)**
- Go to **Authorization** tab
- Select **Bearer Token** from dropdown
- Paste token in the **Token** field
- Postman will automatically format it correctly

**Option B: Manual Header (If Option A doesn't work)**
- Go to **Headers** tab
- Key: `Authorization`
- Value: `Bearer {your_token}` (make sure there's a space after "Bearer")

### 4. Token Field Name

The backend might expect `token` instead of `access_token`.

**Check:** Look at your login response - did it return `access_token` or `token`?

## ✅ Step-by-Step Fix

### Step 1: Get Fresh Token

1. **Login again:**
   - `POST http://localhost:3000/api/auth/login`
   - Body: `{ "user_code": "sysadmin", "password": "123" }`
   - Copy the **entire** `access_token` (it's long!)

### Step 2: Use Authorization Tab (Recommended)

1. **Create new GET request:**
   - `GET http://localhost:3000/api/master/asns`

2. **Go to Authorization tab:**
   - **Type:** Select `Bearer Token` from dropdown
   - **Token:** Paste your fresh token here
   - **DO NOT** manually add "Bearer" - Postman does this automatically

3. **Send request**

### Step 3: Verify Header

After setting Authorization, check the **Headers** tab:
- You should see: `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- Make sure there's a **space** between "Bearer" and the token

## 🔍 Alternative: Check What Backend Expects

The backend might be looking for a different header. Try:

**Option 1: Standard Bearer Token**
```
Authorization: Bearer {token}
```

**Option 2: X-Access-Token (if backend uses this)**
```
X-Access-Token: {token}
```

**Option 3: Token in Query Parameter (unlikely but possible)**
```
GET http://localhost:3000/api/master/asns?token={token}
```

## 📋 Quick Checklist

- [ ] Token is fresh (logged in within last 15 minutes)
- [ ] Copied entire token (not truncated)
- [ ] Using Authorization tab with "Bearer Token" type
- [ ] Token pasted correctly (no extra spaces/characters)
- [ ] Header shows: `Authorization: Bearer {token}`

## 💡 Pro Tip: Auto-Refresh Token

If tokens expire frequently, you can:

1. **Save token as environment variable**
2. **Use Pre-request Script** to auto-refresh if expired
3. **Or use refresh_token** to get new access_token

---

**Most likely fix:** Login again to get a fresh token, then use the **Authorization tab** (not manual header).

