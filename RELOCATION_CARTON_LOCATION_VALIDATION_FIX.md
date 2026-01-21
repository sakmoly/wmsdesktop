# Relocation: Carton Location Validation Fix

**Date**: 2026-01-16  
**Status**: ✅ **FIXED**

---

## Issue Identified

**Symptom:** System accepts a carton ID even when it doesn't match the scanned location.

**Example:**
- Carton `CTN-555445` is actually located at `A1-R01-L4-B1`
- User scans a **different location** (e.g., `A1-R02-L1-B2`) and scans carton `CTN-555445`
- System accepts the scan (but shouldn't)

**Root Cause:**
The `setRelocationFrom` endpoint does not validate that the scanned carton is actually located at the scanned `from_bin` location. It only checks if the carton exists and determines its warehouse, but does not verify the carton's current `bin_location` matches the scanned `from_bin`.

**Impact:**
- Users can accidentally move cartons from wrong locations
- Data integrity issues: Carton location data becomes incorrect
- Stock ledger and transaction history may show incorrect movements

---

## Fix Applied

### ✅ Location Validation in `setRelocationFrom`

**File:** `wms-api/src/modules/relocation/relocationController.js`  
**Function:** `setRelocationFrom` (lines ~289-342)

**Logic Added:**
When both `from_bin` and `from_carton` are provided:
1. **Check carton's actual location** in `tabCarton.current_bin_id` (or `bin_id`)
2. **Fallback to `tabCartonStock.bin_location`** if not found in `tabCarton` (Transfer In cartons)
3. **Validate match**: If carton location found, verify it matches the scanned `from_bin`
4. **Reject if mismatch**: Return error if carton is not at the scanned location
5. **Log validation**: Log validation success/failure for debugging

**Code:**
```javascript
// VALIDATION: If both from_bin and from_carton are provided, verify carton is actually at that bin location
if (from_bin && from_carton) {
  let cartonActualBinLocation = null;
  
  // Check tabCarton.current_bin_id first (preferred)
  const [cartonBinCheck] = await connection.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabCarton'
      AND COLUMN_NAME IN ('current_bin_id', 'bin_id')
  `);
  
  const hasCurrentBinId = cartonBinCheck.some(col => col.COLUMN_NAME === 'current_bin_id');
  const hasBinId = cartonBinCheck.some(col => col.COLUMN_NAME === 'bin_id');
  
  if (hasCurrentBinId || hasBinId) {
    const binColumn = hasCurrentBinId ? 'current_bin_id' : 'bin_id';
    const [cartonLocationRows] = await connection.execute(`
      SELECT ${binColumn} as bin_location
      FROM tabCarton
      WHERE carton_id = ?
    `, [from_carton]);
    
    if (cartonLocationRows.length > 0 && cartonLocationRows[0].bin_location) {
      cartonActualBinLocation = cartonLocationRows[0].bin_location;
    }
  }
  
  // Fallback: Check tabCartonStock.bin_location if not found in tabCarton
  if (!cartonActualBinLocation) {
    const [stockTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCartonStock'
    `);
    
    if (stockTableCheck.length > 0) {
      const [stockLocationRows] = await connection.execute(`
        SELECT DISTINCT bin_location
        FROM tabCartonStock
        WHERE carton_id = ?
          AND bin_location IS NOT NULL
        LIMIT 1
      `, [from_carton]);
      
      if (stockLocationRows.length > 0 && stockLocationRows[0].bin_location) {
        cartonActualBinLocation = stockLocationRows[0].bin_location;
      }
    }
  }
  
  // If carton location found, validate it matches scanned from_bin
  if (cartonActualBinLocation && cartonActualBinLocation !== from_bin) {
    await connection.rollback();
    console.log(`❌ Validation failed: Carton ${from_carton} is located at ${cartonActualBinLocation}, but scanned location is ${from_bin}`);
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: `Carton ${from_carton} is currently located at ${cartonActualBinLocation}, not at ${from_bin}. Please scan the correct location.`
      }
    });
  }
  
  // Log validation success
  if (cartonActualBinLocation && cartonActualBinLocation === from_bin) {
    console.log(`✅ Validated: Carton ${from_carton} is correctly located at ${from_bin}`);
  }
}
```

**Result:**
- ✅ Carton location validation enforced
- ✅ Clear error message when location mismatch detected
- ✅ Prevents incorrect relocation operations
- ✅ Supports both regular cartons (`tabCarton`) and Transfer In cartons (`tabCartonStock`)

---

## How It Works Now

### Scenario 1: Correct Location (Accepted)
1. Carton `CTN-555445` is at `A1-R01-L4-B1`
2. User scans location `A1-R01-L4-B1` and carton `CTN-555445`
3. **System validates:** Carton location = `A1-R01-L4-B1` ✅ Matches scanned location
4. **Result:** ✅ Request accepted, FROM location set

### Scenario 2: Wrong Location (Rejected)
1. Carton `CTN-555445` is at `A1-R01-L4-B1`
2. User scans location `A1-R02-L1-B2` and carton `CTN-555445`
3. **System validates:** Carton location = `A1-R01-L4-B1` ❌ Doesn't match scanned location `A1-R02-L1-B2`
4. **Result:** ❌ Request rejected with error:
   ```
   {
     "code": "VALIDATION_ERROR",
     "message": "Carton CTN-555445 is currently located at A1-R01-L4-B1, not at A1-R02-L1-B2. Please scan the correct location."
   }
   ```

### Scenario 3: Carton Only (No Validation)
1. User scans carton `CTN-555445` only (no `from_bin` provided)
2. **System behavior:** No location validation (carton-only scan allowed)
3. **Result:** ✅ Request accepted (location can be determined from carton)

### Scenario 4: Location Only (No Validation)
1. User scans location `A1-R01-L4-B1` only (no `from_carton` provided)
2. **System behavior:** No carton validation (location-only scan allowed)
3. **Result:** ✅ Request accepted (carton can be scanned later)

---

## Benefits

1. ✅ **Data Integrity**: Prevents moving cartons from incorrect locations
2. ✅ **User Feedback**: Clear error message tells user the correct location
3. ✅ **Error Prevention**: Catches mistakes before commit (early validation)
4. ✅ **Flexible**: Still allows carton-only or location-only scans (no validation in those cases)
5. ✅ **Schema-Aware**: Handles both `current_bin_id` and `bin_id` column names
6. ✅ **Transfer In Support**: Validates Transfer In cartons via `tabCartonStock.bin_location`

---

## Error Response

**When location mismatch detected:**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Carton CTN-555445 is currently located at A1-R01-L4-B1, not at A1-R02-L1-B2. Please scan the correct location."
  }
}
```

**HTTP Status:** `400 Bad Request`

---

## Testing

### Test 1: Correct Location
1. Ensure carton `CTN-555445` is at `A1-R01-L4-B1`
2. Scan location `A1-R01-L4-B1` and carton `CTN-555445`
3. **Expected:** ✅ Request accepted, FROM location set

### Test 2: Wrong Location
1. Ensure carton `CTN-555445` is at `A1-R01-L4-B1`
2. Scan location `A1-R02-L1-B2` and carton `CTN-555445`
3. **Expected:** ❌ Request rejected with validation error

### Test 3: Carton Not Found
1. Scan location `A1-R01-L4-B1` and carton `CTN-INVALID`
2. **Expected:** ✅ No location validation (carton doesn't exist), but may fail on warehouse lookup

### Test 4: Transfer In Carton
1. Ensure Transfer In carton `CTN-TI-0001-...` is at `A1-R01-L4-B1` (in `tabCartonStock`)
2. Scan location `A1-R02-L1-B2` and carton `CTN-TI-0001-...`
3. **Expected:** ❌ Request rejected with validation error (location mismatch)

---

**All validation issues resolved!** 🎉

Now the system will:
- ✅ Validate carton location matches scanned location
- ✅ Reject requests with location mismatches
- ✅ Provide clear error messages to users
- ✅ Prevent incorrect relocation operations
