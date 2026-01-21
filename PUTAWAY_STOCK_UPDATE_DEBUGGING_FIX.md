# Putaway Stock Update - Debugging and Fix

**Date**: 2026-01-19  
**Issue**: Stock still not updating after putaway completion

---

## Fixes Applied

### Fix 1: Validation Logic - Accept location_id OR rack/bin

**Problem**: Validation required BOTH `location_id` AND `rack` to be valid, but if `rack` was still 'TBD' after update, validation failed.

**Solution**: Changed validation to accept EITHER:
- Valid `location_id` (preferred), OR
- Valid `rack` AND `bin` (fallback)

**Code Location**: Line 2528-2540

**Before**:
```javascript
const hasValidLocation = binLocation && 
                        binLocation.trim() !== '' && 
                        binLocation.trim().toUpperCase() !== 'TBD' &&
                        !binLocation.includes('TBD') &&
                        rack && rack.trim() !== '' && rack.trim().toUpperCase() !== 'TBD';
```

**After**:
```javascript
const hasValidLocationId = binLocation && 
                           binLocation.trim() !== '' && 
                           binLocation.trim().toUpperCase() !== 'TBD' &&
                           !binLocation.includes('TBD');
                           
const hasValidRackBin = rack && rack.trim() !== '' && rack.trim().toUpperCase() !== 'TBD' &&
                        bin && bin.trim() !== '' && bin.trim().toUpperCase() !== 'TBD';
                        
// Location is valid if either location_id is valid OR rack/bin are valid
const hasValidLocation = hasValidLocationId || hasValidRackBin;
```

---

### Fix 2: Stock Update Loop - Better Location Validation

**Problem**: Stock update loop checked `if (!rack && !bin)` which would skip lines with only `location_id`.

**Solution**: Check for valid location using `location_id` OR `rack/bin`.

**Code Location**: Line 2593-2611

**Before**:
```javascript
if (!rack && !bin) {
  console.error(`[Putaway] ERROR: Line without location passed validation: ${itemCode}`);
  continue; // Skip lines without location
}
```

**After**:
```javascript
const hasLocationId = line.location_id && 
                     line.location_id.trim() !== '' && 
                     line.location_id.trim().toUpperCase() !== 'TBD';
const hasRack = rack && rack.trim() !== '' && rack.trim().toUpperCase() !== 'TBD';
const hasBin = bin && bin.trim() !== '' && bin.trim().toUpperCase() !== 'TBD';

if (!hasLocationId && !hasRack && !hasBin) {
  logger.error(`[Putaway] ERROR: Line without valid location passed validation: ${itemCode}`, {
    location_id: line.location_id || 'NULL',
    rack: rack || 'NULL',
    bin: bin || 'NULL'
  });
  continue; // Skip lines without valid location
}
```

---

### Fix 3: Enhanced Logging

**Added comprehensive logging** to track:
1. Lines being processed
2. Stock update loop entry
3. Each stock update completion
4. Summary of stock updates
5. Warning if no stock updates processed

**Code Locations**:
- Line 2590-2605: Log before stock update loop
- Line 3093-3103: Log after each stock update
- Line 3105-3125: Log summary (warning if no updates)

---

## Testing Steps

### Step 1: Check Backend Logs

After calling `completePutaway`, check logs for:

1. **Lines Update Log**:
   ```
   [Putaway] Updating X putaway line(s) with TBD locations using header location_id: A1-R02-L1-B2
   ```

2. **Stock Update Loop Entry**:
   ```
   [Putaway] Starting stock update loop for X line(s)
   ```

3. **Each Stock Update**:
   ```
   [Putaway] ✅ Stock update completed for SKU-HAT-301-BLU-OS
   ```

4. **Summary**:
   ```
   [Putaway] ✅ Processed X stock update(s) for task PUT-20260119-0001
   ```

5. **Warning (if no updates)**:
   ```
   [Putaway] ⚠️ NO STOCK UPDATES PROCESSED for task PUT-20260119-0001
   ```

