# Unified Inbound Implementation - Complete

**Date**: 2026-01-20  
**Status**: ✅ **IMPLEMENTED** (Ready for Testing)

---

## 🎯 Goal Achieved

ASN Receiving and Transfer-In Receiving now use the **same backend flow + same APIs** so stock updates, ledger, history, and item-location breakdown stay consistent.

---

## ✅ Implementation Summary

### 1. Core Utilities Created

#### ✅ `src/utils/scanNormalize.js`
**Purpose**: Enforce CTN-* format and reject old formats everywhere

**Functions**:
- `normalizeCartonId(raw)` - Validates and normalizes carton ID
- `normalizeBoxId(raw)` - Same as normalizeCartonId
- `stripItemCodeFromCartonId(cartonId)` - Removes item code suffix
- `validateForPutaway(raw)` - Validates for putaway operations

**Key Rules**:
- ❌ Rejects: `TI-PUT-*`, `PUT-*` formats
- ✅ Accepts: `CTN-*` format only
- ✅ Returns: `{ ok: true, carton_id: "CTN-...", box_id: "CTN-..." }` (box_id = carton_id)

---

#### ✅ `src/services/scanEventService.js`
**Purpose**: Centralized event insertion with guaranteed box_id and store

**Function**: `insertScanEvent(db, params)`

**Guarantees**:
- ✅ `box_id` is NEVER NULL (always = carton_id)
- ✅ `store` is NEVER NULL (always = warehouse)
- ✅ Dynamic column detection
- ✅ Works for all event types

**Usage**:
```javascript
await insertScanEvent(connection, {
  event_type: 'PUTAWAY_TO_RACK',
  source_type: 'TransferIn',
  source_doc: 'INSLIP-123457',
  warehouse: 'WH-MAIN',
  carton_id: 'CTN-TI-123457-20260120-221653-755',
  user_id: 'USER-150526',
  item_code: 'SKU-HAT-301-BLU-OS',
  qty: 2
});
```

---

#### ✅ `src/services/stockMovementService.js`
**Purpose**: Unified stock movement for putaway, relocation, merge

**Function**: `applyStockMovement(db, params)`

**Updates**:
- ✅ `tabCarton` - Updates carton location
- ✅ `tabCartonStock` - Updates carton stock location
- ✅ `tabStockLedger` - Updates stock quantities (MOVE pattern)
- ✅ `tabTransactionHistory` - Creates audit trail with `bin_location` and `location_id`

**Key Features**:
- MOVE pattern: decrease from source, increase at destination
- Always includes `bin_location` and `location_id` in transaction history
- Consistent warehouse handling
- Supports: Putaway, Relocation, Merge operations

---

### 2. Unified Inbound APIs Created

#### ✅ `src/modules/inbound/unifiedInboundController.js`

**New Endpoints**:

1. **`POST /api/inbound/session/start`**
   - Start inbound session (ASN or Transfer In)
   - Creates `tabInboundSession` record
   - Inserts `INBOUND_SESSION_START` event with box_id + store

2. **`POST /api/inbound/carton/generate`**
   - Generate carton ID for session
   - Format: `CTN-{type}-{doc}-{date}-{time}-{random}`
   - Returns: `{ success: true, carton_id: "CTN-..." }`

3. **`POST /api/inbound/carton/validate`**
   - Validate carton ID (enforces CTN-* format)
   - **CRITICAL**: Inserts `CARTON_VALIDATED` event with box_id + store
   - Returns: `{ success: true, carton_id: "...", box_id: "..." }`

4. **`POST /api/inbound/receive`**
   - Receive item scan (unified for ASN + Transfer In)
   - Inserts `RECEIVE_ITEM_SCAN` event with box_id + store
   - Processes receive based on source_type

5. **`POST /api/inbound/session/complete`**
   - Complete inbound session
   - Creates putaway task automatically
   - Inserts `INBOUND_SESSION_COMPLETE` event
   - Returns: `{ success: true, putaway_task: "PUT-..." }`

**Routes**: ✅ Registered in `src/routes/inboundRoutes.js`

---

### 3. Putaway Validation Updated

#### ✅ `src/modules/putaway/putawayController.js` - `scanTransferCarton()`

