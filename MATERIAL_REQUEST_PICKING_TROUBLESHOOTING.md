# Material Request Picking - Troubleshooting Guide

## Issue
Items are being scanned but `picked_qty` is not updating in the database.

## Event Handler Requirements

The event handler processes Material Request picking ONLY for events with:
- **`event_type`**: Must be `"SORT_TO_BOX"` OR `"PACK_BOX_TO_TC"`
- **`transfer_order`** OR **`material_request`**: Must contain Material Request number (e.g., "MR-0001")
- **`item_code`**: Item code being picked (REQUIRED)
- **`qty`**: Quantity being picked (REQUIRED)
- **`source_bin`** OR **`location_id`** OR **`rack`+`bin`**: Location where item is picked from

## Required Event Format

### ✅ Correct Event Format

```json
{
  "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
  "event_type": "PACK_BOX_TO_TC",  // ✅ Must be "SORT_TO_BOX" or "PACK_BOX_TO_TC"
  "event_time": "2026-01-03T10:35:00Z",
  "device_id": "DEVICE-001",
  "user_id": "USER-004",
  "transfer_order": "MR-0001",  // ✅ REQUIRED - Material Request number
  "item_code": "SKU-HAT-301-BLU-OS",  // ✅ REQUIRED
  "qty": 20.00,  // ✅ REQUIRED
  "store": "STORE-001",
  "tc_id": "TC-MR-0001-001",
  "source_bin": "A1-R01-L1-B1"  // ✅ REQUIRED (or location_id or rack+bin)
}
```

### Alternative: Using `material_request` Field

```json
{
  "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
  "event_type": "PACK_BOX_TO_TC",
  "event_time": "2026-01-03T10:35:00Z",
  "device_id": "DEVICE-001",
  "user_id": "USER-004",
  "material_request": "MR-0001",  // ✅ Can use this instead of transfer_order
  "item_code": "SKU-HAT-301-BLU-OS",
  "qty": 20.00,
  "source_bin": "A1-R01-L1-B1"
}
```

## Common Issues

### Issue 1: Wrong Event Type
**Problem:** Event type is not "SORT_TO_BOX" or "PACK_BOX_TO_TC"

**Solution:** Use correct event types:
- `"SORT_TO_BOX"` - When sorting items to boxes
- `"PACK_BOX_TO_TC"` - When packing boxes/items to transfer carton

### Issue 2: Missing `transfer_order` or `material_request` Field
**Problem:** Event doesn't have `transfer_order` or `material_request` field

**Solution:** Ensure event includes one of these fields with Material Request number

### Issue 3: Missing `item_code` or `qty`
**Problem:** Event doesn't have `item_code` or `qty` fields

**Solution:** Ensure event includes both `item_code` and `qty`

### Issue 4: Events Processed But Not Updating
**Problem:** Events are saved but `picked_qty` is not updated

**Solution:** Check API logs for error messages or warnings

## Debugging Steps

### 1. Check API Logs

Look for these log messages:

**Success:**
```
📦 Processing Material Request picking: MR=MR-0001, item=SKU-HAT-301-BLU-OS, qty=20, source_bin=A1-R01-L1-B1
✅ Updated picked_qty for SKU-HAT-301-BLU-OS in MR-0001: 0 → 20 (added 20), status: Picked
✅ Material Request picking processed: MR=MR-0001, item=SKU-HAT-301-BLU-OS
```

**Missing Fields:**
```
⚠️  processMaterialRequestPicking: Missing required fields. material_request=MR-0001, item_code=, qty=0
```

**Item Not Found:**
```
⚠️  Item SKU-HAT-301-BLU-OS not found in Material Request MR-0001
```

**Material Request Not Found:**
```
⚠️  Material Request MR-0001 not found
```

### 2. Verify Event Format

Check that events sent from mobile app include:
- ✅ `event_type` = "SORT_TO_BOX" or "PACK_BOX_TO_TC"
- ✅ `transfer_order` or `material_request` = "MR-0001"
- ✅ `item_code` = "SKU-HAT-301-BLU-OS"
- ✅ `qty` = 20.00
- ✅ `source_bin` or `location_id` or `rack`+`bin`

### 3. Check Database

**Check Events Table:**
```sql
SELECT 
  event_type,
  transfer_order,
  item_code,
  qty,
  source_bin,
  event_time
FROM tabWmsScanEvent
WHERE transfer_order = 'MR-0001'
  OR transfer_order LIKE 'MR-%'
ORDER BY event_time DESC
LIMIT 20;
```

**Check Material Request Items:**
```sql
SELECT 
  parent_title,
  item_code,
  requested_qty,
  picked_qty,
  status,
  updated_at
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-0001'
ORDER BY item_code;
```

### 4. Test with Direct API Call

Test if the pick-items endpoint works:

```bash
POST /api/material-requests/MR-0001/pick-items
Content-Type: application/json

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

If this works but events don't, then the event format is incorrect.

## Fixes Applied

1. ✅ Support `material_request` field (alternative to `transfer_order`)
2. ✅ Added logging for Material Request picking processing
3. ✅ Added warning logs for missing required fields
4. ✅ Updated all INSERT statements to use effective transfer_order

## Next Steps

1. **Restart API Server:**
   ```bash
   pm2 restart wms-api
   # or
   npm start
   ```

2. **Check API Logs:**
   - Look for processing messages
   - Check for error/warning messages
   - Verify event format matches requirements

3. **Verify Event Format:**
   - Ensure `event_type` is correct
   - Ensure `transfer_order` or `material_request` is present
   - Ensure `item_code` and `qty` are present

4. **Test Again:**
   - Send events from mobile app
   - Check if `picked_qty` updates
   - Verify status updates

