# Putaway Box ID Validation Plan

**Date**: 2026-01-19  
**Requirement**: Update validation logic for `box_id` in ASN Putaway vs Transfer In Putaway

---

## Current Behavior

### Current Validation Logic:
```javascript
// Step 2: Validate tc_id (if provided)
if (tc_id) {
  // Validates against tabTransferCarton
}

// Step 3: Validate box_id (ONLY if tc_id is NOT provided)
if (box_id && !tc_id) {
  // Validates against tabSortBox
}
```

**Problem**: 
- `box_id` is only validated when `tc_id` is NOT provided
- For ASN Putaway, both `tc_id` and `box_id` might be provided, but `box_id` is not validated

---

## New Requirements

### 1. ASN Putaway
- ✅ **`box_id` should ALWAYS be validated from `tabSortBox.box_id`** (if provided)
- ✅ **`tc_id` should be validated from `tabTransferCarton`** (if provided)
- ✅ **Both can be provided together** - both should be validated

### 2. Transfer In Putaway
- ✅ **`box_id` validation is NOT required** (skip validation)
- ✅ **`tc_id` should be validated from `tabTransferCarton`** (if provided)

---

## How to Distinguish ASN vs Transfer In Putaway

### Option 1: Check `tc_id` format/prefix
- **ASN Putaway**: `tc_id` starts with `PAW-ASN` or `ASN-`
- **Transfer In Putaway**: `tc_id` starts with `CTN-TI-` or `TI-`

### Option 2: Check `tabTransferCarton` table
- Query `tabTransferCarton` to get `advance_shipping_notice` or `source_type`
- If `advance_shipping_notice` exists → ASN Putaway
- If `source_type = 'Transfer In'` → Transfer In Putaway

### Option 3: Check request parameter
- Add optional `source_type` or `putaway_type` parameter to request
- Values: `"ASN"` or `"TRANSFER_IN"`

### Option 4: Check `tabSortBox` for ASN link
- If `box_id` exists in `tabSortBox` and has `advance_shipping_notice` → ASN Putaway
- Otherwise → Transfer In Putaway

---

## Recommended Approach: Option 2 (Check tabTransferCarton)

**Why?**
- Most reliable - uses actual data from database
- No need to change API contract
- Works with existing data structure

**Logic:**
1. If `tc_id` is provided → Query `tabTransferCarton` to get `advance_shipping_notice` or `source_type`
2. If `advance_shipping_notice` exists → **ASN Putaway** → Validate `box_id` from `tabSortBox`
3. If `source_type = 'Transfer In'` or no `advance_shipping_notice` → **Transfer In Putaway** → Skip `box_id` validation

---

## Implementation Plan

### Step 1: Update `scanTransferCarton` Validation Logic

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Function**: `scanTransferCarton`

**Changes:**

1. **After validating `tc_id`**, check if it's ASN or Transfer In:
   ```javascript
   let isAsnPutaway = false;
   if (tc_id) {
     const [tcRows] = await connection.execute(
       `SELECT tc_id, status, advance_shipping_notice, source_type 
        FROM tabTransferCarton 
        WHERE tc_id = ? LIMIT 1`,
       [tc_id]
     );
     
     if (tcRows.length === 0) {
       // CARTON_NOT_FOUND error
     }
     
     // Determine if ASN or Transfer In
     const tc = tcRows[0];
     isAsnPutaway = !!(tc.advance_shipping_notice || 
                       (tc.source_type && tc.source_type !== 'Transfer In'));
   }
   ```

2. **Update `box_id` validation**:
   ```javascript
   // OLD: if (box_id && !tc_id)
   // NEW: Validate box_id for ASN Putaway (always if provided)
   if (box_id) {
     if (isAsnPutaway || !tc_id) {
       // ASN Putaway: Validate box_id from tabSortBox
       const [boxRows] = await connection.execute(
         `SELECT box_id, status FROM tabSortBox WHERE box_id = ? LIMIT 1`,
         [box_id]
       );
       
       if (boxRows.length === 0) {
         connection.release();
         return res.status(400).json({
           ok: false,
           error: {
             code: "BOX_NOT_FOUND",
             message: `Box ${box_id} not found in tabSortBox. Box must be created during sorting before ASN putaway.`,
           },
         });
       }
     }
     // Transfer In Putaway: Skip box_id validation (no error if not found)
   }
   ```