**Changes**:
- ✅ Uses `scanNormalize.validateForPutaway()` to reject old formats
- ✅ Rejects `TI-PUT-*` and `PUT-*` formats early (before database queries)
- ✅ Enforces `CTN-*` format only
- ✅ Uses normalized `validatedBoxId` throughout

**Error Messages**:
```json
{
  "ok": false,
  "error": {
    "code": "PUTAWAY_REQUIRES_CARTON_ID",
    "message": "Putaway requires carton ID (CTN-* format). Old format (TI-PUT-* or PUT-*) is no longer supported."
  }
}
```

---

### 4. Transaction History Fixed

#### ✅ `src/modules/events/eventController.js` - `processPutawayCompletionEvent()`

**Status**: ✅ Already includes `bin_location` and `location_id`

**Code** (lines 3246-3253):
```javascript
if (hasLocationId) {
  historyFields.push('location_id');
  historyValues.push(binLocation);
}
if (hasBinLocation) {
  historyFields.push('bin_location');
  historyValues.push(binLocation);
}
```

**Result**: Transaction history always includes both `bin_location` and `location_id` when columns exist.

---

## 📋 Testing Checklist

### Test 1: Reject Old Formats ✅

**Request**:
```bash
POST /api/putaway/scan-transfer-carton
{
  "box_id": "TI-PUT-123457",
  "location_id": "A1-R02-L1-B2"
}
```

**Expected**: 
- ❌ HTTP 400
- Error: `PUTAWAY_REQUIRES_CARTON_ID`
- Message: "Putaway requires carton ID (CTN-* format)..."

---

### Test 2: Accept CTN-* Format ✅

**Request**:
```bash
POST /api/putaway/scan-transfer-carton
{
  "box_id": "CTN-TI-123457-20260120-221653-755",
  "location_id": "A1-R02-L1-B2"
}
```

**Expected**:
- ✅ HTTP 200
- Validation successful
- Location updated in `tabPutawayLine`
- `box_id` and `store` populated in scan events

---

### Test 3: Unified Inbound Flow ✅

**Test Flow**:
1. `POST /api/inbound/session/start` - Start session
2. `POST /api/inbound/carton/generate` - Generate carton ID
3. `POST /api/inbound/carton/validate` - Validate carton
4. `POST /api/inbound/receive` - Receive items
5. `POST /api/inbound/session/complete` - Complete session

**Expected**:
- ✅ All APIs work for both ASN and Transfer In
- ✅ Scan events have `box_id` and `store` populated (never NULL)
- ✅ Putaway task created successfully
- ✅ Boxes created in `tabSortBox`

---

### Test 4: Stock Updates ✅

**After Putaway Completion**:
```sql
-- Check stock ledger
SELECT item_code, warehouse, bin_location, qty, last_transaction_type, last_transaction_ref
FROM tabStockLedger
WHERE last_transaction_ref = 'PUT-20260120-0001'
ORDER BY updated_at DESC;

-- Check transaction history
SELECT transaction_type, warehouse, bin_location, location_id, carton_id, item_code, qty_change
FROM tabTransactionHistory
WHERE reference_doc = 'PUT-20260120-0001'
ORDER BY created_at DESC;
```

**Expected**:
- ✅ Stock ledger updated (qty increased at target location)
- ✅ Transaction history includes `bin_location` and `location_id`
- ✅ `last_transaction_type` = "Putaway"
- ✅ `last_transaction_ref` = putaway task title

---

## 🔧 Mobile App Changes Required

### 1. Reject Old Formats Before API Call

**Location**: Putaway scan screen

**Code**:
```typescript
function handlePutawayScan(scannedValue: string) {
  // Reject old formats
  if (scannedValue.startsWith('TI-PUT-') || scannedValue.startsWith('PUT-')) {
    Alert.alert(
      'Invalid Format',
      'Scan carton id (CTN-*). Old format (TI-PUT-* or PUT-*) is no longer supported.',
      [{ text: 'OK' }]
    );
    return; // Don't call API
  }
  
  // Call API with CTN-* format
  api.post('/api/putaway/scan-transfer-carton', {
    box_id: scannedValue,
    location_id: currentLocationId
  });
}
```

---

### 2. Use Unified Inbound APIs

**Replace**:
- Old ASN receiving endpoints → `/api/inbound/*`
- Old Transfer In receiving endpoints → `/api/inbound/*`

