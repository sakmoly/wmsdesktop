# WMS API Endpoints Summary

## ✅ All APIs Are Fully Developed and Available

All the APIs mentioned in the documentation are **fully implemented** and **registered** in the server.

---

## 📦 Transfer Carton APIs

### ✅ GET /api/transfer-cartons
Get transfer cartons with optional filtering
- **Query Parameters:** `?asn=ASN-12225&store=WAREHOUSE`
- **Status:** ✅ Implemented
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

### ✅ POST /api/transfer-cartons/create
Create a new transfer carton
- **Request Body:**
  ```json
  {
    "tc_id": "PAW-ASN12225-1767107840801",
    "asn_no": "ASN-12225",
    "to_no": null,
    "store": "WAREHOUSE",
    "user_id": "USER-786249"
  }
  ```
- **Status:** ✅ Implemented
- **File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

### ✅ POST /api/transfer-cartons/seal
Seal a transfer carton
- **Status:** ✅ Implemented

### ✅ POST /api/transfer-cartons/dispatch
Dispatch a transfer carton
- **Status:** ✅ Implemented

### ✅ GET /api/transfer-cartons/:tc_id
Get a single transfer carton by ID with contents
- **Status:** ✅ Implemented

---

## 📋 Putaway APIs

### ✅ GET /api/putaway/tasks
Get list of putaway tasks with optional filters
- **Query Parameters:**
  - `?status=Open` - Filter by status
  - `?advance_shipping_notice=ASN-12225` - Filter by ASN
  - `?source_type=ASN` - Filter by source type
  - `?transfer_in=TI-001` - Filter by Transfer In
- **Status:** ✅ Implemented
- **File:** `wms-api/src/modules/putaway/putawayController.js`

### ✅ GET /api/putaway/remaining-items
Get remaining items for putaway
- **Query Parameters:** `?asn=ASN-12225`
- **Status:** ✅ Implemented

### ✅ POST /api/putaway/create-task-for-remaining-items
Create putaway task for remaining items
- **Request Body:**
  ```json
  {
    "asn_no": "ASN-12225"
  }
  ```
- **Status:** ✅ Implemented

### ✅ POST /api/putaway/assign-rack
Assign rack/bin for putaway
- **Request Body:**
  ```json
  {
    "putaway_task": "PUT-20251230-0001",
    "carton_id": "CTN-0101",
    "item_code": "SKU-001",
    "rack": "RACK-A",
    "bin": "BIN-01",
    "qty": 50.00,
    "user_id": "USER-001"
  }
  ```
- **Status:** ✅ Implemented

### ✅ POST /api/putaway/scan-transfer-carton
Scan transfer carton and location for putaway
- **Request Body:**
  ```json
  {
    "tc_id": "TC-1767100416319",
    "rack": "A1-R01-L1-B1",
    "bin": "B1",
    "user_id": "USER-786249"
  }
  ```
  OR
  ```json
  {
    "box_id": "BOX-WHMAIN-514364",
    "rack": "A1-R01-L1-B1",
    "bin": "B1",
    "user_id": "USER-786249"
  }
  ```
- **Status:** ✅ Implemented
- **File:** `wms-api/src/modules/putaway/putawayController.js`

### ✅ POST /api/putaway/complete
Complete putaway task and update stock
- **Request Body:**
  ```json
  {
    "putaway_task": "PUT-20251230-0001",
    "performed_by": "USER-002",
    "items": [
      {
        "item_code": "SKU-001",
        "qty": 50.00,
        "target_bin": "RACK-A-01-BIN-05"
      }
    ]
  }
  ```
- **Status:** ✅ Implemented
- **File:** `wms-api/src/modules/putaway/putawayController.js`

---

## 🔍 How to Verify APIs Are Working

### 1. Check Server is Running
```bash
# Check if server is running on port 3000
curl http://localhost:3000/health
```

### 2. Test Transfer Carton Creation
```bash
POST http://localhost:3000/api/transfer-cartons/create
Content-Type: application/json
Authorization: Bearer {token}

{
  "tc_id": "PAW-ASN12225-1767107840801",
  "asn_no": "ASN-12225",
  "to_no": null,
  "store": "WAREHOUSE",
  "user_id": "USER-786249"
}
```

### 3. Test Get Transfer Cartons
```bash
GET http://localhost:3000/api/transfer-cartons?asn=ASN-12225
Authorization: Bearer {token}
```

### 4. Test Putaway Tasks
```bash
GET http://localhost:3000/api/putaway/tasks?advance_shipping_notice=ASN-12225
Authorization: Bearer {token}
```

---

## 📁 File Locations

### Routes Registration
- **Main Routes:** `wms-api/src/routes/index.js`
- **Putaway Routes:** `wms-api/src/routes/putawayRoutes.js`
- **Transfer Carton Routes:** `wms-api/src/routes/transferCartonRoutes.js`

### Controllers
- **Putaway Controller:** `wms-api/src/modules/putaway/putawayController.js`
- **Transfer Carton Controller:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

---

## ✅ Summary

**All APIs are fully developed and registered!**

The issue you're experiencing is **not** that the APIs don't exist, but rather:
1. **Transfer carton doesn't exist** - You need to create it first using `POST /api/transfer-cartons/create`
2. **Putaway task doesn't exist** - It will be created automatically when you scan a transfer carton

---

## 🚀 Quick Start Workflow

1. **Create Transfer Carton:**
   ```http
   POST /api/transfer-cartons/create
   ```

2. **Scan Transfer Carton for Putaway:**
   ```http
   POST /api/putaway/scan-transfer-carton
   ```
   This will automatically create the putaway task if it doesn't exist.

3. **Get Putaway Tasks:**
   ```http
   GET /api/putaway/tasks?advance_shipping_notice=ASN-12225
   ```

4. **Complete Putaway:**
   ```http
   POST /api/putaway/complete
   ```

---

## 📝 Notes

- All endpoints require authentication (`Authorization: Bearer {token}`)
- The APIs support both mobile app format (`asn_no`, `to_no`, `user_id`) and desktop app format (`advance_shipping_notice`, `transfer_order`, `created_by`)
- Database schema is detected dynamically, so the APIs work with different column name variations

