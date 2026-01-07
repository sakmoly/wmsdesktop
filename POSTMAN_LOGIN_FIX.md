# Postman Login Fix - Correct Field Name ✅

## 🚨 Issue Found

The backend API expects `user_code` instead of `username`!

## ✅ Correct Request Format

### Login Request

**Method:** `POST`  
**URL:** `http://localhost:3000/api/auth/login`

**Body (raw JSON):**
```json
{
  "user_code": "sysadmin",
  "password": "123"
}
```

**⚠️ IMPORTANT:** Use `user_code` (not `username`)

## 🔍 Error You Got

If you used `username`, you got this error:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "user_code and password are required",
    "details": null
  }
}
```

## ✅ Correct Response

With `user_code`, you should get:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "user_code": "sysadmin",
      ...
    }
  }
}
```

## 📋 Quick Fix Steps

1. **In Postman, update the Body:**
   - Change `"username"` to `"user_code"`
   - Keep `"password"` as is

2. **Send the request again**

3. **Copy the token** from the response

4. **Use the token** to test the ASN endpoint

---

**Status:** ✅ Fixed - Use `user_code` instead of `username`