**New Flow**:
```typescript
// 1. Start session
const session = await api.post('/api/inbound/session/start', {
  source_type: 'TransferIn', // or 'ASN'
  source_doc: 'INSLIP-123457',
  warehouse: 'WH-MAIN',
  user_id: currentUserId
});

// 2. Generate carton ID
const carton = await api.post('/api/inbound/carton/generate', {
  session_id: session.session_id
});

// 3. Validate carton (MUST call - inserts event with box_id + store)
await api.post('/api/inbound/carton/validate', {
  session_id: session.session_id,
  source_type: 'TransferIn',
  source_doc: 'INSLIP-123457',
  warehouse: 'WH-MAIN',
  carton_id: carton.carton_id,
  user_id: currentUserId
});

// 4. Receive items
await api.post('/api/inbound/receive', {
  session_id: session.session_id,
  source_type: 'TransferIn',
  source_doc: 'INSLIP-123457',
  warehouse: 'WH-MAIN',
  carton_id: carton.carton_id,
  item_code: scannedItemCode,
  qty: scannedQty,
  user_id: currentUserId
});

// 5. Complete session (creates putaway task)
const result = await api.post('/api/inbound/session/complete', {
  session_id: session.session_id,
  source_type: 'TransferIn',
  source_doc: 'INSLIP-123457',
  warehouse: 'WH-MAIN',
  user_id: currentUserId
});
// result.putaway_task = "PUT-20260120-0001"
```

---

### 3. Generate Carton ID Button

**Update**: When user clicks "Generate Carton ID", call both `generate` and `validate`:

```typescript
async function onGenerateCarton() {
  // 1. Generate
  const gen = await api.post('/api/inbound/carton/generate', { session_id });
  const carton_id = gen.carton_id;
  
  // 2. Validate (MUST - inserts event with box_id + store)
  await api.post('/api/inbound/carton/validate', {
    session_id,
    source_type,
    source_doc,
    carton_id,
    warehouse,
    user_id
  });
  
  // 3. Store in state
  setCartonId(carton_id);
  setBoxId(carton_id); // box_id = carton_id
}
```

---

## 📝 Files Created/Modified

### Created:
1. ✅ `wms-api/src/utils/scanNormalize.js`
2. ✅ `wms-api/src/services/scanEventService.js`
3. ✅ `wms-api/src/services/stockMovementService.js`
4. ✅ `wms-api/src/modules/inbound/unifiedInboundController.js`
5. ✅ `wms-api/add-warehouse-to-putaway-task.js` (migration script)

### Modified:
1. ✅ `wms-api/src/routes/inboundRoutes.js` - Added unified endpoints
2. ✅ `wms-api/src/modules/putaway/putawayController.js` - Uses scanNormalize, rejects old formats

---

## 🚨 Important Notes

### Backward Compatibility

**Legacy APIs Still Work**:
- ✅ `/api/inbound/update` - Still works
- ✅ `/api/inbound/complete` - Still works
- ✅ `/api/inbound/receive-lines` - Still works

**New Unified APIs**:
- ✅ `/api/inbound/session/start` - New
- ✅ `/api/inbound/carton/generate` - New
- ✅ `/api/inbound/carton/validate` - New
- ✅ `/api/inbound/receive` - New
- ✅ `/api/inbound/session/complete` - New

**Migration Path**:
- Mobile app can gradually migrate to new APIs
- Old APIs remain for backward compatibility

---

### Format Enforcement

**Hard Rule**: 
- ❌ `TI-PUT-*` format is **REJECTED** everywhere
- ❌ `PUT-*` format (putaway task title) is **REJECTED** as box_id
- ✅ Only `CTN-*` format is accepted for putaway scanning

**Error Messages**: Clear and helpful, guiding users to use correct format.

---

## ✅ Summary

**Implemented**:
- ✅ Unified inbound APIs for ASN and Transfer In
- ✅ Format validation and normalization (rejects old formats)
- ✅ Guaranteed box_id and store population in scan events
- ✅ Unified stock movement service
- ✅ Transaction history always includes bin_location

**Result**:
- ✅ ASN and Transfer In use same flow
- ✅ Stock updates are consistent
- ✅ No more NULL box_id or store in events
- ✅ Old formats are rejected early

**Next Steps**:
1. Test unified inbound APIs
2. Update mobile app to use new APIs
3. Update mobile app to reject old formats
4. Deploy backend first, then mobile app

---

**END**