### Step 2: Update Request Validation

**Current:**
```javascript
// VALIDATION: Either tc_id or box_id is required
if (!tc_id && !box_id) {
  return res.status(400).json({
    error: { code: "VALIDATION_ERROR", message: "Either tc_id or box_id is required" }
  });
}
```

**New:**
- Keep same validation (either `tc_id` or `box_id` is required)
- But allow both to be provided for ASN Putaway

### Step 3: Update Response Structure

**Current Response:**
```json
{
  "validated": {
    "carton_id": "PAW-ASN365425473-1768831257429",
    "box_id": null,
    "location_id": "A1-R02-L1-B2"
  }
}
```

**New Response (ASN Putaway with both):**
```json
{
  "validated": {
    "carton_id": "PAW-ASN365425473-1768831257429",
    "box_id": "BOX-WHMAIN-514364",  // ✅ Now validated and included
    "location_id": "A1-R02-L1-B2",
    "putaway_type": "ASN"  // Optional: indicate type
  }
}
```

---

## Detailed Implementation Code

### Updated `scanTransferCarton` Function:

```javascript
export const scanTransferCarton = async (req, res) => {
  const { tc_id, box_id, location_id, user_id } = req.body;

  // VALIDATION: location_id is required
  if (!location_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "location_id is required",
      },
    });
  }

  // VALIDATION: Either tc_id or box_id is required
  if (!tc_id && !box_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Either tc_id (carton_id) or box_id is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    // VALIDATION ONLY - No transaction needed (no database writes)
    
    // Step 1: Validate location_id exists
    let locationInfo = null;
    try {
      locationInfo = await lookupLocationFromId(connection, location_id);
    } catch (error) {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "LOCATION_NOT_FOUND",
          message: `Location ID "${location_id}" not found or not available`,
          details: error.message,
        },
      });
    }

    // Step 2: Validate tc_id and determine putaway type
    let isAsnPutaway = false;
    if (tc_id) {
      // Check if columns exist for advance_shipping_notice and source_type
      const [tcColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabTransferCarton' 
        AND COLUMN_NAME IN ('advance_shipping_notice', 'source_type')
      `);
      
      const hasAsnColumn = tcColumns.some(col => col.COLUMN_NAME === 'advance_shipping_notice');
      const hasSourceTypeColumn = tcColumns.some(col => col.COLUMN_NAME === 'source_type');
      
      let selectQuery = `SELECT tc_id, status`;
      if (hasAsnColumn) selectQuery += `, advance_shipping_notice`;
      if (hasSourceTypeColumn) selectQuery += `, source_type`;
      selectQuery += ` FROM tabTransferCarton WHERE tc_id = ? LIMIT 1`;
      
      const [tcRows] = await connection.execute(selectQuery, [tc_id]);

      if (tcRows.length === 0) {
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "CARTON_NOT_FOUND",
            message: `Transfer carton ${tc_id} not found. Carton must be created during receiving before putaway.`,
          },
        });
      }
      
      // Determine if ASN or Transfer In Putaway
      const tc = tcRows[0];
      if (hasAsnColumn && tc.advance_shipping_notice) {
        isAsnPutaway = true;
      } else if (hasSourceTypeColumn) {
        isAsnPutaway = (tc.source_type !== 'Transfer In');
      } else {
        // Fallback: If no columns, assume ASN if tc_id format suggests ASN
        isAsnPutaway = tc_id.includes('ASN') || tc_id.startsWith('PAW-ASN');
      }
    } else {
      // If no tc_id, assume ASN putaway (box_id only scenario)
      isAsnPutaway = true;
    }

    // Step 3: Validate box_id (for ASN Putaway only)
    if (box_id) {
      if (isAsnPutaway) {
        // ASN Putaway: Validate box_id from tabSortBox
        const [boxRows] = await connection.execute(
          `SELECT box_id, status FROM tabSortBox WHERE box_id = ? LIMIT 1`,
          [box_id]
        );

        if (boxRows.length === 0) {
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: "BOX_NOT_FOUND",
              message: `Box ${box_id} not found in tabSortBox. Box must be created during sorting before ASN putaway.`,
            },
          });
        }
      }
      // Transfer In Putaway: Skip box_id validation (no error)
    }

    // All validations passed - return success
    connection.release();
    return res.status(200).json({
      ok: true,
      message: "Validation successful",
      validated: {
        carton_id: tc_id || null,
        box_id: box_id || null,
        location_id: location_id,
        location: {
          location_id: locationInfo.location_id,
          zone: locationInfo.zone || null,
          aisle: locationInfo.aisle || null,
          rack: locationInfo.rack,
          level: locationInfo.level || null,
          bin: locationInfo.bin,
        },
        putaway_type: isAsnPutaway ? "ASN" : "TRANSFER_IN", // Optional: indicate type
      },
      ready_for_completion: true,
    });
  } catch (error) {
    connection.release();
    logger.error("Failed to validate transfer carton for putaway", {
      errorType: error?.constructor?.name || "Unknown",
      message: error?.message || "Unknown error",
      stack: error?.stack,
      requestBody: {
        tc_id: tc_id || null,
        box_id: box_id || null,
        location_id: location_id || null,
        user_id: user_id || null,
      },
    });
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to validate transfer carton for putaway",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  }
};
```

---

## Test Cases

### Test Case 1: ASN Putaway with both tc_id and box_id
**Request:**
```json
{
  "tc_id": "PAW-ASN365425473-1768831257429",
  "box_id": "BOX-WHMAIN-514364",
  "location_id": "A1-R02-L1-B2"
}
```
**Expected:**
- ✅ `tc_id` validated from `tabTransferCarton`
- ✅ `box_id` validated from `tabSortBox`
- ✅ Both included in response

### Test Case 2: ASN Putaway with only box_id
**Request:**
```json
{
  "box_id": "BOX-WHMAIN-514364",
  "location_id": "A1-R02-L1-B2"
}
```
**Expected:**
- ✅ `box_id` validated from `tabSortBox`
- ✅ Response includes `box_id`

### Test Case 3: Transfer In Putaway with tc_id and box_id
**Request:**
```json
{
  "tc_id": "CTN-TI-0001-20260116-161713-261",
  "box_id": "SOME-BOX-ID",
  "location_id": "A1-R02-L1-B2"
}
```
**Expected:**
- ✅ `tc_id` validated from `tabTransferCarton`
- ⚠️ `box_id` validation SKIPPED (no error if not found)
- ✅ Response includes both (but `box_id` not validated)

### Test Case 4: Transfer In Putaway with only tc_id
**Request:**
```json
{
  "tc_id": "CTN-TI-0001-20260116-161713-261",
  "location_id": "A1-R02-L1-B2"
}
```
**Expected:**
- ✅ `tc_id` validated from `tabTransferCarton`
- ✅ Response includes `tc_id`

---

## Summary

### Changes Required:
1. ✅ **Detect ASN vs Transfer In** - Check `tabTransferCarton.advance_shipping_notice` or `source_type`
2. ✅ **ASN Putaway** - Always validate `box_id` from `tabSortBox` if provided
3. ✅ **Transfer In Putaway** - Skip `box_id` validation (no error if not found)
4. ✅ **Allow both tc_id and box_id** - For ASN Putaway, both can be provided

### Files to Modify:
- `wms-api/src/modules/putaway/putawayController.js` - `scanTransferCarton` function

### Testing:
- Test ASN Putaway with both `tc_id` and `box_id`
- Test ASN Putaway with only `box_id`
- Test Transfer In Putaway with `tc_id` and `box_id` (box_id should not be validated)
- Test Transfer In Putaway with only `tc_id`

---

**Status**: 📋 **PLAN READY FOR IMPLEMENTATION**
