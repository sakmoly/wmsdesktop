# Carton ID Validation for Transfer Carton Packing

## Issue

Items are being packed into transfer cartons **without carton ID** even when carton-level inventory tracking is enabled. This causes:
- ❌ Transfer carton contents showing empty "Source Carton" (carton_id)
- ❌ Inability to track which carton the item came from
- ❌ Stock updates not properly linked to cartons

**Example:**
- Transfer Carton: `TC-MR-0001-1768152754168`
- Item: `SKU-HAT-301-BLU-OS`
- Row 1: Source Carton: `CTN-A1-R01-L3-B1-2026011` ✅ (has carton ID)
- Row 2: Source Carton: (empty) ❌ (missing carton ID)

## Solution Implemented

### 1. Added Carton ID Validation for Packing Events

**File:** `wms-api/src/modules/events/eventController.js`

**Validation Logic:**
1. ✅ **Check if carton-level mode is enabled** (tabCartonStock table exists)
2. ✅ **Require carton_id** when packing items if carton-level mode is enabled
3. ✅ **Validate carton exists** in `tabCartonStock` for the item being packed
4. ✅ **Validate carton is in correct bin** if bin location is provided
5. ✅ **Reject events without carton_id** with clear error message

**Key Code Changes:**

```javascript
// Validate carton_id requirement for carton-level inventory mode
if ((event_type === 'PACK_BOX_TO_TC' || event_type === 'PACK_ITEM_TO_TC') && item_code) {
  const [cartonStockTable] = await connection.execute(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabCartonStock'
  `);
  
  const isCartonLevelMode = cartonStockTable.length > 0;
  
  if (isCartonLevelMode) {
    // Carton-level mode: carton_id is REQUIRED
    if (!carton_id || carton_id.trim() === '') {
      console.warn(`⚠️  Rejecting ${event_type} event: carton_id is required for carton-level inventory tracking. Item: ${item_code}`);
      errors.push({
        offline_uuid: offline_uuid || 'MISSING',
        error: `Carton ID is required when packing items in carton-level inventory mode. Item: ${item_code}`
      });
      continue; // Skip this event
    }
    
    // Validate that the carton exists in tabCartonStock for this item
    if (source_bin || location_id || (rack && bin)) {
      const binLocation = source_bin || location_id || (rack && bin ? `${rack}-${bin}` : null);
      
      if (binLocation) {
        const [cartonStock] = await connection.execute(`
          SELECT carton_id, item_code, bin_location, qty
          FROM tabCartonStock
          WHERE carton_id = ? 
            AND item_code = ?
            AND bin_location = ?
            AND qty > 0
            AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
          LIMIT 1
        `, [carton_id.trim(), item_code, binLocation]);
        
        if (cartonStock.length === 0) {
          console.warn(`⚠️  Rejecting ${event_type} event: Carton ${carton_id} not found in bin ${binLocation} for item ${item_code}`);
          errors.push({
            offline_uuid: offline_uuid || 'MISSING',
            error: `Carton ${carton_id} not found in bin ${binLocation} for item ${item_code}. Please verify the carton exists at this location.`
          });
          continue; // Skip this event
        }
      }
    }
  }
}
```

### 2. Added Carton ID Validation for Box Expansion

When a box is packed into a transfer carton, the box contents are expanded into item-level events. Each item from the box **must also have a carton_id** if carton-level mode is enabled.

**Validation Added:**
```javascript
// Check if carton-level mode is enabled (for validation)
const [cartonStockTable] = await connection.execute(`
  SELECT TABLE_NAME 
  FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabCartonStock'
`);
const isCartonLevelMode = cartonStockTable.length > 0;

