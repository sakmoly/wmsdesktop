# Fix: Warehouse Box Filtering in Packing Screen

## Issues Identified

1. **Closed warehouse boxes appearing in Packing screen** - They should go directly to Putaway, not Packing
2. **Putaway task not being created** - Need better error handling and logging
3. **Error message confusion** - Old error messages may still be cached

## Fixes Applied

### 1. Filter Closed Warehouse Boxes from GET /api/boxes ✅

**File:** `wms-api/src/modules/boxes/boxController.js`

**Change:** Modified `getBoxes` function to exclude closed warehouse boxes from the response.

**Logic:**
- Closed boxes where `store` has `warehouse_type = 'Warehouse'` are **excluded** from Packing screen
- These boxes should go directly to Putaway, not Packing

**SQL Query Update:**
```sql
SELECT 
  b.box_id,
  b.status,
  ...
FROM tabSortBox b
LEFT JOIN tabWarehouse w ON b.store = w.code
WHERE b.advance_shipping_notice = ? AND b.store = ?
  AND NOT (
    b.status = 'Closed' 
    AND w.warehouse_type = 'Warehouse'
  )
```

**Result:** Closed warehouse boxes will NOT appear in the mobile app's Packing screen.

---

### 2. Enhanced Error Handling in closeBox ✅

**File:** `wms-api/src/modules/boxes/boxController.js`

**Changes:**
- Added comprehensive logging for putaway task creation
- Added try-catch block to prevent box close failure if putaway task creation fails
- Logs include:
  - Warehouse detection result
  - Putaway task ID generation
  - Table column checks
  - Item count from box
  - Lines created count

**Logging Output:**
```
[closeBox] Box BOX-WHMAIN-703990: store=WH-MAIN, isWarehouseBox=true, warehouse_type=Warehouse
[closeBox] Generated putaway task ID: PUT-20250101-0001 for box BOX-WHMAIN-703990
[closeBox] Table columns: hasSourceType=true, hasBoxId=true
[closeBox] Found 5 items in box BOX-WHMAIN-703990
[closeBox] ✅ Created putaway task PUT-20250101-0001 for warehouse box BOX-WHMAIN-703990 with 5 lines
```

**Error Handling:**
- If putaway task creation fails, error is logged but box close operation continues
- This prevents box close from failing due to putaway task issues

---

## Testing

### Test 1: Verify Closed Warehouse Boxes Are Filtered

**Request:**
```http
GET /api/boxes?asn=ASN-12225&store=WH-MAIN&status=Closed
```

**Expected Result:**
- Should return **empty array** `[]` if all closed boxes are warehouse boxes
- Closed warehouse boxes should NOT appear in response

### Test 2: Verify Putaway Task Creation

**Request:**
```http
POST /api/boxes/close
Content-Type: application/json

{
  "box_id": "BOX-WHMAIN-703990",
  "closed_by": "USER-001"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "box_id": "BOX-WHMAIN-703990",
  "status": "Closed",
  "message": "Box closed successfully. Putaway task created.",
  "putaway_task": "PUT-20250101-0001"
}
```

**Check Database:**
```sql
-- Verify putaway task was created
SELECT title, status, source_type, box_id, advance_shipping_notice
FROM tabPutawayTask
WHERE box_id = 'BOX-WHMAIN-703990';

-- Verify putaway lines were created
SELECT parent_title, item_code, carton_id, qty
FROM tabPutawayLine
WHERE parent_title = 'PUT-20250101-0001';
```

### Test 3: Verify Mobile App Packing Screen

**Steps:**
1. Close a warehouse box (store with `warehouse_type = 'Warehouse'`)
2. Navigate to Packing screen in mobile app
3. Check "Available Closed BOXes" section

**Expected Result:**
- Closed warehouse box should **NOT appear** in the list
- Only non-warehouse closed boxes should appear (if any)

---

## API Server Restart Required ⚠️

**IMPORTANT:** After these changes, you **MUST restart the API server** for the fixes to take effect.

```bash
# Stop the API server (Ctrl+C)
# Then restart it
cd wms-api
npm start
```

---

## Mobile App Changes Required

The mobile app should:
1. **Not show closed warehouse boxes** in Packing screen (now handled by API)
2. **Navigate to Putaway screen** when a warehouse box is closed
3. **Display putaway task** created automatically for warehouse boxes

**Note:** The API now filters out closed warehouse boxes, so the mobile app should automatically not show them. However, if the mobile app has client-side filtering, it should also filter out closed warehouse boxes.

---

## Troubleshooting

### Issue: Closed warehouse boxes still appearing in Packing screen

**Possible Causes:**
1. API server not restarted
2. Mobile app caching old data
3. Store not properly configured in `tabWarehouse` table

**Solution:**
1. Restart API server
2. Clear mobile app cache
3. Verify store configuration:
   ```sql
   SELECT code, warehouse_type
   FROM tabWarehouse
   WHERE code = 'WH-MAIN';
   ```
   Should return `warehouse_type = 'Warehouse'`

### Issue: Putaway task not created

**Check Logs:**
- Look for `[closeBox]` log messages in API server console
- Check for error messages starting with `[closeBox] ❌ ERROR`

**Verify:**
1. Box has items in `tabWmsScanEvent`:
   ```sql
   SELECT COUNT(*) as item_count
   FROM tabWmsScanEvent
   WHERE box_id = 'BOX-WHMAIN-703990'
     AND event_type = 'SORT_TO_BOX'
     AND item_code IS NOT NULL;
   ```
2. Store is configured as warehouse:
   ```sql
   SELECT warehouse_type
   FROM tabWarehouse
   WHERE code = 'WH-MAIN';
   ```

---

## Summary

✅ **Fixed:** Closed warehouse boxes are now filtered from Packing screen  
✅ **Fixed:** Enhanced error handling and logging for putaway task creation  
✅ **Fixed:** Better debugging information for troubleshooting  

**Next Steps:**
1. Restart API server
2. Test box closing for warehouse boxes
3. Verify putaway task creation
4. Verify mobile app Packing screen no longer shows closed warehouse boxes

