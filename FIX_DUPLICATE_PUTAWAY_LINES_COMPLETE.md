# Fix: Duplicate Putaway Lines in completePutaway

## Problem

When calling `POST /api/putaway/complete`, duplicate lines are being created in the database:
- Row 1: rack = "A1-R01-L1-B1", bin = "B1" (carton_id = PAW-ASN12225-1767130842524)
- Row 2: rack = "A1-R01", bin = "L1-B1" (carton_id = PAW-ASN12225-1767129206)

Both represent the same item but with different location parsing, causing duplicates.

## Root Causes

1. **Inconsistent target_bin parsing** - Fixed ✅
   - Old logic: First 2 parts = rack, remaining = bin
   - New logic: Last part = bin, everything before = rack

2. **Database check not finding existing lines** - Fixed ✅
   - The check only looked for exact rack/bin match
   - If existing line has different parsing format, it doesn't match
   - New line gets inserted instead of updating existing

3. **Missing fallback check** - Fixed ✅
   - No check for same item+carton with different location
   - Should update existing line instead of creating new one

## Fixes Applied

### 1. Fixed target_bin Parsing
**Before:**
```javascript
if (parts.length >= 4) {
  rack = parts.slice(0, 2).join('-');  // First 2 parts
  bin = parts.slice(2).join('-');      // Remaining parts
}
// "A1-R01-L1-B1-B1" → rack = "A1-R01", bin = "L1-B1-B1" ❌
```

**After:**
```javascript
if (parts.length >= 2) {
  bin = parts[parts.length - 1];                    // Last part
  rack = parts.slice(0, parts.length - 1).join('-'); // Everything before last
}
// "A1-R01-L1-B1-B1" → rack = "A1-R01-L1-B1", bin = "B1" ✅
```

### 2. Added Fallback Check for Same Item+Carton
**New Logic:**
```javascript
// First check: Exact location match
if (existingLine.length > 0) {
  // Update existing line
} else {
  // Second check: Same item+carton but different location
  const [anyExistingLine] = await connection.execute(
    `SELECT id, rack, bin FROM tabPutawayLine 
     WHERE parent_title = ? 
       AND item_code = ? 
       AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))`
  );
  
  if (anyExistingLine.length > 0) {
    // Update existing line with new location (fixes parsing mismatch)
    UPDATE tabPutawayLine SET rack = ?, bin = ? WHERE id = ?
  } else {
    // Final check before insert
    const [finalCheck] = await connection.execute(
      `SELECT id FROM tabPutawayLine 
       WHERE parent_title = ? AND item_code = ? AND rack = ? AND bin = ?`
    );
    
    if (finalCheck.length === 0) {
      // Safe to insert
      INSERT INTO tabPutawayLine ...
    }
  }
}
```

### 3. Enhanced Logging
Added console.log statements to track:
- When existing lines are found and updated
- When new lines are inserted
- When duplicates are detected and skipped

## Testing

Run the test script to verify parsing:
```bash
node TEST_PUTAWAY_COMPLETE_DEDUPLICATION.js
```

**Expected Output:**
```
✅ All parsing tests pass
✅ Deduplication keys match correctly
✅ Different cartons create different keys
```

## Next Steps

1. **Restart API server**:
   ```bash
   cd wms-api
   npm start
   ```

2. **Clean up existing duplicates** (optional):
   ```sql
   -- Run CHECK_DUPLICATE_PUTAWAY_LINES_DB.sql
   -- Then manually delete or merge duplicate lines
   ```

3. **Test again**:
   ```json
   POST /api/putaway/complete
   {
     "putaway_task": "PUT-20251230-0001",
     "performed_by": "USER-786249",
     "items": [
       {
         "item_code": "SKU-HAT-301-BLU-OS",
         "qty": 75,
         "target_bin": "A1-R01-L1-B1-B1",
         "completed": true,
         "carton_id": "PAW-ASN12225-1767129206"
       }
     ]
   }
   ```

## Expected Result

After the fix:
- ✅ Only **one line** should be created/updated
- ✅ Existing lines with different parsing format will be **updated** (not duplicated)
- ✅ Console logs will show what's happening
- ✅ `items_updated: 1` (not 2)

---

**The fix includes:**
1. ✅ Consistent target_bin parsing
2. ✅ Fallback check for same item+carton
3. ✅ Final safety check before insert
4. ✅ Enhanced logging for debugging

