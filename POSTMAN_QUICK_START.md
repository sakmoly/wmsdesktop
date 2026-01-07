# Postman Quick Start - Login & Test ASN API

## 🚀 Quick Steps

### Step 1: Login (Get Token)

**Request Setup:**
```
Method: POST
URL: http://localhost:3000/api/auth/login
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "user_code": "your_username",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Action:** Copy the `token` value

---

### Step 2: Test ASN Endpoint

**Request Setup:**
```
Method: GET
URL: http://localhost:3000/api/master/asns
Authorization:
  Type: Bearer Token
  Token: [paste token from Step 1]
```

**Expected Response:**
```json
[
  {
    "asn_no": "ASN-0001",  // ✅ Should be 4-digit format
    "status": "Submitted",
    ...
  }
]
```

**Check:** `asn_no` should be `"ASN-0001"` (4-digit), not `"ASN-00001"` (5-digit)

---

## 📸 Visual Guide

### Login Request
```
POST http://localhost:3000/api/auth/login

Headers:
┌─────────────────┬──────────────────────┐
│ Content-Type    │ application/json     │
└─────────────────┴──────────────────────┘

Body (raw JSON):
{
  "user_code": "your_username",
  "password": "your_password"
}
```

### ASN Request
```
GET http://localhost:3000/api/master/asns

Authorization:
┌─────────────────┬──────────────────────┐
│ Type            │ Bearer Token         │
│ Token           │ eyJhbGciOiJIUzI1... │
└─────────────────┴──────────────────────┘
```

---

## ✅ Success Indicators

- ✅ Login returns `"success": true` with `token` field
- ✅ ASN request returns array of ASN objects
- ✅ `asn_no` field shows 4-digit format: `"ASN-0001"`

---

**That's it!** You're ready to test.

