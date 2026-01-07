# Material Request Item Sealed Status Update

## Issue

When a transfer carton is sealed, the Material Request items in that carton should be marked as "Sealed" so the mobile app can filter them out from the packing screen.

## Solution

Updated the `sealTransferCarton` function to:

1. Find all items in the sealed transfer carton from `tabWmsScanEvent`
2. Update the status of those Material Request items to "Sealed" in `tabMaterialRequestItem`
3. Mobile app can then filter out items with status "Sealed"

## Changes Made

### `sealTransferCarton` Function

**File:** `wms-api/src/modules/transfer-cartons/transferCartonController.js`

**Added Logic:**

```javascript
// Get all items in this sealed transfer carton from scan events
const [cartonItems] = await connection.execute(
  `
  SELECT DISTINCT item_code
  FROM tabWmsScanEvent
  WHERE tc_id = ?
    AND event_type = 'PACK_BOX_TO_TC'
    AND item_code IS NOT NULL
`,
  [tc_id]
);

// Update status of Material Request items in this sealed transfer carton to "Sealed"
if (cartonItems.length > 0) {
  const itemCodes = cartonItems.map((item) => item.item_code);
  const placeholders = itemCodes.map(() => "?").join(",");

  const [updateResult] = await connection.execute(
    `
    UPDATE tabMaterialRequestItem
    SET status = 'Sealed',
        updated_at = NOW()
    WHERE parent_title = ?
      AND item_code IN (${placeholders})
      AND status != 'Sealed'
  `,
    [materialRequest, ...itemCodes]
  );

  console.log(
    `✅ Updated ${updateResult.affectedRows} Material Request item(s) to "Sealed" status for transfer carton ${tc_id}`
  );
}
```

## Status Flow

### Item Status Values:

- **"Pending"** - Item not yet picked (`picked_qty = 0`)
- **"In Progress"** - Item partially picked (`0 < picked_qty < requested_qty`)
- **"Picked"** - Item fully picked (`picked_qty >= requested_qty`) but not yet in sealed transfer carton
- **"Sealed"** - Item is in a sealed transfer carton (should be filtered out from packing screen)

### When Transfer Carton is Sealed:

1. Find all items in the transfer carton from `tabWmsScanEvent`
2. Update those items' status to "Sealed" in `tabMaterialRequestItem`
3. Update Material Request header status if needed

## Mobile App Filtering

The mobile app should filter out items with status "Sealed" from the packing screen:

```javascript
// Filter out sealed items
const availableItems = materialRequest.items.filter(
  (item) => item.status !== "Sealed"
);
```

## API Response

When fetching Material Requests, items will now have status "Sealed" if they are in a sealed transfer carton:

```json
{
  "title": "MR-0001",
  "status": "In Progress",
  "items": [
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "requested_qty": 20.0,
      "picked_qty": 20.0,
      "status": "Sealed" // ✅ Item is in sealed transfer carton
    },
    {
      "item_code": "SKU-HAT-301-GRN-OS",
      "requested_qty": 20.0,
      "picked_qty": 20.0,
      "status": "Picked" // Item is picked but not yet in sealed transfer carton
    }
  ]
}
```

## Testing

### Test Case 1: Seal Transfer Carton

1. Pick items for Material Request
2. Pack items into transfer carton
3. Seal transfer carton
4. **Expected:** Items in sealed transfer carton have status "Sealed"
5. **Expected:** Mobile app filters out "Sealed" items from packing screen

### Test Case 2: Multiple Transfer Cartons

1. Pick items for Material Request
2. Pack items into Transfer Carton 1
3. Seal Transfer Carton 1
4. **Expected:** Items in TC1 have status "Sealed"
5. Pack remaining items into Transfer Carton 2
6. **Expected:** Items in TC2 still have status "Picked" or "In Progress"
7. Seal Transfer Carton 2
8. **Expected:** Items in TC2 now have status "Sealed"

## Next Steps

1. **Restart API Server** to load changes
2. **Update Mobile App** to filter out items with status "Sealed"
3. **Test:**
   - Seal transfer carton
   - Verify items in sealed carton have status "Sealed"
   - Verify mobile app filters out "Sealed" items
