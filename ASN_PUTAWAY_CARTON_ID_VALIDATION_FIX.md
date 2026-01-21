# ASN Putaway Carton ID Validation Fix

**Date**: 2026-01-21  
**Status**: ✅ **FIXED**

---

## 🔍 Problem

Mobile app was sending ASN box ID `PAW-ASN365425479-1768995821165` as `carton_id`, but backend validation was rejecting it with error:

```
API error (400): {"code":"INVALID_CARTON_FORMAT","message":"Carton ID must start with \"CTN-\". Received: PAW-ASN365425479-1768995821165"}
```

**Root Cause**: 
- For **ASN Putaway**, the `box_id` format is `PAW-ASN-*` (from sorting process)
- This is **NOT** a carton_id, it's a box_id
- The validation was too strict - it only accepted `CTN-*` format for all putaway types
- For ASN putaway, we need to accept `PAW-ASN-*` format as a valid `box_id`

---

## ✅ Fix Applied

### 1. Updated `normalizeCartonId` function

**File**: `wms-api/src/utils/scanNormalize.js`

**Changes**:
- Added `allowAsnBoxId` parameter to accept ASN box IDs
- Accept `PAW-ASN-*` format when `allowAsnBoxId = true`
- For ASN: `box_id = PAW-ASN-*`, `carton_id = null` (will be looked up from `tabSortBox`)

```javascript
export function normalizeCartonId(raw, allowAsnBoxId = false) {
  // ...
  
  // For ASN putaway: Accept PAW-ASN-* format as box_id (not carton_id)
  if (allowAsnBoxId && v.startsWith("PAW-ASN")) {
    return { 
      ok: true, 
      carton_id: null, // ASN box_id is not a carton_id
      box_id: normalizedBoxId 
    };
  }
  
  // Enforce carton format - must start with CTN-
  if (!v.startsWith("CTN-")) {
    return { 
      ok: false, 
      reason: "INVALID_CARTON_FORMAT",
      message: `Carton ID must start with "CTN-". Received: ${v}. For ASN putaway, use box_id (PAW-ASN-* format) instead of carton_id.`
    };
  }
}
```

### 2. Updated `validateForPutaway` function

**File**: `wms-api/src/utils/scanNormalize.js`

**Changes**:
- Added `allowAsnBoxId` parameter
- Passes parameter to `normalizeCartonId`

```javascript
export function validateForPutaway(raw, allowAsnBoxId = false) {
  const normalized = normalizeCartonId(raw, allowAsnBoxId);
  // ...
}
```

### 3. Updated `scanTransferCarton` endpoint

**File**: `wms-api/src/modules/putaway/putawayController.js`

**Changes**:
- Detects ASN box ID format (`PAW-ASN-*`)
- Calls `validateForPutaway` with `allowAsnBoxId = true` for ASN putaway

```javascript
if (inputId) {
  // Check if this might be ASN putaway (PAW-ASN-* format)
  const isAsnBoxId = String(inputId).trim().toUpperCase().startsWith('PAW-ASN');
  
  // Validate for putaway - allow PAW-ASN-* format for ASN putaway
  const validated = validateForPutaway(inputId, isAsnBoxId);
  // ...
}
```

---

## 📋 ASN vs Transfer In Putaway

| Aspect | ASN Putaway | Transfer In Putaway |
|--------|-------------|---------------------|
| **Box ID Format** | `PAW-ASN-*` or `PAW-ASN*` | `CTN-TI-*` |
| **Carton ID Format** | N/A (box_id is not a carton_id) | `CTN-TI-*` (same as box_id) |
| **Validation** | Accept `PAW-ASN-*` as `box_id` | Accept `CTN-TI-*` as `carton_id`/`box_id` |
| **Source** | From sorting process (`tabSortBox`) | From receiving process (`tabSortBox`) |

---

## ✅ Expected Behavior After Fix

**Before Fix:**
- ❌ ASN box ID `PAW-ASN365425479-1768995821165` → Rejected (must start with "CTN-")

**After Fix:**
- ✅ ASN box ID `PAW-ASN365425479-1768995821165` → Accepted as `box_id`
- ✅ Transfer In carton ID `CTN-TI-123457-20260120-160936-988` → Accepted as `carton_id`/`box_id`
- ✅ Old formats `TI-PUT-*`, `PUT-*` → Still rejected

---

## 🧪 Testing

### Test 1: ASN Putaway with PAW-ASN-* format

**Request:**
```json
POST /api/putaway/scan-transfer-carton
{
  "box_id": "PAW-ASN365425479-1768995821165",
  "location_id": "A1-R01-L2-B1",
  "user_id": "USER-402498"
}
```

**Expected**: ✅ Validation passes, returns box information from `tabSortBox`

### Test 2: Transfer In Putaway with CTN-TI-* format

**Request:**
```json
POST /api/putaway/scan-transfer-carton
{
  "carton_id": "CTN-TI-123457-20260120-160936-988",
  "location_id": "A1-R01-L2-B1",
  "user_id": "USER-402498"
}
```

**Expected**: ✅ Validation passes, returns box information from `tabSortBox`

### Test 3: Invalid format (TI-PUT-*)

**Request:**
```json
POST /api/putaway/scan-transfer-carton
{
  "box_id": "TI-PUT-123",
  "location_id": "A1-R01-L2-B1"
}
```

**Expected**: ❌ Validation fails with error: "Putaway requires carton ID (CTN-* format). Old format (TI-PUT-* or PUT-*) is no longer supported."

---

## 📝 Summary

- **Issue**: ASN box ID `PAW-ASN-*` format was rejected by validation
- **Root Cause**: Validation only accepted `CTN-*` format for all putaway types
- **Fix**: Added support for `PAW-ASN-*` format as valid `box_id` for ASN putaway
- **Result**: ASN putaway now accepts `PAW-ASN-*` format, Transfer In still uses `CTN-TI-*` format

---

## ⚠️ Important Notes

1. **ASN Putaway**: 
   - Use `box_id` parameter with `PAW-ASN-*` format
   - `carton_id` will be `null` (looked up from `tabSortBox`)

2. **Transfer In Putaway**:
   - Use `carton_id` or `box_id` parameter with `CTN-TI-*` format
   - `box_id = carton_id` (same value)

3. **Old Formats**:
   - `TI-PUT-*` and `PUT-*` formats are still rejected
   - Must use proper carton/box ID format
