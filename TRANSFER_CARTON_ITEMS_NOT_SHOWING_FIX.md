# Transfer Carton Items Not Showing - Fix

## Issue
Transfer Carton `TC-MR-0001-1767520301021` is sealed and appears in the desktop app, but the "Carton Contents" section shows "Items: 0 Unique SKUs: 0 Total Pieces: 0". Items were packed via mobile app but aren't showing in desktop app.

## Root Cause
The desktop app's `TransferCartonService.GetCartonContentsAsync()` queries for events with:
- `tc_id = @tc_id`
- `event_type = 'PACK_BOX_TO_TC'`
- `item_code IS NOT NULL`

However, for Material Request transfer cartons:
1. Events might not have `tc_id` populated correctly
2. The fallback logic only works for regular Transfer Orders (requires ASN), but Material Request transfer cartons have `asn_no = NULL`

## Solution Applied

**File:** `Services/TransferCartonService.cs`

**Added Material Request-specific fallback logic:**

1. **Detect Material Request Transfer Carton:**
   - Check if `transfer_order` or `to_no` starts with "MR-" or matches pattern "MR-XXXX"

2. **Find Events by Material Request Number:**
   - Query `tabWmsScanEvent` for events where:
     - `transfer_order = MR number` OR `material_request = MR number`
     - `event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')`
     - `item_code IS NOT NULL`
   - Optionally use time window around TC creation/seal time to narrow results

3. **Group and Sum Items:**
   - Group by `item_code` and `source_carton` (box_id or carton_id)
   - Sum quantities for same item+carton combinations

## Code Changes

### Before:
- Fallback only worked if ASN was present
- Material Request transfer cartons (ASN = NULL) had no fallback

### After:
- Added Material Request detection
- Added fallback query by `transfer_order`/`material_request` field
- Added time window filtering (optional, if TC creation/seal times available)
- Supports both `PACK_BOX_TO_TC` and `PACK_ITEM_TO_TC` event types

## Testing

### Steps to Verify:
1. **Rebuild Desktop Application:**
   ```bash
   dotnet build
   ```

2. **Restart Desktop Application**

3. **Open Transfer Carton Details:**
   - Navigate to Transfer Cartons
   - Open `TC-MR-0001-1767520301021`
   - Check "Carton Contents" section

4. **Expected Result:**
   - Items should now appear in the "Carton Contents" table
   - Item Code, Source Carton, Quantity, Packed By, Packed On should be populated
   - Summary should show correct counts: "Items: X Unique SKUs: Y Total Pieces: Z"

## Mobile App Requirements

To ensure items show correctly, mobile app must send events with:

### Required Fields:
- `event_type`: `"PACK_BOX_TO_TC"` or `"PACK_ITEM_TO_TC"`
- `tc_id`: Transfer Carton ID (e.g., `"TC-MR-0001-1767520301021"`)
- `transfer_order`: Material Request number (e.g., `"MR-0001"`)
- `item_code`: Item code (REQUIRED - cannot be null)
- `qty`: Quantity (REQUIRED)

### Recommended Fields:
- `material_request`: Material Request number (as backup if `transfer_order` is missing)
- `box_id`: Box ID if packing boxes
- `carton_id`: Carton ID if packing cartons
- `event_time`: Timestamp (should be around TC creation/seal time)

### Example Event:
```json
{
  "event_type": "PACK_BOX_TO_TC",
  "event_time": "2026-01-04T12:52:00Z",
  "device_id": "DEVICE-001",
  "user_id": "USER-150526",
  "item_code": "SKU-HAT-301-RED-OS",
  "qty": 20.00,
  "store": "STORE-001",
  "tc_id": "TC-MR-0001-1767520301021",
  "transfer_order": "MR-0001",
  "material_request": "MR-0001"
}
```

## Troubleshooting

### If Items Still Don't Show:

1. **Check Events in Database:**
   ```sql
   SELECT event_type, tc_id, transfer_order, material_request, item_code, qty, event_time
   FROM tabWmsScanEvent
   WHERE transfer_order = 'MR-0001' OR material_request = 'MR-0001'
   ORDER BY event_time DESC;
   ```

2. **Check Transfer Carton Details:**
   ```sql
   SELECT tc_id, to_no, transfer_order, asn_no, store, created_on, sealed_on
   FROM tabTransferCarton
   WHERE tc_id = 'TC-MR-0001-1767520301021';
   ```

3. **Check Desktop App Logs:**
   - Look for `TransferCartonService` log messages
   - Check for "Material Request transfer carton detected" message
   - Check for "Found X items for Material Request" message

4. **Verify Event Format:**
   - Ensure `item_code` is NOT NULL in events
   - Ensure `event_type` is `PACK_BOX_TO_TC` or `PACK_ITEM_TO_TC`
   - Ensure `transfer_order` or `material_request` matches Material Request number

## Related Files
- `Services/TransferCartonService.cs` - Added Material Request fallback logic
- `wms-api/src/modules/events/eventController.js` - Event processing (should populate `tc_id`)

