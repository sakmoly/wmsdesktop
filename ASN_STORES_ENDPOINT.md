# ASN Stores Endpoint (Handles ASN with/without Transfer Order)

**Date**: 2026-01-17  
**Status**: ✅ **IMPLEMENTED**

---

## Problem

**Issue**: ASN can exist without Transfer Order. When ASN has no TO:
- Cannot use `GET /api/transfer-orders/:to_no/stores` (no `to_no` exists)
- Need alternative way to get stores for BoxManagement screen
- Stores should come from boxes created for the ASN (not from transfer order items)

**Scenarios**:
1. **ASN with TO**: Stores come from `tabTransferOrderItem` (allocations)
2. **ASN without TO**: Stores come from `tabSortBox` (boxes created for ASN)

---

## Solution Implemented

### ✅ Created New Endpoint: `GET /api/asn/:asn_no/stores`

**File**: `wms-api/src/modules/transfer-orders/getTransferOrderStores.js`  
**Route**: `GET /api/asn/:asn_no/stores`

**Purpose**: Return stores for an ASN, handling both cases:
- If ASN has Transfer Order → Get stores from TO items
- If ASN has no Transfer Order → Get stores from boxes created for ASN

**Logic**:
1. Verify ASN exists
2. Check if Transfer Order exists for ASN
3. **If TO exists**: Get stores from `tabTransferOrderItem`
4. **If no TO**: Get stores from `tabSortBox` (boxes created for ASN)
5. Return stores with appropriate metadata

---

## API Endpoint

### GET /api/asn/:asn_no/stores

**Purpose**: Get distinct stores for an ASN (works with or without Transfer Order)

**Request**:
```http
GET /api/asn/ASN-365425473/stores
Authorization: Bearer <token>
```

**Response (ASN with Transfer Order)**:
```json
{
  "ok": true,
  "asn_no": "ASN-365425473",
  "transfer_order": "TO-00012",
  "has_transfer_order": true,
  "source": "transfer_order",
  "stores": [
    {
      "store": "STORE-001",
      "code": "STORE-001",
      "name": "Downtown Store",
      "warehouse_type": "Store",
      "total_items": 5,
      "total_allocated_qty": 150.0
    }
  ],
  "count": 1
}
```

**Response (ASN without Transfer Order)**:
```json
{
  "ok": true,
  "asn_no": "ASN-365425473",
  "transfer_order": null,
  "has_transfer_order": false,
  "source": "boxes",
  "stores": [
    {
      "store": "STORE-001",
      "code": "STORE-001",
      "name": "Downtown Store",
      "warehouse_type": "Store",
      "total_boxes": 3,
      "open_boxes": 2,
      "closed_boxes": 1
    }
  ],
  "count": 1
}
```

**Response (ASN Not Found)**:
```json
{
  "ok": false,
  "error": {
    "code": "ASN_NOT_FOUND",
    "message": "ASN ASN-365425473 not found"
  }
}
```

---

## SQL Queries

### Case 1: ASN with Transfer Order
```sql
-- Get stores from Transfer Order items
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

### Case 2: ASN without Transfer Order
```sql
-- Get stores from boxes created for ASN
SELECT 
  b.store,
  w.name,
  w.warehouse_type,
  COUNT(DISTINCT b.box_id) as total_boxes,
  SUM(CASE WHEN b.status = 'Open' THEN 1 ELSE 0 END) as open_boxes,
  SUM(CASE WHEN b.status = 'Closed' THEN 1 ELSE 0 END) as closed_boxes
FROM tabSortBox b
LEFT JOIN tabWarehouse w ON b.store = w.code
WHERE b.advance_shipping_notice = 'ASN-365425473'
  AND b.store IS NOT NULL
  AND b.store != ''
GROUP BY b.store, w.name, w.warehouse_type
ORDER BY b.store ASC
```

---

## Mobile App Usage

### Recommended Approach (Handles Both Cases):

```javascript
// Get stores for ASN (works with or without TO)
GET /api/asn/ASN-365425473/stores
```

**Response Handling**:
```javascript
const response = await fetch(`/api/asn/${asn_no}/stores`);
const data = await response.json();

if (data.ok) {
  if (data.has_transfer_order) {
    // ASN has TO - stores from transfer order items
    console.log(`Stores from Transfer Order: ${data.transfer_order}`);
    // Show: total_items, total_allocated_qty
  } else {
    // ASN has no TO - stores from boxes
    console.log('Stores from boxes (no Transfer Order)');
    // Show: total_boxes, open_boxes, closed_boxes
  }
  
  // Display stores
  data.stores.forEach(store => {
    // Show store in BoxManagement screen
  });
}
```

---

## Alternative Endpoints

### Option 1: Use Transfer Order Endpoint (if TO exists)
```javascript
// First check if TO exists
GET /api/transfer-order/by-asn/ASN-365425473

// If TO exists, get stores
GET /api/transfer-orders/TO-00012/stores
```

### Option 2: Use ASN Stores Endpoint (Recommended)
```javascript
// Works for both cases (with/without TO)
GET /api/asn/ASN-365425473/stores
```

---

## Workflow

### ASN with Transfer Order:
```
ASN-365425473
  ↓
Has Transfer Order: TO-00012
  ↓
Get stores from tabTransferOrderItem
  ↓
Return stores with item counts and allocated quantities
```

### ASN without Transfer Order:
```
ASN-365425473
  ↓
No Transfer Order
  ↓
Get stores from tabSortBox (boxes created for ASN)
  ↓
Return stores with box counts (total, open, closed)
```

---

## Testing

### Test Case 1: ASN with Transfer Order

**Request**:
```bash
curl -X GET http://localhost:3000/api/asn/ASN-365425473/stores \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**:
1. ✅ Returns stores from Transfer Order items
2. ✅ `has_transfer_order: true`
3. ✅ `source: "transfer_order"`
4. ✅ Includes `total_items` and `total_allocated_qty`

### Test Case 2: ASN without Transfer Order

**Request**:
```bash
curl -X GET http://localhost:3000/api/asn/ASN-0001/stores \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**:
1. ✅ Returns stores from boxes created for ASN
2. ✅ `has_transfer_order: false`
3. ✅ `source: "boxes"`
4. ✅ Includes `total_boxes`, `open_boxes`, `closed_boxes`

**Verify Database**:
```sql
-- Check if ASN has Transfer Order
SELECT title FROM tabTransferOrder WHERE advance_shipping_notice = 'ASN-365425473';

-- Check boxes for ASN (if no TO)
SELECT DISTINCT store, COUNT(*) as box_count
FROM tabSortBox
WHERE advance_shipping_notice = 'ASN-365425473'
GROUP BY store;
```

---

## Summary

✅ **Fixed**:
1. ✅ Created `GET /api/asn/:asn_no/stores` endpoint
2. ✅ Handles ASN with Transfer Order (gets stores from TO items)
3. ✅ Handles ASN without Transfer Order (gets stores from boxes)
4. ✅ Returns appropriate metadata based on source
5. ✅ Registered route in `wms-api/src/routes/index.js`

✅ **Result**:
- Mobile app can get stores for **any ASN** (with or without TO)
- BoxManagement screen works correctly for both scenarios
- No need to check if TO exists before calling endpoint

✅ **Mobile App Action Required**:
- Use `GET /api/asn/:asn_no/stores` instead of `GET /api/transfer-orders/:to_no/stores`
- Handle `has_transfer_order` flag to show appropriate metadata
- Display stores with correct information based on source

---

**END**
