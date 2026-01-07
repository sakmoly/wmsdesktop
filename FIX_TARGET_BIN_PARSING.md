# Fix: Duplicate Putaway Lines from Incorrect target_bin Parsing

## Problem

When calling `POST /api/putaway/complete` with `target_bin: "A1-R01-L1-B1-B1"`, duplicate lines are created:
- Row 1: rack = "A1-R01-L1-B1", bin = "B1"
- Row 2: rack = "A1-R01", bin = "L1-B1"

Both represent the same location but are parsed differently, causing duplicates.

## Root Cause

The `target_bin` parsing logic was inconsistent:
- For `target_bin: "A1-R01-L1-B1-B1"` (5 parts), it was using:
  - `parts.length >= 4`: rack = first 2 parts, bin = remaining parts
  - This created: rack = "A1-R01", bin = "L1-B1-B1"

But the intended format is `rack-bin` where:
- The **last part** is always the `bin`
- Everything **before the last part** is the `rack`

## Fix Applied

Changed the parsing logic to:
- **Last part** = `bin`
- **Everything before last part** = `rack`

### Examples:
- `"A1-R01-L1-B1-B1"` → rack = `"A1-R01-L1-B1"`, bin = `"B1"` ✅
- `"A1-R01-L1-B1"` → rack = `"A1-R01-L1"`, bin = `"B1"` ✅
- `"A1-R01"` → rack = `"A1"`, bin = `"R01"` ✅
- `"RACK-A"` → rack = `"RACK"`, bin = `"A"` ✅

## Before vs After

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

## Next Steps

1. **Restart API server** to apply the fix
2. **Clean up existing duplicates** (optional):
   ```sql
   -- Run CHECK_DUPLICATE_PUTAWAY_LINES_DB.sql to find duplicates
   -- Then delete the incorrect ones manually or use the fix script
   ```

3. **Test again** with the same payload:
   ```json
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
- ✅ Only **one line** should be created
- ✅ rack = `"A1-R01-L1-B1"`, bin = `"B1"`
- ✅ No duplicates

---

**The parsing logic now correctly treats the last part as the bin, preventing duplicate lines.**

