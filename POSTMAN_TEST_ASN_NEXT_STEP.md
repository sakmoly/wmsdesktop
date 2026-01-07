# Postman - Test ASN Endpoint (Next Step) ✅

## ✅ Login Successful!

You've successfully logged in and received:
- ✅ `access_token`: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- ✅ `refresh_token`: (for token renewal)
- ✅ Token expires in: 900 seconds (15 minutes)

## 📋 Step 2: Test ASN Endpoint

### Setup Request

1. **Create New Request:**
   - Click "New" → "HTTP Request"
   - Or press `Ctrl + N` / `Cmd + N`

2. **Configure Request:**
   - **Method:** Select `GET` from dropdown
   - **URL:** Enter:
     ```
     http://localhost:3000/api/master/asns
     ```

3. **Set Authorization:**
   - Click **"Authorization"** tab
   - **Type:** Select `Bearer Token` from dropdown
   - **Token:** Paste your `access_token` from login response:
     ```
     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoic3lzYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQi0jE3NjY1OTEzMDIsImV4cCI6MTc2NjU5MjIwMn0.D8SVqVA0FtIsweYXKBD0y6muCRqVuIV6q6Nb9mceGaQ
     ```
   
   **OR manually in Headers tab:**
   - Click **"Headers"** tab
   - Add header:
     - **Key:** `Authorization`
     - **Value:** `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoic3lzYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQi0jE3NjY1OTEzMDIsImV4cCI6MTc2NjU5MjIwMn0.D8SVqVA0FtIsweYXKBD0y6muCRqVuIV6q6Nb9mceGaQ`
     *(Make sure to include "Bearer " prefix with space)*

4. **Send Request:**
   - Click **"Send"** button
   - Wait for response

## ✅ Expected Response

**Success (200 OK):**
```json
[
  {
    "asn_no": "ASN-0001",  // ✅ Should be 4-digit format
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
  },
  {
    "asn_no": "ASN-0002",  // ✅ 4-digit format
    ...
  }
]
```

## 🔍 What to Check

### ✅ CORRECT Format (4-digit):
```json
"asn_no": "ASN-0001"  // ✅ Correct - 4 digits
"asn_no": "ASN-0002"  // ✅ Correct - 4 digits
```

### ❌ WRONG Format (5-digit):
```json
"asn_no": "ASN-00001"  // ❌ Wrong - 5 digits (still normalizing)
"asn_no": "ASN-00002"  // ❌ Wrong - 5 digits
```

## 🎯 What This Means

- **If 4-digit format** → ✅ Backend is correct! Matches database and desktop
- **If 5-digit format** → ❌ Backend is still normalizing (check backend code)

## 💡 Quick Tip: Save Token as Variable

To avoid copying token every time:

1. **Create Environment:**
   - Click gear icon (⚙️) top right
   - Click "Add" → Name it "WMS API"
   - Add variable: `access_token`
   - Set value: Paste your token

2. **Use in Requests:**
   - Authorization → Bearer Token → `{{access_token}}`
   - Now all requests use the token automatically!

---

**Ready to test!** Use the `access_token` from your login response to test the ASN endpoint.

