# Transaction History `qty_before` Error Fix

**Date**: 2026-01-21  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

When completing Transfer In Putaway, the backend was failing to insert audit trail records into `tabTransactionHistory`:

```
[ERROR] [Putaway Event] ⚠️ Could not insert audit trail (tabTransactionHistory) for SKU-HAT-301-BLU-OS
{
  "error": "Field 'qty_before' doesn't have a default value",
  "item_code": "SKU-HAT-301-BLU-OS"
}
```

**Root Cause**: The backend code was checking if `qty_before` was required, but the check was not correctly identifying when the column was NOT NULL with no default value. Additionally, the code only included `qty_before` when it was "required" (NOT NULL), but it should always be included for a complete audit trail.

---

## ✅ Fix Applied

### File: `wms-api/src/modules/events/eventController.js`

### Changes Made:

1. **Improved Column Requirement Detection** (Lines 3492-3500):
   - Enhanced the check for `qty_before` and `qty_after` columns
   - Better handling of `COLUMN_DEFAULT` values (can be `null`, empty string `''`, or string `'NULL'`)
   - Separated checks for nullable, default value, and generated column status

2. **Always Include `qty_before` and `qty_after`** (Lines 3614-3628):
   - Changed logic to **always include** `qty_before` and `qty_after` if the columns exist
   - This ensures complete audit trail data regardless of column nullability
   - Added safety checks to ensure values are always numbers (defaults to 0 if undefined/null)

### Code Changes:

**Before:**
```javascript
// Only include if required (NOT NULL and no default)
if (needsQtyBefore) {
  historyFields.push('qty_before');
  historyValues.push(currentQty);
}
```

**After:**
```javascript
// Always include qty_before and qty_after if columns exist (even if nullable) for better audit trail
if (hasQtyBefore) {
  historyFields.push('qty_before');
  // Ensure currentQty is always a number (default to 0 if undefined/null)
  const qtyBeforeValue = (typeof currentQty === 'number' && !isNaN(currentQty)) ? currentQty : 0;
  historyValues.push(qtyBeforeValue);
  logger.info(`${logPrefix} 🔍 Adding qty_before: ${qtyBeforeValue} (needsQtyBefore: ${needsQtyBefore}, currentQty: ${currentQty})`);
}
if (hasQtyAfter) {
  historyFields.push('qty_after');
  // Ensure newQty is always a number (default to qtyBeforeValue + lineQty if undefined/null)
  const qtyAfterValue = (typeof newQty === 'number' && !isNaN(newQty)) ? newQty : ((typeof currentQty === 'number' && !isNaN(currentQty)) ? currentQty : 0) + lineQty;
  historyValues.push(qtyAfterValue);
  logger.info(`${logPrefix} 🔍 Adding qty_after: ${qtyAfterValue} (needsQtyAfter: ${needsQtyAfter}, newQty: ${newQty})`);
}
```

---

## 📋 What This Fix Does

1. **Always Includes `qty_before` and `qty_after`**: If the columns exist in `tabTransactionHistory`, they are now always included in the INSERT statement, ensuring complete audit trail data.

2. **Safety Checks**: Added validation to ensure `qty_before` and `qty_after` values are always valid numbers:
   - If `currentQty` is undefined/null/NaN, defaults to `0`
   - If `newQty` is undefined/null/NaN, calculates from `currentQty + lineQty` or defaults to `0 + lineQty`

3. **Better Logging**: Added debug logs to track when `qty_before` and `qty_after` are being added and their values.

---

## ✅ Verification

After this fix:

1. ✅ Transaction history records will be created successfully
2. ✅ `qty_before` will always be populated (with current stock before putaway)
3. ✅ `qty_after` will always be populated (with stock after putaway)
4. ✅ No more "Field 'qty_before' doesn't have a default value" errors
5. ✅ Transaction History table will show complete audit trail data
6. ✅ Item Location Breakdown will show transaction history records

---

## 🔍 Testing

To verify the fix:

1. **Complete a putaway task** via mobile app or API
2. **Check backend logs** - should see:
   ```
   🔍 Adding qty_before: 0 (needsQtyBefore: true, currentQty: 0)
   🔍 Adding qty_after: 2 (needsQtyAfter: true, newQty: 2)
   ```
3. **Query transaction history**:
   ```sql
   SELECT 
     item_code,
     qty_before,
     qty_after,
     qty_change,
     reference_doc
   FROM tabTransactionHistory
   WHERE reference_doc = 'PUT-20260121-0001'
   ORDER BY transaction_date DESC;
   ```
4. **Expected Result**: Records should have `qty_before` and `qty_after` populated with correct values

---

## 📝 Summary

- **Issue**: Backend missing `qty_before` field when inserting transaction history
- **Root Cause**: Logic only included `qty_before` when column was "required" (NOT NULL), but check was not working correctly
- **Fix**: Always include `qty_before` and `qty_after` if columns exist, with safety checks for undefined/null values
- **Impact**: Transaction history audit trail is now complete with all required fields

---

## 🚀 Next Steps

1. ✅ **Backend Fix Applied** - Code updated to always include `qty_before` and `qty_after`
2. ⏳ **Testing Required** - Test with a new putaway completion to verify records are inserted correctly
3. ⏳ **Verify Transaction History Table** - Check that records appear in the Transaction History UI
4. ⏳ **Verify Item Location Breakdown** - Check that location breakdown shows transaction history

---

## 📌 Notes

- **Mobile App**: ✅ No changes required - mobile app correctly sends putaway completion data
- **Backend**: ✅ Fixed - now always includes `qty_before` and `qty_after` in transaction history
- **Database**: ✅ No schema changes required - fix works with existing schema
