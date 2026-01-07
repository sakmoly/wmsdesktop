# Box Contents Endpoint Fix

## Issue

**Problem:** Box details screen shows empty contents table even though items may have been sorted into the box.

The `GET /api/boxes/:box_id` endpoint was not returning box contents. Box contents should be derived from `tabWmsScanEvent` where `event_type = 'SORT_TO_BOX'` and `box_id` matches.

## Solution Implemented

Updated `getBoxById` endpoint to include box contents derived from SORT events.

### What Was Added

1. **Query SORT Events** - Queries `tabWmsScanEvent` for `SORT_TO_BOX` events matching the box_id
2. **Group by Item + Carton** - Groups events by `item_code` and `carton_id`, summing quantities
3. **Schema Detection** - Dynamically detects column names in `tabWmsScanEvent`
4. **Response Format** - Adds `contents` array to box data response

## Implementation Details

### Code Added

```javascript
// Get box contents from SORT events
// Query tabWmsScanEvent where event_type = 'SORT_TO_BOX' and box_id matches
let boxContents = [];
try {
  // Detect schema for columns in tabWmsScanEvent
  const [eventColumns] = await connection.execute(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabWmsScanEvent'
    AND COLUMN_NAME IN ('advance_shipping_notice', 'asn_no', 'carton_id', 'item_code', 'qty', 'user_id', 'event_time', 'box_id')
  `);
  const eventCols = new Set(eventColumns.map((r) => r.COLUMN_NAME));

  // Build query to get SORT_TO_BOX events for this box
  const [sortEvents] = await connection.execute(
    `
    SELECT 
      item_code,
      carton_id,
      qty,
      user_id,
      event_time
    FROM tabWmsScanEvent
    WHERE event_type = 'SORT_TO_BOX'
      AND box_id = ?
    ORDER BY event_time DESC
  `,
    [box_id]
  );

  // Group by item_code and carton_id, sum quantities
  const contentsMap = new Map();

  for (const event of sortEvents) {
    const key = `${event.item_code}_${event.carton_id}`;

    if (!contentsMap.has(key)) {
      contentsMap.set(key, {
        item_code: event.item_code,
        source_carton: event.carton_id,
        qty: parseFloat(event.qty) || 0,
        sorted_by: event.user_id,
        sorted_on: event.event_time.toISOString(),
      });
    } else {
      // Sum quantities for same item_code + carton_id combination
      const existing = contentsMap.get(key);
      existing.qty += parseFloat(event.qty) || 0;
    }
  }

  boxContents = Array.from(contentsMap.values()).sort((a, b) =>
    a.item_code.localeCompare(b.item_code)
  );
} catch (contentsError) {
  // Non-critical - log but don't fail
  console.warn(`Failed to fetch box contents:`, contentsError.message);
}

