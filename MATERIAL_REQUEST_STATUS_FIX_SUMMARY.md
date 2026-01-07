# Material Request Status and Picked Quantity Fix Summary

## ✅ Fixes Implemented

### 1. Status Auto-Correction
**Problem:** Status shows "Picked" even when all `picked_qty = 0.00`

**Solution:**
- ✅ GET endpoints now **auto-detect and fix** incorrect status
- ✅ If `status = "Picked"` but `total_picked_qty = 0`, automatically reset to "In Progress" or "Submitted"
- ✅ Status is corrected in database and returned to client

**Files Modified:**
- `wms-api/src/modules/material-request/materialRequestController.js`
  - `getMaterialRequests()` - Auto-fixes status on list
  - `getMaterialRequestByTitle()` - Auto-fixes status on detail view
  - `pickMaterialRequestItems()` - Prevents setting "Picked" when no items picked

### 2. Accurate Total Picked Quantity
**Problem:** `total_picked_qty` might not match sum of item `picked_qty`

**Solution:**
- ✅ Always calculate `total_picked_qty` from sum of item `picked_qty` values
- ✅ More accurate than using database field directly
- ✅ Ensures consistency between items and header

### 3. Status Validation on Seal
**Problem:** Status set to "Picked" even when items aren't fully picked

**Solution:**
- ✅ Seal endpoint validates `total_picked_qty > 0` before setting status to "Picked"
- ✅ Only sets "Picked" when:
  - All items fully picked (`picked_qty >= requested_qty` for all items)
  - `total_picked_qty > 0` (safety check)
  - Transfer carton is sealed

**File Modified:**
- `wms-api/src/modules/transfer-cartons/transferCartonController.js`
  - `sealTransferCarton()` - Added validation

## 🔄 How It Works Now

### When Desktop App Loads Material Request:
1. API GET request fetches Material Request
2. API calculates `total_picked_qty` from items
3. API checks: Is `status = "Picked"` but `total_picked_qty = 0`?
4. If yes: Auto-fixes status to "In Progress" or "Submitted"
5. Returns corrected status and accurate `total_picked_qty`

### When Mobile App Picks Items:
1. Mobile app calls `POST /api/material-requests/MR-0001/pick-items`
2. API updates `picked_qty` for each item
3. API recalculates `total_picked_qty` from items
4. API updates status: "Submitted" → "In Progress" (if first pick)
5. API prevents setting "Picked" if no items picked

### When Transfer Carton is Sealed:
1. Mobile app calls `POST /api/transfer-cartons/seal`
2. API checks if Material Request
3. API validates: All items picked AND `total_picked_qty > 0`
4. If valid: Sets status to "Picked"
5. If invalid: Keeps status as "In Progress"

## 📋 What You Need to Do

### 1. Restart API Server
```bash
cd wms-api
pm2 restart wms-api
# or
npm start
```

### 2. Refresh Desktop App
- Close and reopen Material Request details window
- Or refresh the Material Request list
- Status should now show correctly (not "Picked" if items aren't picked)

### 3. Test Picking (Mobile App)
The mobile app needs to call the pick-items endpoint to update `picked_qty`:

```json
POST /api/material-requests/MR-0001/pick-items
{
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 20.00,
      "source_bin": "A1-R01-L1-B1"
    }
  ]
}
```

## ✅ Expected Results

### Before Fix:
- ❌ Status: "Picked" (incorrect)
- ❌ Total Picked: 0.00
- ❌ All items: `picked_qty = 0.00`

### After Fix (No Items Picked):
- ✅ Status: "In Progress" or "Submitted" (auto-corrected)
- ✅ Total Picked: 0.00 (calculated from items)
- ✅ All items: `picked_qty = 0.00` (accurate)

### After Fix (Items Picked):
- ✅ Status: "In Progress"
- ✅ Total Picked: 40.00 (sum of item picked_qty)
- ✅ Items: `picked_qty` updated individually

## 🔍 Verification

### Check Status in Database:
```sql
SELECT 
  title,
  status,
  total_picked_qty,
  (SELECT COALESCE(SUM(picked_qty), 0) FROM tabMaterialRequestItem WHERE parent_title = tabMaterialRequest.title) as calculated_picked_qty
FROM tabMaterialRequest
WHERE title = 'MR-0001';
```

### Check Item Picking:
```sql
SELECT 
  item_code,
  requested_qty,
  picked_qty,
  (requested_qty - picked_qty) as pending_qty
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0001'
ORDER BY item_code;
```

## 📝 Important Notes

1. **Status auto-fixes on every GET request** - No manual intervention needed
2. **total_picked_qty is always calculated from items** - More accurate
3. **Status "Picked" requires validation** - Must have items picked AND carton sealed
4. **Mobile app must call pick-items endpoint** - Otherwise picked_qty stays at 0

## 🚨 If Status Still Shows "Picked" with 0.00

1. **Restart API server** - Ensures new code is loaded
2. **Refresh desktop app** - Triggers GET request which auto-fixes status
3. **Check API logs** - Look for status fix messages:
   ```
   ⚠️  Fixed Material Request MR-0001 status from "Picked" to "In Progress" (no items picked)
   ```

## 📞 Next Steps

1. ✅ Restart API server
2. ✅ Refresh desktop app
3. ✅ Verify status is corrected
4. ✅ Test picking items via mobile app
5. ✅ Verify picked_qty updates correctly

