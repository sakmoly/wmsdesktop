# Relocation: FROM Bin + FROM Carton Validation Compliance

**Date**: 2026-01-16  
**Status**: ✅ **COMPLIANT** with DESKTOP FIX.md

---

## Requirements from DESKTOP FIX.md

When user scans:
1. FROM Bin Location (`bin_location`)
2. FROM Carton ID (`carton_id`)

The backend must validate:
- ✅ `carton_id` exists
- ✅ `carton_id` is currently located in `bin_location` (authoritative)
- ✅ If not matching, return `ok: false` with clear `error_code`
- ✅ DO NOT allow session to continue

### Data Source (Authoritative):
- ✅ Use `tabCartonStock` (preferred) or `tabCarton.current_bin_id` if reliable
- ✅ Rule: carton is in bin if EXISTS `tabCartonStock` rows where `carton_id=:carton_id` AND `bin_location=:bin_location`

---

## Implementation Status

### ✅ Validation Location

**File:** `wms-api/src/modules/relocation/relocationController.js`  
**Function:** `setRelocationFrom` (lines ~291-360)

**Validation Applied:** Inside existing endpoint `/api/relocation/session/:session_id/from` (Option B from DESKTOP FIX.md)

---

## Validation Logic (4 Steps)

### Step 1: Find Carton's Actual Location

**Preferred Source:** `tabCartonStock` (per DESKTOP FIX.md)
```sql
SELECT DISTINCT bin_location, warehouse
FROM tabCartonStock
WHERE carton_id = ?
  AND bin_location IS NOT NULL
LIMIT 1
```

**Fallback:** `tabCarton.current_bin_id` or `bin_id`
```sql
SELECT current_bin_id as bin_location, warehouse
FROM tabCarton
WHERE carton_id = ?
```

### Step 2: Validate Carton Exists

**If carton not found:**
```json
{
  "ok": false,
  "error": {
    "code": "CARTON_NOT_FOUND",
    "message": "Carton CTN-... not found"
  },
  "valid": false,
  "error_code": "CARTON_NOT_FOUND"
}
```

**HTTP Status:** `400 Bad Request`

### Step 3: Validate Carton is at Scanned Bin Location

**Authoritative Check:** Use `tabCartonStock` to verify carton has stock at scanned location
```sql
SELECT COUNT(*) as cnt,
       COALESCE(SUM(qty), 0) as total_qty,
       COUNT(DISTINCT item_code) as items_count
FROM tabCartonStock
WHERE carton_id = ?
  AND bin_location = ?
```

**Rule:** If `cnt > 0`, carton is at scanned bin (authoritative)

**Fallback:** If `tabCartonStock` not available, compare actual location with scanned location

### Step 4: Return Error if Mismatch

**If carton not at scanned bin:**
```json
{
  "ok": false,
  "error": {
    "code": "CARTON_BIN_MISMATCH",
    "message": "Carton CTN-... is not located in bin A1-R01-L4-B1",
    "actual_bin": "A1-R02-L2-B2"
  },
  "valid": false,
  "error_code": "CARTON_BIN_MISMATCH",
  "actual_bin": "A1-R02-L2-B2"
}
```

**HTTP Status:** `400 Bad Request`

---

## Error Codes

### ✅ CARTON_NOT_FOUND
- **When:** Carton ID does not exist in `tabCarton` or `tabCartonStock`
- **Response:** `400 Bad Request`
- **Error Code:** `CARTON_NOT_FOUND`

### ✅ CARTON_BIN_MISMATCH
- **When:** Carton exists but is not located at scanned bin location
- **Response:** `400 Bad Request`
- **Error Code:** `CARTON_BIN_MISMATCH`
- **Includes:** `actual_bin` in response (helpful for user)

---

## Compliance Checklist

### ✅ Requirements from DESKTOP FIX.md:

- [x] **Server-side validation** - Done in `setRelocationFrom` endpoint
- [x] **Carton existence check** - Validates carton exists before location check
- [x] **Authoritative location check** - Uses `tabCartonStock` as preferred source
- [x] **Clear error codes** - Returns `CARTON_NOT_FOUND` and `CARTON_BIN_MISMATCH`
- [x] **Actual bin in error** - Includes `actual_bin` in mismatch error response
- [x] **Prevent session continuation** - Returns 400 error, transaction rolled back
- [x] **tabCartonStock preferred** - Checks `tabCartonStock` first (authoritative)
- [x] **Fallback to tabCarton** - Falls back to `tabCarton.current_bin_id` if needed

---

## Testing Scenarios

### Test 1: Valid Match ✅
**Input:**
- `from_bin`: `A1-R01-L4-B1`
- `from_carton`: `CTN-555445` (actually at `A1-R01-L4-B1`)

