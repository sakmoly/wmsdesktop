# Header-Level Location for Complete Putaway

## Overview
Added support for `location_id` at the header level (putaway task level) in the `POST /api/putaway/complete` endpoint. When a box is going to a single location, users can scan the location once at the header level instead of scanning for each item.

## API Changes

### Request Body Format

**With Header-Level Location (NEW - Preferred for single-location boxes):**
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-001",
  "location_id": "A1-R01-L1-B1",  // ← NEW: Header-level location (applies to all items)
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "completed": true
      // No location_id or target_bin needed - uses header location
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 100,
      "completed": true
      // No location_id or target_bin needed - uses header location
    }
  ]
}
```

**With Item-Level Location (Still Supported):**
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "location_id": "A1-R01-L1-B1",  // Item-specific location
      "completed": true
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 100,
      "location_id": "A1-R01-L2-B1",  // Different location for this item
      "completed": true
    }
  ]
}
```

**Mixed (Header + Item Override):**
```json
{
  "putaway_task": "PUT-20260101-0001",
  "performed_by": "USER-001",
  "location_id": "A1-R01-L1-B1",  // Default location for all items
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 75,
      "completed": true
      // Uses header location
    },
    {
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 100,
      "location_id": "A1-R01-L2-B1",  // Override with item-specific location
      "completed": true
    }
  ]
}
```

## Location Priority

When completing putaway, the location is determined in this priority order:

1. **Header-level `location_id`** (if provided) - Applied to all items unless overridden
2. **Item-level `location_id`** (if provided) - Overrides header location for that item
3. **Item-level `target_bin`** (backward compatibility) - Parsed to extract rack/bin

## Validation

- If `location_id` is provided at header level, all items can use it (no need for item-level locations)
- If header-level `location_id` is NOT provided, each item MUST have either:
  - `location_id` (preferred)
  - OR `target_bin` (backward compatibility)
- Validation error will list items that are missing locations

## Backend Implementation

1. **Header location lookup:** When `location_id` is provided at header level, it's looked up once using `lookupLocationFromId()`
2. **Applied to items:** Header location (rack, bin, location_id) is applied to all items unless overridden
3. **Item override:** If an item has its own `location_id`, it overrides the header location for that specific item
4. **Database update:** All putaway lines are updated with the location (rack, bin, location_id)

## Benefits

1. **Faster workflow:** Scan location once for entire box instead of per item
2. **Reduced errors:** Less scanning = fewer mistakes
3. **Better UX:** More intuitive for single-location boxes
4. **Flexible:** Still supports item-level locations when items go to different locations