// Create one PACK_BOX_TO_TC event per item
for (const [key, item] of contentsMap.entries()) {
  // Validate carton_id if carton-level mode is enabled
  if (isCartonLevelMode && (!item.carton_id || item.carton_id.trim() === '')) {
    console.warn(`⚠️  Rejecting PACK_BOX_TO_TC event from box ${box_id}: carton_id is required for item ${item.item_code} in carton-level inventory mode`);
    errors.push({
      offline_uuid: offline_uuid || 'MISSING',
      error: `Carton ID is required when packing item ${item.item_code} in carton-level inventory mode. Box: ${box_id}`
    });
    continue; // Skip this item
  }
  // ... rest of event creation
}
```

## Validation Rules

### When Carton-Level Mode is Enabled (`tabCartonStock` table exists):

1. ✅ **carton_id is REQUIRED** for `PACK_BOX_TO_TC` and `PACK_ITEM_TO_TC` events when `item_code` is provided
2. ✅ **carton_id must exist** in `tabCartonStock` for the item being packed
3. ✅ **carton must be in correct bin** if bin location (`source_bin`, `location_id`, or `rack`/`bin`) is provided
4. ✅ **carton must have stock** (qty > 0) and status = 'PUTAWAY' or NULL
5. ✅ **Reject events without carton_id** with clear error message

### When Bin-Level Mode is Enabled (`tabCartonStock` table does not exist):

- ✅ **carton_id is optional** (validation is skipped)
- ✅ Events are processed normally

## Error Messages

### Missing Carton ID
```
"Carton ID is required when packing items in carton-level inventory mode. Item: SKU-HAT-301-BLU-OS"
```

### Carton Not Found
```
"Carton CTN-A1-R01-L3-B1-2 not found in bin A1-R01-L3-B1 for item SKU-HAT-301-BLU-OS. Please verify the carton exists at this location."
```

### Carton Not in Stock
```
"Carton CTN-A1-R01-L3-B1-2 not found in stock for item SKU-HAT-301-BLU-OS. Please verify the carton exists."
```

## Mobile App Requirements

When packing items into transfer cartons, the mobile app **MUST**:

1. **Include carton_id** in packing events:
   ```json
   {
     "event_type": "PACK_ITEM_TO_TC",
     "item_code": "SKU-HAT-301-BLU-OS",
     "carton_id": "CTN-A1-R01-L3-B1-20260111-162835-760",  // ✅ REQUIRED
     "qty": 1,
     "tc_id": "TC-MR-0001-1768152754168",
     "source_bin": "A1-R01-L3-B1"
   }
   ```

2. **Validate carton_id before packing**:
   - Check if carton exists for the item
   - Check if carton is in the correct bin location
   - Show error to user if carton_id is missing or invalid

3. **Handle validation errors gracefully**:
   - Display error message to user
   - Prevent packing if validation fails
   - Allow user to scan/select correct carton

## API Response Format

When validation fails, the API returns:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Carton ID is required when packing items in carton-level inventory mode. Item: SKU-HAT-301-BLU-OS"
  },
  "failed_events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "error": "Carton ID is required when packing items in carton-level inventory mode. Item: SKU-HAT-301-BLU-OS"
    }
  ]
}
```

## Testing

### Test Case 1: Pack Item Without Carton ID (Should Fail)
```json
POST /api/events/batch
{
  "events": [
    {
      "event_type": "PACK_ITEM_TO_TC",
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "",  // ❌ Empty - should fail
      "qty": 1,
      "tc_id": "TC-MR-0001-1768152754168"
    }
  ]
}
```
**Expected:** Validation error - "Carton ID is required..."

### Test Case 2: Pack Item With Invalid Carton ID (Should Fail)
```json
{
  "event_type": "PACK_ITEM_TO_TC",
  "item_code": "SKU-HAT-301-BLU-OS",
  "carton_id": "INVALID-CARTON",  // ❌ Doesn't exist - should fail
  "qty": 1,
  "tc_id": "TC-MR-0001-1768152754168",
  "source_bin": "A1-R01-L3-B1"
}
```
**Expected:** Validation error - "Carton INVALID-CARTON not found..."

### Test Case 3: Pack Item With Valid Carton ID (Should Succeed)
```json
{
  "event_type": "PACK_ITEM_TO_TC",
  "item_code": "SKU-HAT-301-BLU-OS",
  "carton_id": "CTN-A1-R01-L3-B1-20260111-162835-760",  // ✅ Valid
  "qty": 1,
  "tc_id": "TC-MR-0001-1768152754168",
  "source_bin": "A1-R01-L3-B1"
}
```
**Expected:** Event processed successfully ✅

## Files Modified

- `wms-api/src/modules/events/eventController.js` - Added carton_id validation for packing events

## Summary

✅ **Validation Added**: Carton ID is now required when packing items if carton-level inventory mode is enabled  
✅ **Carton Verification**: Validates that carton exists in `tabCartonStock` for the item  
✅ **Bin Location Check**: Validates carton is in correct bin if location is provided  
✅ **Clear Error Messages**: Provides specific error messages for missing/invalid carton IDs  
✅ **Box Expansion**: Also validates carton_id when boxes are expanded into item-level events  

---

**Next Steps:**
1. Restart API server to apply validation
2. Update mobile app to always include carton_id when packing items
3. Test packing with valid and invalid carton IDs
4. Verify transfer carton contents show carton IDs correctly
