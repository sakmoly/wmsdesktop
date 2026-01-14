# Update Packing Event Quantity API

## Overview

The API now supports **updating quantities** for items that are already scanned, instead of only adding new events.

## Current Behavior (Default)

**Default behavior:** Each scan creates a **new event** with `qty: 1` (or specified quantity). All events are **summed** to get the total.

**Example:**
- Scan 1: Creates event with `qty: 1` → Total: 1
- Scan 2: Creates event with `qty: 1` → Total: 2
- Scan 3: Creates event with `qty: 1` → Total: 3

## Update Mode (New)

**Update mode:** Replaces the total quantity for an item instead of adding to it.

**Example:**
- Previous scans: Total = 10
- Update with `qty: 6` → Total becomes 6 (replaces 10)

## API Endpoint

### POST /api/events/batch (with update_mode)

**Request Body:**
```json
{
  "update_mode": true,
  "events": [
    {
      "tc_id": "TC-MR-123459-1768157787512",
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "PAW-ASN365425473-1768138301111",
      "qty": 6.0,
      "user_id": "USER-150526"
    }
  ]
}
```

**Required Fields (for update_mode):**
- `tc_id` - Transfer carton ID
- `item_code` - Item code
- `qty` - **New total quantity** (replaces all previous events)
- `user_id` - User making the update
- `carton_id` - (Optional) Source carton ID

**Response:**
```json
{
  "ok": true,
  "message": "Quantity updates processed",
  "updated_count": 1,
  "failed_count": 0,
  "total_count": 1,
  "results": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "PAW-ASN365425473-1768138301111",
      "ok": true,
      "message": "Quantity decreased",
      "current_qty": 10,
      "new_qty": 6,
      "events_deleted": 4,
      "qty_reduced": 4
    }
  ]
}
```

## How It Works

### If New Quantity > Current Quantity (Increase)
- **Action:** Adds a new event with the difference
- **Example:** Current = 10, New = 15 → Adds event with `qty: 5`

### If New Quantity < Current Quantity (Decrease)
- **Action:** Deletes or reduces existing events (oldest first)
- **Example:** Current = 10, New = 6 → Deletes/reduces events totaling 4

### If New Quantity = Current Quantity
- **Action:** No change (returns success)

## Example Use Cases

### Use Case 1: Correct Quantity After Multiple Scans

**Scenario:** User accidentally scanned item 10 times, but actual quantity is 6.

**Request:**
```json
{
  "update_mode": true,
  "events": [
    {
      "tc_id": "TC-MR-123459-1768157787512",
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "PAW-ASN365425473-1768138301111",
      "qty": 6.0,
      "user_id": "USER-150526"
    }
  ]
}
```

**Result:** Total quantity becomes 6 (removes 4 excess scans)

### Use Case 2: Increase Quantity

**Scenario:** User wants to change quantity from 5 to 8.

**Request:**
```json
{
  "update_mode": true,
  "events": [
    {
      "tc_id": "TC-MR-123459-1768157787512",
      "item_code": "SKU-HAT-301-BLU-OS",
      "carton_id": "PAW-ASN365425473-1768138301111",
      "qty": 8.0,
      "user_id": "USER-150526"
    }
  ]
}
```

**Result:** Total quantity becomes 8 (adds 3 more)

## Comparison: Default vs Update Mode

### Default Mode (update_mode: false or omitted)
```json
{
  "events": [
    {
      "event_type": "PACK_ITEM_TO_TC",
      "tc_id": "TC-MR-123459-1768157787512",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 1.0
    }
  ]
}
```
**Result:** Adds 1 to existing total (e.g., 10 → 11)

### Update Mode (update_mode: true)
```json
{
  "update_mode": true,
  "events": [
    {
      "tc_id": "TC-MR-123459-1768157787512",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 6.0,
      "user_id": "USER-150526"
    }
  ]
}
```
**Result:** Replaces total with 6 (e.g., 10 → 6)

## Mobile App Integration

### When to Use Update Mode

Use **update mode** when:
- User manually corrects quantity
- User wants to replace total quantity
- Quantity adjustment is needed

Use **default mode** when:
- User scans items incrementally
- Each scan adds to the total
- Normal packing workflow

### Mobile App Example

```javascript
// Update quantity (replace total)
async function updateItemQuantity(tcId, itemCode, cartonId, newQty, userId) {
  const response = await fetch(`${API_URL}/api/events/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      update_mode: true,
      events: [{
        tc_id: tcId,
        item_code: itemCode,
        carton_id: cartonId,
        qty: newQty,
        user_id: userId
      }]
    })
  });
  
  return await response.json();
}

// Normal scan (add to total)
async function scanItem(tcId, itemCode, cartonId, qty = 1) {
  const response = await fetch(`${API_URL}/api/events/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      events: [{
        event_type: 'PACK_ITEM_TO_TC',
        tc_id: tcId,
        item_code: itemCode,
        carton_id: cartonId,
        qty: qty
      }]
    })
  });
  
  return await response.json();
}
```

## Important Notes

1. **Update mode requires `user_id`** - This is logged for audit purposes
2. **Update mode affects all events** for the same `item_code + carton_id + tc_id` combination
3. **Events are deleted/reduced oldest first** when decreasing quantity
4. **Update mode does not require `event_type`** - It's automatically `PACK_ITEM_TO_TC`
5. **Update mode does not require `offline_uuid`** - It's generated automatically

## Database Impact

- **Increase:** Creates new event(s) with difference
- **Decrease:** Deletes or updates existing events (oldest first)
- **No change:** Returns success without modifying database

---

**Status:** ✅ **IMPLEMENTED**  
**Date:** 2026-01-12  
**Endpoint:** `POST /api/events/batch` with `update_mode: true`
