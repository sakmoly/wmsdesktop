# Postman Complete Workflow - Login & Test ASN ✅

## ✅ Step 1: Login (COMPLETED)

**Request:**
```
POST http://localhost:3000/api/auth/login
Body: {
  "user_code": "sysadmin",
  "password": "123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "...",
    "expires_in": 900,
    "user": { ... }
  }
}
```

**✅ You have the token!**

---

## 📋 Step 2: Test ASN Endpoint (NEXT)

### Request Setup

**Method:** `GET`  
**URL:** `http://localhost:3000/api/master/asns`

**Authorization:**
- **Type:** `Bearer Token`
- **Token:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoic3lzYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQi0jE3NjY1OTEzMDIsImV4cCI6MTc2NjU5MjIwMn0.D8SVqVA0FtIsweYXKBD0y6muCRqVuIV6q6Nb9mceGaQ`

*(Use the `access_token` from your login response)*

### Expected Response

```json
[
  {
    "asn_no": "ASN-0001",  // ✅ Check this format!
    "status": "Submitted",
    "purchase_order": "PO-2024-001",
    "supplier": "Supplier ABC",
    "shipment_date": "2024-12-20",
    "expected_arrival_date": "2024-12-25",
    "total_shipped_qty": 150.00,
    "airway_bill_no": null,
    "shipment_type": "Road",
    "updated_on": "2024-12-24T16:14:04.000Z",
    "total_carton_count": 2
  }
]
```

## 🔍 Verification

**Check the `asn_no` field:**

- ✅ **CORRECT:** `"ASN-0001"` (4-digit) → Backend matches database/desktop
- ❌ **WRONG:** `"ASN-00001"` (5-digit) → Backend still normalizing

---

## 📋 Quick Checklist

- [x] ✅ Login successful - Got `access_token`
- [ ] ⏳ Test ASN endpoint with `access_token`
- [ ] ⏳ Verify `asn_no` format (should be 4-digit)

---

**Next:** Test the ASN endpoint and check the format!

