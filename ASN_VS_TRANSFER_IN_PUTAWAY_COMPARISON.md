# ASN Putaway vs Transfer In Putaway - Complete Comparison

**Date**: 2026-01-20  
**Status**: ✅ **UNIFIED PROCESS**

---

## 🎯 Key Finding: Both Processes Are Now Identical!

Both ASN Putaway and Transfer In Putaway now use **the exact same API endpoints** and **the same workflow** - scanning `box_id` from `tabSortBox`.

---

## 📊 Side-by-Side Comparison

| Aspect | ASN Putaway | Transfer In Putaway | Status |
|--------|-------------|---------------------|--------|
| **Box Creation** | Created during Sorting process | Created automatically when putaway task is created | ✅ Same |
| **Box Table** | `tabSortBox` | `tabSortBox` | ✅ Same |
| **Box ID Format** | `PAW-ASN-*` or `BOX-WHMAIN-*` | `TI-PUT-*` or `BOX-WHMAIN-*` (reused) | ✅ Same structure |
| **Scan Endpoint** | `POST /api/putaway/scan-transfer-carton` | `POST /api/putaway/scan-transfer-carton` | ✅ **SAME** |
| **Scan Parameter** | `box_id` (from `tabSortBox`) | `box_id` (from `tabSortBox`) | ✅ **SAME** |
| **Complete Endpoint** | `POST /api/putaway/complete` | `POST /api/putaway/complete` | ✅ **SAME** |
| **Validation** | Validates `box_id` in `tabSortBox` | Validates `box_id` in `tabSortBox` | ✅ **SAME** |
| **Stock Update** | Updates via `PUTAWAY_TO_RACK` events | Updates via `PUTAWAY_TO_RACK` events | ✅ **SAME** |

---

## 🔄 Complete Workflow Comparison

### ASN Putaway Workflow

```
1. Receive ASN Items
   └─> POST /api/inbound/receive-lines

2. Sort Items into Boxes (if Transfer Order exists)
   └─> Creates boxes in tabSortBox (box_id: PAW-ASN-* or BOX-WHMAIN-*)
   └─> Creates SORT_TO_BOX events

3. Create Putaway Task (automatic)
   └─> For remaining items (if no Transfer Order) OR after sorting
   └─> Creates tabPutawayTask and tabPutawayLine

4. Scan Box for Putaway
   └─> POST /api/putaway/scan-transfer-carton
   └─> Request: { "box_id": "PAW-ASN-...", "location_id": "A1-R02-L1-B2" }
   └─> Validates box_id exists in tabSortBox

5. Complete Putaway
   └─> POST /api/putaway/complete
   └─> Request: { "putaway_task": "PUT-...", "box_id": "PAW-ASN-..." }
   └─> Creates PUTAWAY_TO_RACK events
   └─> Updates stock ledger
```

### Transfer In Putaway Workflow

```
1. Receive Transfer In Items
   └─> POST /api/transfer-in/:title/receive-line

2. Auto-Create Putaway Task + Boxes (automatic)
   └─> Creates tabPutawayTask and tabPutawayLine
   └─> Creates boxes in tabSortBox (box_id: TI-PUT-* or reuses BOX-WHMAIN-*)
   └─> Creates SORT_TO_BOX events

3. Scan Box for Putaway
   └─> POST /api/putaway/scan-transfer-carton
   └─> Request: { "box_id": "TI-PUT-..." or "BOX-WHMAIN-...", "location_id": "A1-R02-L1-B2" }
   └─> Validates box_id exists in tabSortBox

4. Complete Putaway
   └─> POST /api/putaway/complete
   └─> Request: { "putaway_task": "PUT-...", "box_id": "TI-PUT-..." }
   └─> Creates PUTAWAY_TO_RACK events
   └─> Updates stock ledger
```

**✅ Both workflows are IDENTICAL after box creation!**

---

## 🔌 API Endpoints (Unified)

### 1. Scan Box for Putaway

**Endpoint:** `POST /api/putaway/scan-transfer-carton`

**Works for:** ✅ ASN Putaway ✅ Transfer In Putaway

**Request (ASN Putaway):**
```json
{
  "box_id": "PAW-ASN365425473-1768829978799",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-001"
}
```

**Request (Transfer In Putaway):**
```json
{
  "box_id": "TI-PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-001"
}
```

**Response (Both):**
```json
{
  "ok": true,
  "message": "Validation successful",
  "validated": {
    "box_id": "PAW-ASN-... or TI-PUT-...",
    "location_id": "A1-R02-L1-B2",
    "putaway_task": "PUT-20260120-0001",
    "putaway_type": "ASN" or "TRANSFER_IN",
    "location": {
      "rack": "R02",
      "bin": "B2"
    }
  },
  "ready_for_completion": true
}
```

