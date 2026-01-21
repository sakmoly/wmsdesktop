# Transfer Order Stores Endpoint

**Date**: 2026-01-17  
**Status**: ✅ **IMPLEMENTED**

---

## Problem

**Issue**: Mobile app BoxManagement screen shows wrong store codes (SR-01, SR-02, SR-03) for Transfer Order TO-00012.

**Root Cause**: 
- Mobile app is calling `GET /api/warehouses/stores` which returns **ALL stores** from the database
- Should only show stores that are **actually allocated** in Transfer Order TO-00012
- The stores SR-01, SR-02, SR-03 might be all stores in the system, not the ones allocated in this specific transfer order

---

## Solution Implemented

### ✅ Created New Endpoint: `GET /api/transfer-orders/:to_no/stores`

**File**: `wms-api/src/modules/transfer-orders/getTransferOrderStores.js`  
**Route**: `GET /api/transfer-orders/:to_no/stores`

**Purpose**: Return only stores that have items allocated in the specific transfer order

**Logic**:
1. Verify transfer order exists
2. Query `tabTransferOrderItem` for distinct stores where `parent_title = to_no`
3. Join with `tabWarehouse` to get store names and warehouse types
4. Return stores with item counts and allocated quantities

---

## API Endpoint

### GET /api/transfer-orders/:to_no/stores

**Purpose**: Get distinct stores allocated in a specific transfer order

**Request**:
```http
GET /api/transfer-orders/TO-00012/stores
Authorization: Bearer <token>
```

**Response (Success)**:
```json
{
  "ok": true,
  "transfer_order": "TO-00012",
  "asn_no": "ASN-365425473",
  "stores": [
    {
      "store": "STORE-001",
      "code": "STORE-001",
      "name": "Downtown Store",
      "warehouse_type": "Store",
      "total_items": 5,
      "total_allocated_qty": 150.0
    },
    {
      "store": "STORE-002",
      "code": "STORE-002",
      "name": "Uptown Store",
      "warehouse_type": "Store",
      "total_items": 3,
      "total_allocated_qty": 75.0
    }
  ],
  "count": 2
}
```

**Response (Transfer Order Not Found)**:
```json
{
  "ok": false,
  "error": {
    "code": "TRANSFER_ORDER_NOT_FOUND",
    "message": "Transfer Order TO-00012 not found"
  }
}
```

---

## SQL Query

```sql
SELECT 
  toi.store,
  w.name,
  w.warehouse_type,
  COUNT(DISTINCT toi.item_code) as total_items,
  SUM(toi.allocated_qty) as total_allocated_qty
FROM tabTransferOrderItem toi
LEFT JOIN tabWarehouse w ON toi.store = w.code
WHERE toi.parent_title = 'TO-00012'
  AND toi.store IS NOT NULL
  AND toi.store != ''
GROUP BY toi.store, w.name, w.warehouse_type
ORDER BY toi.store ASC
```

---

## Mobile App Usage

### Before (Wrong):
```javascript
// Returns ALL stores (SR-01, SR-02, SR-03, etc.)
GET /api/warehouses/stores
```

### After (Correct):
```javascript
// Returns ONLY stores allocated in Transfer Order TO-00012
GET /api/transfer-orders/TO-00012/stores
```

**Mobile App Should**:
1. Call `GET /api/transfer-orders/TO-00012/stores` instead of `GET /api/warehouses/stores`
2. Display only the stores returned in the response
3. Show store name, item count, and allocated quantity for each store

---

## Alternative: Use Existing Endpoint

The mobile app can also use the existing endpoint and extract stores:

**Endpoint**: `GET /api/transfer-order/by-asn/:asn_no`

**Response**:
```json
{
  "to_no": "TO-00012",
  "asn_no": "ASN-365425473",
  "allocations": [
    {
      "store": "STORE-001",
      "item_code": "SKU-001",
      "allocated_qty": 50.0
    },
    {
      "store": "STORE-001",
      "item_code": "SKU-002",
      "allocated_qty": 100.0
    },
    {
      "store": "STORE-002",
      "item_code": "SKU-003",
      "allocated_qty": 75.0
    }
  ]
}
```

**Mobile App Logic**:
```javascript
// Extract unique stores from allocations
const stores = [...new Set(allocations.map(a => a.store))];
// Result: ["STORE-001", "STORE-002"]
```

---

## Testing

### Test Case: Get Stores for Transfer Order

**Request**:
```bash
curl -X GET http://localhost:3000/api/transfer-orders/TO-00012/stores \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**:
1. ✅ Returns only stores allocated in TO-00012
2. ✅ Does NOT return all stores from database
3. ✅ Includes store name, warehouse type, item count, allocated quantity
4. ✅ Returns empty array if transfer order has no items

**Verify Database**:
```sql
-- Check what stores are actually allocated in TO-00012
SELECT DISTINCT store, COUNT(DISTINCT item_code) as items
FROM tabTransferOrderItem
WHERE parent_title = 'TO-00012'
GROUP BY store;
```

---

## Summary

✅ **Fixed**:
1. ✅ Created `GET /api/transfer-orders/:to_no/stores` endpoint
2. ✅ Returns only stores allocated in the transfer order
3. ✅ Includes store details (name, warehouse_type, item count, allocated qty)
4. ✅ Registered route in `wms-api/src/routes/index.js`

✅ **Result**:
- Mobile app can now get **correct stores** for a specific transfer order
- No longer shows all stores (SR-01, SR-02, SR-03) when only specific stores are allocated
- BoxManagement screen will show only stores that have items in TO-00012

✅ **Mobile App Action Required**:
- Change API call from `GET /api/warehouses/stores` to `GET /api/transfer-orders/:to_no/stores`
- Use `to_no` from the transfer order context (TO-00012)

---

**END**