**Expected:**
- ✅ Request accepted
- ✅ Session updated with FROM location
- ✅ Response: `ok: true`

### Test 2: Carton Not Found ❌
**Input:**
- `from_bin`: `A1-R01-L4-B1`
- `from_carton`: `CTN-INVALID` (doesn't exist)

**Expected:**
- ❌ Request rejected with `CARTON_NOT_FOUND`
- ❌ Session NOT updated (transaction rolled back)
- ❌ Response: `ok: false, error_code: "CARTON_NOT_FOUND"`

### Test 3: Location Mismatch ❌
**Input:**
- `from_bin`: `A1-R02-L1-B2` (scanned)
- `from_carton`: `CTN-555445` (actually at `A1-R01-L4-B1`)

**Expected:**
- ❌ Request rejected with `CARTON_BIN_MISMATCH`
- ❌ Session NOT updated (transaction rolled back)
- ❌ Response: `ok: false, error_code: "CARTON_BIN_MISMATCH", actual_bin: "A1-R01-L4-B1"`

### Test 4: Carton Only (No Bin) ✅
**Input:**
- `from_bin`: Not provided
- `from_carton`: `CTN-555445`

**Expected:**
- ✅ Request accepted (no location validation when bin not provided)
- ✅ Session updated with carton only

### Test 5: Bin Only (No Carton) ✅
**Input:**
- `from_bin`: `A1-R01-L4-B1`
- `from_carton`: Not provided

**Expected:**
- ✅ Request accepted (no carton validation when carton not provided)
- ✅ Session updated with bin only

---

## API Implementation

### Endpoint Used: Option B (Inside Existing Endpoint)

**Endpoint:** `PUT /api/relocation/session/:session_id/from`

**Request:**
```json
{
  "from_bin": "A1-R01-L4-B1",
  "from_carton": "CTN-555445"
}
```

**Response (Success):**
```json
{
  "ok": true,
  "message": "FROM location set successfully",
  "data": {
    "session_id": "RL-20260116-123456",
    "from_bin": "A1-R01-L4-B1",
    "from_carton": "CTN-555445"
  }
}
```

**Response (Carton Not Found):**
```json
{
  "ok": false,
  "error": {
    "code": "CARTON_NOT_FOUND",
    "message": "Carton CTN-INVALID not found"
  },
  "valid": false,
  "error_code": "CARTON_NOT_FOUND"
}
```

**Response (Location Mismatch):**
```json
{
  "ok": false,
  "error": {
    "code": "CARTON_BIN_MISMATCH",
    "message": "Carton CTN-555445 is not located in bin A1-R02-L1-B2",
    "actual_bin": "A1-R01-L4-B1"
  },
  "valid": false,
  "error_code": "CARTON_BIN_MISMATCH",
  "actual_bin": "A1-R01-L4-B1"
}
```

---

## Code Implementation Details

### Validation Flow:

```javascript
// Step 1: Find carton's actual location (tabCartonStock preferred)
const [stockLocationRows] = await connection.execute(`
  SELECT DISTINCT bin_location, warehouse
  FROM tabCartonStock
  WHERE carton_id = ?
    AND bin_location IS NOT NULL
  LIMIT 1
`, [from_carton]);

// Step 2: Check if carton exists
if (!cartonFound) {
  return res.status(400).json({
    ok: false,
    error: { code: "CARTON_NOT_FOUND", ... },
    valid: false,
    error_code: "CARTON_NOT_FOUND"
  });
}

// Step 3: Validate carton is at scanned bin (authoritative check)
const [matchCheck] = await connection.execute(`
  SELECT COUNT(*) as cnt
  FROM tabCartonStock
  WHERE carton_id = ? AND bin_location = ?
`, [from_carton, from_bin]);

// Step 4: Return error if mismatch
if (matchCheck[0].cnt === 0) {
  return res.status(400).json({
    ok: false,
    error: { 
      code: "CARTON_BIN_MISMATCH", 
      actual_bin: cartonActualBinLocation,
      ...
    },
    valid: false,
    error_code: "CARTON_BIN_MISMATCH",
    actual_bin: cartonActualBinLocation
  });
}
```

---

## Summary

**Status:** ✅ **FULLY COMPLIANT** with DESKTOP FIX.md

**Implementation:**
- ✅ Validation applied in `setRelocationFrom` endpoint (Option B)
- ✅ Uses `tabCartonStock` as preferred authoritative source
- ✅ Validates carton existence before location check
- ✅ Returns clear error codes (`CARTON_NOT_FOUND`, `CARTON_BIN_MISMATCH`)
- ✅ Includes `actual_bin` in mismatch error response
- ✅ Prevents session continuation on validation failure
- ✅ Server-side validation (even if mobile validates too)

**The backend now fully enforces the requirement: carton must be at scanned bin location before allowing relocation to proceed!** 🎉
