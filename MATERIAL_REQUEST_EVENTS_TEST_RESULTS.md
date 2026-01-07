# Material Request Events Test Results

## ✅ Test Completed Successfully

The test script ran successfully and identified the root cause of the issue.

## 🔍 Key Findings

### 1. Query Works Correctly
The SQL query works when using the correct column names:
- ✅ `rack` and `bin` columns exist
- ❌ `source_bin` column does NOT exist (use `rack`/`bin` instead)

### 2. Root Cause Identified
**All events have `transfer_order = NULL`**

- **Total events in database:** 132
- **Events with transfer_order = NULL:** 132 (100%)
- **Events with transfer_order LIKE 'MR-%':** 0
- **Events with transfer_order = 'MR-0001':** 0

### 3. Events Are Being Saved
Recent events show:
- Event Type: `PACK_BOX_TO_TC`
- Item Code: `SKU-HAT-301-BLU-OS`
- Qty: 1.00
- Rack: `A1-R01-L1-B1`
- Bin: `A1-R01-L1-B1`
- **Transfer Order: NULL** ❌

### 4. Material Request Items Status
All items for MR-0001:
- Requested Qty: 20.00
- **Picked Qty: 0.00** ❌
- Status: Pending

## 🎯 The Problem

The mobile app is sending events but **NOT including the `transfer_order` field** (or it's being sent as NULL).

The event handler code checks:
```javascript
if (effectiveTransferOrder && (event_type === 'SORT_TO_BOX' || event_type === 'PACK_BOX_TO_TC')) {
  const isMaterialRequest = effectiveTransferOrder.startsWith('MR-') || ...;
  if (isMaterialRequest) {
    // Process Material Request picking
  }
}
```

Since `transfer_order` is NULL, the condition `effectiveTransferOrder` is false, so Material Request picking is never processed.

## ✅ Solution

The backend code has been updated to support both:
- `transfer_order: "MR-0001"` 
- `material_request: "MR-0001"`

**The mobile app MUST send events with one of these fields:**

### Correct Event Format

```json
{
  "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
  "event_type": "PACK_BOX_TO_TC",
  "event_time": "2026-01-03T10:35:00Z",
  "device_id": "DEVICE-001",
  "user_id": "USER-004",
  "transfer_order": "MR-0001",  // ✅ REQUIRED - Must be "MR-0001"
  "item_code": "SKU-HAT-301-BLU-OS",
  "qty": 20.00,
  "rack": "A1-R01-L1-B1",
  "bin": "A1-R01-L1-B1",
  "tc_id": "TC-MR-0001-001"
}
```

OR

```json
{
  "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
  "event_type": "PACK_BOX_TO_TC",
  "event_time": "2026-01-03T10:35:00Z",
  "device_id": "DEVICE-001",
  "user_id": "USER-004",
  "material_request": "MR-0001",  // ✅ Alternative field name
  "item_code": "SKU-HAT-301-BLU-OS",
  "qty": 20.00,
  "rack": "A1-R01-L1-B1",
  "bin": "A1-R01-L1-B1"
}
```

## 📋 Corrected SQL Query

Use this query (with correct column names):

```sql
SELECT 
  event_type,
  transfer_order,
  item_code,
  qty,
  rack,
  bin,
  event_time
FROM tabWmsScanEvent
WHERE transfer_order = 'MR-0001'
  OR transfer_order LIKE 'MR-%'
ORDER BY event_time DESC
```

Or combine rack and bin:

```sql
SELECT 
  event_type,
  transfer_order,
  item_code,
  qty,
  CONCAT(COALESCE(rack, ''), '-', COALESCE(bin, '')) as source_location,
  event_time
FROM tabWmsScanEvent
WHERE transfer_order = 'MR-0001'
  OR transfer_order LIKE 'MR-%'
ORDER BY event_time DESC
```

## 🔧 Next Steps

1. **Update Mobile App** - Ensure events include `transfer_order: "MR-0001"` field
2. **Restart API Server** - To load the code changes
3. **Test Again** - Send events with `transfer_order` field and verify:
   - Events are saved with `transfer_order = 'MR-0001'`
   - `picked_qty` updates in `tabMaterialRequestItem`
   - Stock is reduced in `tabStockLedger`

## 📊 Test Script

Run the test script to verify:

```bash
cd wms-api
node test-material-request-events-fixed.js
```

This will show:
- All events with Material Request transfer orders
- Material Request items with picked quantities
- Recent events to verify event format