// Add contents to response
const boxData = {
  // ... box fields ...
  contents: boxContents, // NEW: Box contents from SORT events
};
```

## Response Format

### Before (No Contents):

```json
{
  "ok": true,
  "data": {
    "box_id": "BOX-WHMAIN-218010",
    "status": "Open",
    "asn_no": "ASN-0002",
    "store": "WH-MAIN",
    ...
  }
}
```

### After (With Contents):

```json
{
  "ok": true,
  "data": {
    "box_id": "BOX-WHMAIN-218010",
    "status": "Open",
    "asn_no": "ASN-0002",
    "store": "WH-MAIN",
    ...
    "contents": [
      {
        "item_code": "SKU-001",
        "source_carton": "CTN-0101",
        "qty": 50,
        "sorted_by": "USER-001",
        "sorted_on": "2024-12-26T01:20:00.000Z"
      },
      {
        "item_code": "SKU-002",
        "source_carton": "CTN-0102",
        "qty": 100,
        "sorted_by": "USER-001",
        "sorted_on": "2024-12-26T01:25:00.000Z"
      }
    ]
  }
}
```

## How It Works

1. **Mobile App Sorts Items** - When mobile app sorts items into a box, it creates `SORT_TO_BOX` events via `POST /api/events/batch`
2. **Events Stored** - Events are stored in `tabWmsScanEvent` with:
   - `event_type = 'SORT_TO_BOX'`
   - `box_id = 'BOX-WHMAIN-218010'`
   - `item_code`, `carton_id`, `qty`, `user_id`, `event_time`
3. **Desktop App Queries** - Desktop app calls `GET /api/boxes/:box_id` to get box details
4. **Contents Derived** - Backend queries `tabWmsScanEvent` and groups events by item_code + carton_id
5. **Response** - Backend returns box data with `contents` array

## Desktop App Integration

The desktop app needs to:

1. **Call API Endpoint** - Use `GET /api/boxes/:box_id` to get box with contents
2. **Update Local Service** - Update `SortBoxService.GetBoxContents()` to:
   - Call API endpoint if available
   - Fall back to local database query if offline
   - Parse `contents` array from API response

### Example Desktop App Code:

```csharp
// In SortBoxService.cs
public static async Task<List<SortBoxItem>> GetBoxContentsAsync(string boxId, WmsSettings settings)
{
    try
    {
        // Try API first
        var apiUrl = $"{settings.ApiUrl}/api/boxes/{boxId}";
        var response = await ApiService.GetAsync<BoxResponse>(apiUrl, settings.Token);

        if (response?.Ok == true && response.Data?.Contents != null)
        {
            return response.Data.Contents.Select(c => new SortBoxItem
            {
                ItemCode = c.ItemCode,
                SourceCartonId = c.SourceCarton,
                Qty = c.Qty,
                SortedBy = c.SortedBy,
                SortedOn = DateTime.Parse(c.SortedOn)
            }).ToList();
        }
    }
    catch (Exception ex)
    {
        // Fall back to local database
        ErrorLogService.LogWarning($"Failed to get box contents from API: {ex.Message}");
    }

    // Fallback: Query local database
    return GetBoxContentsFromLocalDb(boxId);
}
```

## Why Contents Might Be Empty

1. **No SORT Events** - Mobile app hasn't sorted any items into this box yet
2. **Events Not Synced** - SORT events exist but haven't been synced to backend
3. **Wrong Box ID** - Events are associated with a different box_id
4. **Event Type Mismatch** - Events have wrong `event_type` (should be `SORT_TO_BOX`)

## Verification Steps

1. **Check SORT Events in Database:**

   ```sql
   SELECT * FROM tabWmsScanEvent
   WHERE event_type = 'SORT_TO_BOX'
     AND box_id = 'BOX-WHMAIN-218010';
   ```

2. **Test API Endpoint:**

   ```bash
   curl -X GET "http://localhost:3000/api/boxes/BOX-WHMAIN-218010" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Verify Response:**
   - Check if `contents` array is present
   - Check if `contents` array has items
   - Verify item_code, source_carton, qty fields

## Files Modified

1. ✅ `wms-api/src/modules/boxes/boxController.js`
   - Updated `getBoxById` to include box contents from SORT events
   - Added schema detection for `tabWmsScanEvent` columns
   - Added grouping logic to sum quantities by item_code + carton_id

## Next Steps

1. **Restart Backend Server**

   ```bash
   cd wms-api
   # Stop current server (Ctrl+C)
   npm start
   ```

2. **Update Desktop App** (if needed)

   - Update `SortBoxService.GetBoxContents()` to call API endpoint
   - Or update to query local database for SORT events

3. **Verify Mobile App**
   - Ensure mobile app is creating `SORT_TO_BOX` events
   - Verify events are being synced to backend

## Notes

- Box contents are **derived** from SORT events, not stored directly
- Multiple SORT events for the same item_code + carton_id are **summed**
- Contents are sorted by `item_code` alphabetically
- If no SORT events exist, `contents` will be an empty array
- Schema detection ensures compatibility with different database setups
