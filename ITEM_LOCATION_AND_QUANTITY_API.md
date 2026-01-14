# Item Location ID and Quantity API

## Endpoint

**`GET /api/stock/item/:item_code/warehouse/:warehouse`**

**Alternative:** `GET /api/stock-ledger/:item_code/:warehouse`

## Purpose

Get all bin locations (Location IDs) and quantities for a specific item in a warehouse. This is used in the Material Request Picking screen to show where items are located and how many are available at each location.

---

## Request

```http
GET /api/stock/item/SKU-HAT-301-GRN-OS/warehouse/WH-MAIN
Authorization: Bearer <token>
```

**Parameters:**
- `item_code` (path): Item code (e.g., "SKU-HAT-301-GRN-OS")
- `warehouse` (path): Warehouse code (e.g., "WH-MAIN")

**Query Parameters (optional):**
- `format` (query): Response format
  - `"grouped"` (default): Grouped by bin_location with cartons array
  - `"flat"`: Flat structure with all bin+carton combinations

---

## Response Format

### Default Format (Grouped)

```json
[
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L3-B1",
    "cartons": [
      {
        "carton_id": "CTN-555444",
        "qty": 10
      },
      {
        "carton_id": "CTN-555445",
        "qty": 5
      }
    ],
    "total_qty": 15,
    "reserved_qty": 0,
    "available_qty": 15,
    "last_transaction_date": "2026-01-12T10:00:00.000Z",
    "last_transaction_type": "PUTAWAY",
    "last_transaction_ref": null,
    "updated_at": "2026-01-12T10:00:00.000Z",
    "created_at": "2026-01-12T10:00:00.000Z"
  },
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R02-L1-B2",
    "cartons": null,
    "total_qty": 20,
    "reserved_qty": 5,
    "available_qty": 15,
    "last_transaction_date": "2026-01-12T09:00:00.000Z",
    "last_transaction_type": "PUTAWAY",
    "last_transaction_ref": null,
    "updated_at": "2026-01-12T09:00:00.000Z",
    "created_at": "2026-01-12T09:00:00.000Z"
  }
]
```

### Flat Format (`?format=flat`)

```json
[
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L3-B1",
    "carton_id": "CTN-555444",
    "qty": 10,
    "reserved_qty": 0,
    "available_qty": 10,
    "last_transaction_date": "2026-01-12T10:00:00.000Z",
    "last_transaction_type": "PUTAWAY",
    "last_transaction_ref": null,
    "updated_at": "2026-01-12T10:00:00.000Z",
    "created_at": "2026-01-12T10:00:00.000Z"
  },
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L3-B1",
    "carton_id": "CTN-555445",
    "qty": 5,
    "reserved_qty": 0,
    "available_qty": 5,
    "last_transaction_date": "2026-01-12T10:00:00.000Z",
    "last_transaction_type": "PUTAWAY",
    "last_transaction_ref": null,
    "updated_at": "2026-01-12T10:00:00.000Z",
    "created_at": "2026-01-12T10:00:00.000Z"
  },
  {
    "item_code": "SKU-HAT-301-GRN-OS",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R02-L1-B2",
    "carton_id": null,
    "qty": 20,
    "reserved_qty": 5,
    "available_qty": 15,
    "last_transaction_date": "2026-01-12T09:00:00.000Z",
    "last_transaction_type": "PUTAWAY",
    "last_transaction_ref": null,
    "updated_at": "2026-01-12T09:00:00.000Z",
    "created_at": "2026-01-12T09:00:00.000Z"
  }
]
```

---

## Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `item_code` | string | Item code |
| `warehouse` | string | Warehouse code |
| `bin_location` | string \| null | **Location ID** (e.g., "A1-R01-L3-B1") |
| `cartons` | array \| null | Array of cartons at this location (grouped format only) |
| `carton_id` | string \| null | Carton ID (flat format only) |
| `qty` | number | **Quantity** at this location/carton |
| `total_qty` | number | Total quantity at this bin_location (grouped format only) |
| `reserved_qty` | number | Reserved quantity |
| `available_qty` | number | Available quantity (qty - reserved_qty) |
| `last_transaction_date` | string \| null | Last transaction date (ISO format) |
| `last_transaction_type` | string \| null | Last transaction type |
| `last_transaction_ref` | string \| null | Last transaction reference |
| `updated_at` | string \| null | Last update timestamp (ISO format) |
| `created_at` | string \| null | Creation timestamp (ISO format) |

---

## Key Features

1. ✅ **Returns Location ID:** `bin_location` field contains the Location ID (e.g., "A1-R01-L3-B1")
2. ✅ **Returns Quantity:** `qty` or `total_qty` field contains the quantity at each location
3. ✅ **Carton-Level Support:** Shows carton breakdown if carton-level inventory is used
4. ✅ **Bin-Level Support:** Shows bin-level quantities if no cartons
5. ✅ **Location Matching:** Automatically matches incomplete bin_location formats to location_id from `tabLocation`
6. ✅ **Available Quantity:** Calculates `available_qty = qty - reserved_qty`

---

## Usage in Material Request Picking Screen

### Example Request

```javascript
// Get item locations and quantities for picking screen
async function getItemLocations(itemCode, warehouse) {
  try {
    const response = await fetch(
      `/api/stock/item/${itemCode}/warehouse/${warehouse}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    const locations = await response.json();
    
    // Display locations with quantities
    locations.forEach(location => {
      console.log(`Location: ${location.bin_location}`);
      console.log(`Quantity: ${location.total_qty || location.qty}`);
      console.log(`Available: ${location.available_qty}`);
      
      // If carton-level, show cartons
      if (location.cartons) {
        location.cartons.forEach(carton => {
          console.log(`  Carton ${carton.carton_id}: ${carton.qty} pcs`);
        });
      }
    });
    
    return locations;
  } catch (error) {
    console.error('Failed to get item locations:', error);
  }
}
```

### Display in Picking Screen

The response can be used to:
1. **Show Location Icons:** Use `bin_location` to display location pins/icons
2. **Show Available Quantities:** Display `available_qty` for each location
3. **Allow Location Selection:** Let user select which location to pick from
4. **Show Carton Details:** Display carton breakdown if carton-level inventory

---

## Error Responses

### Item Not Found

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "item_code and warehouse are required"
  }
}
```

### Database Error

```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to fetch stock ledger",
    "details": "Error details (development mode only)"
  }
}
```

---

## Notes

1. **Location ID Matching:** The API automatically matches incomplete `bin_location` formats (e.g., "Rack 02-B2") to proper `location_id` from `tabLocation` table
2. **Carton vs Bin Level:** 
   - If carton-level inventory exists, it shows carton breakdown
   - If only bin-level inventory exists, it shows bin-level quantities
3. **Empty Response:** Returns empty array `[]` if no stock found (not an error)
4. **Reserved Quantity:** `reserved_qty` is subtracted from `qty` to calculate `available_qty`

---

## Related Endpoints

- `GET /api/stock/ledger?bin_location=...` - Get all items at a specific location
- `GET /api/master/bin-master/:bin_code` - Get bin/location master data
- `GET /api/material-requests/:title` - Get Material Request details with items

---

**Status:** ✅ **API EXISTS AND WORKING**  
**Date:** 2026-01-12