---

### 2. Complete Putaway

**Endpoint:** `POST /api/putaway/complete`

**Works for:** ✅ ASN Putaway ✅ Transfer In Putaway

**Request (Both):**
```json
{
  "putaway_task": "PUT-20260120-0001",
  "box_id": "PAW-ASN-... or TI-PUT-...",
  "location_id": "A1-R02-L1-B2",
  "completed_by": "USER-001"
}
```

**Response (Both):**
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20260120-0001",
    "status": "Completed",
    "items_updated": 2,
    "stock_updated": true
  }
}
```

---

## 📱 Mobile App Implementation

### ✅ Unified Implementation (Same for Both)

```typescript
// Works for BOTH ASN and Transfer In Putaway
const handlePutawayScan = async (boxId: string, locationId: string) => {
  // Step 1: Validate box and location
  const validationResponse = await apiService.post("/api/putaway/scan-transfer-carton", {
    box_id: boxId,        // ✅ Same for both ASN and Transfer In
    location_id: locationId,
    user_id: currentUser.id
  });

  if (validationResponse.ok) {
    // Step 2: Complete putaway
    const completeResponse = await apiService.post("/api/putaway/complete", {
      putaway_task: validationResponse.validated.putaway_task,
      box_id: boxId,       // ✅ Same for both
      location_id: locationId,
      completed_by: currentUser.id
    });

    return completeResponse;
  }
};
```

**Key Points:**
- ✅ **Same endpoint** for both ASN and Transfer In
- ✅ **Same request format** (`box_id` + `location_id`)
- ✅ **Same response format**
- ✅ **No special handling needed** - backend automatically detects type

---

## 🔍 How Backend Distinguishes ASN vs Transfer In

The backend automatically detects the putaway type by:

1. **Checking `box_id` in `tabSortBox`:**
   - If `advance_shipping_notice` exists → ASN Putaway
   - If `source_type = 'Transfer In'` → Transfer In Putaway

2. **Checking `putaway_task`:**
   - If `source_type = 'ASN'` → ASN Putaway
   - If `source_type = 'TransferIn'` → Transfer In Putaway

3. **Fallback to box format:**
   - `PAW-ASN-*` → ASN Putaway
   - `TI-PUT-*` → Transfer In Putaway
   - `BOX-WHMAIN-*` → Check metadata in `tabSortBox`

**✅ No manual type specification needed!**

---

## ✅ Verification Checklist

### Backend Verification

- [x] ✅ Both ASN and Transfer In create boxes in `tabSortBox`
- [x] ✅ Both create `SORT_TO_BOX` events
- [x] ✅ `scanTransferCarton` validates `box_id` for both
- [x] ✅ `completePutaway` processes both types correctly
- [x] ✅ Stock updates work for both via `PUTAWAY_TO_RACK` events
- [x] ✅ Event normalization handles both `PAW-ASN-*` and `TI-PUT-*` box IDs

### Mobile App Requirements

- [ ] ⚠️ **Mobile app must use `box_id` for Transfer In Putaway** (not `carton_id` or `tc_id`)
- [ ] ⚠️ **Mobile app should get `box_id` from validation endpoint** (`POST /api/transfer-in/:title/validate-carton`)
- [ ] ⚠️ **Mobile app should use same scan flow** for both ASN and Transfer In

---

## 🚨 Important Notes

### For Transfer In Putaway:

1. **Box ID Source:**
   - Get `box_id` from: `POST /api/transfer-in/:title/validate-carton` (with `carton_id`)
   - OR get from: `GET /api/putaway/tasks?source_type=TransferIn` (response includes `box_id`)

2. **Do NOT use:**
   - ❌ `carton_id` directly in `scan-transfer-carton`
   - ❌ `tc_id` for Transfer In putaway
   - ✅ **Always use `box_id` from `tabSortBox`**

3. **Box Creation:**
   - Boxes are created automatically when putaway task is created
   - Box ID format: `TI-PUT-YYYYMMDD-####` (new) or `BOX-WHMAIN-*` (reused)
   - Box is linked to putaway task via `putaway_task_title` or `source_ref`

---

## 📝 Summary

✅ **ASN Putaway and Transfer In Putaway are now IDENTICAL processes:**
- Same API endpoints
- Same request/response format
- Same validation logic
- Same completion flow
- Same stock update mechanism

✅ **Only difference:**
- Box ID format (`PAW-ASN-*` vs `TI-PUT-*`)
- Box creation timing (during sorting vs during putaway task creation)

✅ **Mobile app can use the same code for both!**

---

**Status**: ✅ **READY FOR TESTING**

Both processes are unified and ready for mobile app implementation.
