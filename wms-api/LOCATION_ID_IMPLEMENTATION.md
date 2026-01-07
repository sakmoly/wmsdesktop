# Location ID Implementation Guide

## Overview
Users scan **Location ID** (e.g., "A1-R01-L1-B1") instead of separate rack/bin values. The API needs to:
1. Accept `location_id` in requests
2. Look up the location from `tabLocation` table
3. Extract `parent_rack` as `rack` and `bin_id` as `bin`
4. Use `location_id` as `bin_location` in stock ledger

## Database Structure
From `tabLocation` table:
- `location_id` (PRIMARY KEY): "A1-R01-L1-B1"
- `parent_rack`: "Rack 01"
- `bin_id`: "B1"
- `is_available`: boolean

## API Changes Required

### 1. `POST /api/putaway/scan-transfer-carton`
**Request Body:**
```json
{
  "tc_id": "TC-123",  // Optional
  "box_id": "BOX-123", // Optional
  "location_id": "A1-R01-L1-B1",  // NEW: Preferred method
  "rack": "Rack 01",  // OLD: Backward compatibility
  "bin": "B1",        // OLD: Backward compatibility
  "putaway_task": "PUT-20260101-0001", // Optional
  "user_id": "USER-001"
}
```

**Logic:**
- If `location_id` is provided → Lookup from `tabLocation`, extract `parent_rack` and `bin_id`
- If `rack`+`bin` provided → Use directly (backward compatibility)
- Validate location exists and is available

### 2. `POST /api/putaway/complete`
**Request Body:**
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "SKU-001",
      "qty": 50.00,
      "location_id": "A1-R01-L1-B1",  // NEW: Preferred method
      "target_bin": "A1-R01-L1-B1",   // OLD: Backward compatibility (parsed)
      "completed": true
    }
  ]
}
```

**Logic:**
- If `location_id` is provided → Lookup from `tabLocation`, extract `parent_rack` and `bin_id`
- If `target_bin` provided → Parse it (backward compatibility)
- Use `location_id` as `bin_location` in stock ledger

### 3. Helper Function
```javascript
async function lookupLocationFromId(connection, locationId) {
  // Lookup location from tabLocation
  // Return: { location_id, rack (from parent_rack), bin (from bin_id), is_available }
}
```

## Implementation Status
- [x] Helper function `lookupLocationFromId` created
- [ ] Update `scanTransferCarton` to use `location_id`
- [ ] Update `completePutaway` to use `location_id` in items
- [ ] Update `updatePutawayTaskLocation` to use `location_id`
- [ ] Use `location_id` as `bin_location` in stock ledger

## Testing
1. Test with `location_id` (new method)
2. Test with `rack`+`bin` (backward compatibility)
3. Test with invalid `location_id` (should return error)
4. Test with unavailable location (should return error)