---

### Step 2: Test Complete Flow

**Request**:
```json
POST /api/putaway/complete
{
  "putaway_task": "PUT-20260119-0001",
  "location_id": "A1-R02-L1-B2",
  "performed_by": "USER-187561"
}
```

**Expected Logs**:
1. ✅ Lines updated with location
2. ✅ Stock update loop started
3. ✅ Stock updates processed
4. ✅ Task marked as "Completed"

---

### Step 3: Verify Stock Ledger

**Request**:
```
GET /api/stock-ledger?item_code=SKU-HAT-301-BLU-OS&bin_location=A1-R02-L1-B2
```

**Expected**:
- Entry exists with `qty > 0`
- `last_transaction_type: "Putaway"`
- `last_transaction_ref: "PUT-20260119-0001"`

---

### Step 4: Verify Transaction History

**Request**:
```
GET /api/transaction-history?reference_doc=PUT-20260119-0001&transaction_type=Putaway
```

**Expected**:
- Entry exists with `reference_doc: "PUT-20260119-0001"`
- `bin_location: "A1-R02-L1-B2"`
- `qty_change > 0`

---

## Common Issues and Solutions

### Issue 1: "NO STOCK UPDATES PROCESSED" Warning

**Possible Causes**:
1. `linesToProcess` is empty
2. All lines are being skipped in the loop
3. Validation is rejecting all lines

**Check Logs For**:
- `[Putaway] Preparing to process stock updates` - Check `lines_before_filter`
- `[Putaway] Starting stock update loop` - Check `lines_count`
- Individual line processing logs

**Solution**:
- Ensure `location_id` is provided in request
- Check that putaway lines exist in database
- Verify lines have valid `carton_id`

---

### Issue 2: Lines Have TBD Locations

**Symptom**: Lines still have `rack='TBD'` and `bin='TBD'` after update

**Check**:
- Log: `[Putaway] Updating X putaway line(s) with TBD locations`
- Verify `headerLocationInfo` is not null
- Check if update query executed successfully

**Solution**:
- Ensure `location_id` is provided in `completePutaway` request
- Check database to verify lines were updated

---

### Issue 3: Validation Failing

**Symptom**: Error: "Cannot complete putaway: some items are missing required data"

**Check Logs For**:
- `lines_with_missing_data` array
- `missing_location` vs `missing_carton_id`

**Solution**:
- Provide `location_id` in request
- Ensure all lines have `carton_id`

---

## Debugging Checklist

When stock is not updating, check:

- [ ] **Lines exist**: `GET /api/putaway/tasks` shows lines
- [ ] **Location provided**: Request includes `location_id`
- [ ] **Lines updated**: Log shows "Updating X putaway line(s) with TBD locations"
- [ ] **Stock loop started**: Log shows "Starting stock update loop for X line(s)"
- [ ] **Stock updates processed**: Log shows "Processed X stock update(s)"
- [ ] **No warnings**: No "NO STOCK UPDATES PROCESSED" warning
- [ ] **Transaction committed**: Log shows "Successfully completed putaway task"
- [ ] **Stock ledger entry**: `GET /api/stock-ledger` shows entry
- [ ] **Transaction history**: `GET /api/transaction-history` shows entry

---

## Next Steps

1. **Run test** with `completePutaway` endpoint
2. **Check backend logs** for the new diagnostic messages
3. **Identify where the flow breaks**:
   - Are lines being updated?
   - Is stock loop starting?
   - Are lines being skipped?
   - Are stock updates executing?
4. **Share logs** for further analysis

---

**Status**: ✅ **FIXES APPLIED - READY FOR TESTING**

The code now:
1. ✅ Accepts `location_id` OR `rack/bin` for validation
2. ✅ Updates TBD locations when `location_id` provided
3. ✅ Logs comprehensive diagnostics
4. ✅ Warns if no stock updates processed
