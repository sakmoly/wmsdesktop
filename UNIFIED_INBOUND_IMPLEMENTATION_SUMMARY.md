# Unified Inbound Implementation Summary

**Date**: 2026-01-20  
**Status**: ✅ **IMPLEMENTED** (Testing Required)

---

## 🎯 Goal

ASN Receiving and Transfer-In Receiving must use the **same backend flow + same APIs** so stock updates, ledger, history, and item-location breakdown stay consistent.

---

## ✅ Implementation Complete

### 1. Created Utility Files

#### `src/utils/scanNormalize.js`
- ✅ `normalizeCartonId()` - Enforces CTN-* format, rejects TI-PUT-* and PUT-*
- ✅ `normalizeBoxId()` - Same as normalizeCartonId (box_id = carton_id)
- ✅ `stripItemCodeFromCartonId()` - Removes item code suffix
- ✅ `validateForPutaway()` - Validates for putaway operations

**Key Features**:
- Rejects old formats: `TI-PUT-*`, `PUT-*`
- Enforces: `CTN-*` format only
- Returns: `{ ok: boolean, reason?: string, carton_id?: string, box_id?: string }`

---

#### `src/services/scanEventService.js`
- ✅ `insertScanEvent()` - Centralized event insertion
- ✅ **Guarantees**: `box_id` and `store` are NEVER NULL
- ✅ **Rules**: 
  - `box_id = carton_id` (always)
  - `store = warehouse` (mapping)

**Key Features**:
- Dynamic column detection
- Always sets `box_id` and `store`
- Handles all event types

---

#### `src/services/stockMovementService.js`
- ✅ `applyStockMovement()` - Unified stock update function
- ✅ Updates: `tabCarton`, `tabCartonStock`, `tabStockLedger`, `tabTransactionHistory`
- ✅ Supports: Putaway, Relocation, Merge operations
- ✅ **Always includes**: `bin_location` and `location_id` in transaction history

**Key Features**:
- MOVE pattern: decrease from source, increase at destination
- Consistent warehouse handling
- Complete audit trail

---

### 2. Created Unified Inbound APIs

#### `src/modules/inbound/unifiedInboundController.js`

**New Endpoints**:
1. ✅ `POST /api/inbound/session/start` - Start inbound session
2. ✅ `POST /api/inbound/carton/generate` - Generate carton ID
3. ✅ `POST /api/inbound/carton/validate` - Validate carton (inserts scan event with box_id + store)
4. ✅ `POST /api/inbound/receive` - Receive item (unified for ASN + Transfer In)
5. ✅ `POST /api/inbound/session/complete` - Complete session (creates putaway task)

**Routes Updated**: `src/routes/inboundRoutes.js`
- ✅ Added new unified endpoints
- ✅ Kept legacy endpoints for backward compatibility

---

### 3. Updated Putaway Validation

#### `src/modules/putaway/putawayController.js` - `scanTransferCarton()`

**Changes**:
- ✅ Uses `scanNormalize.validateForPutaway()` to reject old formats
- ✅ Rejects `TI-PUT-*` and `PUT-*` formats early
- ✅ Enforces `CTN-*` format only
- ✅ Uses normalized `validatedBoxId` throughout

**Error Messages**:
- Clear rejection of old formats with helpful messages
- Guides users to use carton ID (CTN-*)

---

## 📋 Remaining Tasks

### Task 7: Fix Transaction History
**Status**: ⏳ **PENDING**

**Required**: Update `processPutawayCompletionEvent` in `eventController.js` to use `stockMovementService.insertTransactionHistory()` which always includes `bin_location` and `location_id`.

**Current Issue**: Transaction history may not always include `bin_location`.

---

### Task 8: Update Putaway Completion
**Status**: ⏳ **PENDING**

**Required**: Update `processPutawayCompletionEvent` and `completePutaway` to use `stockMovementService.applyStockMovement()` instead of custom stock update logic.

**Benefits**:
- Consistent stock updates for ASN and Transfer In
- Always includes `bin_location` in audit trail
- Unified code path

---

## 🧪 Testing Required

### Test 1: Reject Old Formats

**Request**:
```bash
POST /api/putaway/scan-transfer-carton
{
  "box_id": "TI-PUT-123457",
  "location_id": "A1-R02-L1-B2"
}
```

**Expected**: 
- ❌ Error: `PUTAWAY_REQUIRES_CARTON_ID`
- Message: "Putaway requires carton ID (CTN-* format). Old format (TI-PUT-* or PUT-*) is no longer supported."

---

### Test 2: Accept CTN-* Format

**Request**:
```bash
POST /api/putaway/scan-transfer-carton
{
  "box_id": "CTN-TI-123457-20260120-221653-755",
  "location_id": "A1-R02-L1-B2"
}
```

**Expected**:
- ✅ Validation successful
- ✅ Location updated
- ✅ `box_id` and `store` populated in scan events

---

### Test 3: Unified Inbound APIs

**Test Flow**:
1. `POST /api/inbound/session/start` - Start session
2. `POST /api/inbound/carton/generate` - Generate carton ID
3. `POST /api/inbound/carton/validate` - Validate carton (should insert event with box_id + store)
4. `POST /api/inbound/receive` - Receive items
5. `POST /api/inbound/session/complete` - Complete session (creates putaway task)

**Expected**:
- ✅ All APIs work for both ASN and Transfer In
- ✅ Scan events have `box_id` and `store` populated
- ✅ Putaway task created successfully

---

## 🔧 Integration Points

### Mobile App Changes Required

1. **Reject TI-PUT-* Before API Call**:
   ```typescript
   if (scannedValue.startsWith('TI-PUT-') || scannedValue.startsWith('PUT-')) {
     showAlert('Scan carton id (CTN-*)');
     return; // Don't call API
   }
   ```

2. **Use Unified Inbound APIs**:
   - Replace old receiving endpoints with `/api/inbound/*` endpoints
   - Use `source_type` and `source_doc` instead of separate ASN/Transfer In endpoints

3. **Generate + Validate Carton**:
   - When user clicks "Generate Carton ID", call both `generate` and `validate`
   - Store `carton_id` and `box_id` (they're the same)

---

## 📝 Next Steps

1. **Complete Task 7**: Update transaction history to always include `bin_location`
2. **Complete Task 8**: Update putaway completion to use `stockMovementService`
3. **Test**: Verify old formats are rejected and new formats work
4. **Mobile App**: Update to use unified APIs and reject old formats
5. **Deploy**: Backend first, then mobile app

---

## ✅ Summary

**Created**:
- ✅ `scanNormalize.js` - Format validation and normalization
- ✅ `scanEventService.js` - Guaranteed box_id and store population
- ✅ `stockMovementService.js` - Unified stock updates
- ✅ `unifiedInboundController.js` - Unified inbound APIs

**Updated**:
- ✅ Putaway validation rejects old formats
- ✅ Routes registered for new APIs

**Remaining**:
- ⏳ Integrate `stockMovementService` into putaway completion
- ⏳ Ensure transaction history always includes `bin_location`

---

**END**
