# Stock Ledger API - Multiple Bins and Cartons Support

## Overview

The API endpoint `/api/stock/item/:item_code/warehouse/:warehouse` (and its alias `/api/stock-ledger/:item_code/:warehouse`) now supports returning **multiple bin locations** and **multiple carton IDs** for each bin location.

## API Endpoints

### Primary Endpoint
```
GET /api/stock-ledger/:item_code/:warehouse
```

### Alias Endpoint
```
GET /api/stock/item/:item_code/warehouse/:warehouse
```

**Authentication:** Required (Bearer token)

## Response Formats

The API supports two response formats:

### 1. Grouped Format (Default)

**Query:** `GET /api/stock-ledger/SKU-001/WH-MAIN` or `GET /api/stock-ledger/SKU-001/WH-MAIN?format=grouped`

**Response Structure:**
```json
[
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L1-B1",
    "cartons": [
      {
        "carton_id": "CTN-3339",
        "qty": 2.00
      },
      {
        "carton_id": "CTN-3340",
        "qty": 35.00
      }
    ],
    "total_qty": 37.00,
    "reserved_qty": 0.00,
    "available_qty": 37.00,
    "last_transaction_date": "2026-01-11T10:30:00.000Z",
    "last_transaction_type": "CycleCount",
    "last_transaction_ref": "CC-0001",
    "updated_at": "2026-01-11T10:30:00.000Z",
    "created_at": "2026-01-11T10:30:00.000Z"
  },
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R02-L1-B2",
    "cartons": [
      {
        "carton_id": "CTN-3341",
        "qty": 10.00
      }
    ],
    "total_qty": 10.00,
    "reserved_qty": 0.00,
    "available_qty": 10.00,
    "last_transaction_date": "2026-01-11T09:00:00.000Z",
    "last_transaction_type": "Putaway",
    "last_transaction_ref": "PUT-0001",
    "updated_at": "2026-01-11T09:00:00.000Z",
    "created_at": "2026-01-11T09:00:00.000Z"
  },
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": null,
    "cartons": null,
    "total_qty": 20.00,
    "reserved_qty": 5.00,
    "available_qty": 15.00,
    "last_transaction_date": "2026-01-11T08:00:00.000Z",
    "last_transaction_type": "Receiving",
    "last_transaction_ref": "ASN-0001",
    "updated_at": "2026-01-11T08:00:00.000Z",
    "created_at": "2026-01-11T08:00:00.000Z"
  }
]
```

**Key Features:**
- ✅ **Multiple Bins**: Each array element represents a different bin location
- ✅ **Multiple Cartons per Bin**: The `cartons` array contains all cartons at that bin location
- ✅ **Total Quantity**: `total_qty` is the sum of all carton quantities for that bin
- ✅ **Null Cartons**: If `cartons` is `null`, it means bin-level stock without specific carton tracking
- ✅ **Null Bin Location**: If `bin_location` is `null`, it means warehouse-level stock (not yet putaway)

### 2. Flat Format (Backward Compatible)

**Query:** `GET /api/stock-ledger/SKU-001/WH-MAIN?format=flat`

**Response Structure:**
```json
[
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L1-B1",
    "carton_id": "CTN-3339",
    "qty": 2.00,
    "reserved_qty": 0.00,
    "available_qty": 2.00,
    "last_transaction_date": "2026-01-11T10:30:00.000Z",
    "last_transaction_type": "CycleCount",
    "last_transaction_ref": "CC-0001",
    "updated_at": "2026-01-11T10:30:00.000Z",
    "created_at": "2026-01-11T10:30:00.000Z"
  },
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R01-L1-B1",
    "carton_id": "CTN-3340",
    "qty": 35.00,
    "reserved_qty": 0.00,
    "available_qty": 35.00,
    "last_transaction_date": "2026-01-11T10:30:00.000Z",
    "last_transaction_type": "CycleCount",
    "last_transaction_ref": "CC-0001",
    "updated_at": "2026-01-11T10:30:00.000Z",
    "created_at": "2026-01-11T10:30:00.000Z"
  },
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": "A1-R02-L1-B2",
    "carton_id": "CTN-3341",
    "qty": 10.00,
    "reserved_qty": 0.00,
    "available_qty": 10.00,
    "last_transaction_date": "2026-01-11T09:00:00.000Z",
    "last_transaction_type": "Putaway",
    "last_transaction_ref": "PUT-0001",
    "updated_at": "2026-01-11T09:00:00.000Z",
    "created_at": "2026-01-11T09:00:00.000Z"
  },
  {
    "item_code": "SKU-001",
    "warehouse": "WH-MAIN",
    "bin_location": null,
    "carton_id": null,
    "qty": 20.00,
    "reserved_qty": 5.00,
    "available_qty": 15.00,
    "last_transaction_date": "2026-01-11T08:00:00.000Z",
    "last_transaction_type": "Receiving",
    "last_transaction_ref": "ASN-0001",
    "updated_at": "2026-01-11T08:00:00.000Z",
    "created_at": "2026-01-11T08:00:00.000Z"
  }
]
```

**Key Features:**
- ✅ **One Row per Bin+Carton Combination**: Each array element represents a unique bin+carton combination
- ✅ **Backward Compatible**: Matches the original API response format
- ✅ **Easy to Iterate**: Simple loop through all combinations

## Data Source Priority

The API uses the following priority when fetching data:

1. **Carton Stock (`tabCartonStock`)**: If carton stock exists for a bin location, it uses carton-level data (more granular)
2. **Stock Ledger (`tabStockLedger`)**: If no carton stock exists, it falls back to bin-level stock ledger data

This ensures that:
- ✅ Carton-level inventory (from cycle count, putaway) is shown with all cartons
- ✅ Bin-level inventory (from receiving, transfer) is shown as bin-level stock
- ✅ No duplicate entries (carton stock takes priority over stock ledger for the same bin)

## Example Use Cases

### Use Case 1: Item in Multiple Bins with Multiple Cartons

**Scenario:**
- Item: `SKU-JACKET-201-BLK-L`
- Bin `A1-R01-L1-B1`: Carton `CTN-3339` (Qty: 2), Carton `CTN-3340` (Qty: 35)
- Bin `A1-R02-L1-B2`: Carton `CTN-3341` (Qty: 10)

**Grouped Response:**
```json
[
  {
    "bin_location": "A1-R01-L1-B1",
    "cartons": [
      { "carton_id": "CTN-3339", "qty": 2 },
      { "carton_id": "CTN-3340", "qty": 35 }
    ],
    "total_qty": 37
  },
  {
    "bin_location": "A1-R02-L1-B2",
    "cartons": [
      { "carton_id": "CTN-3341", "qty": 10 }
    ],
    "total_qty": 10
  }
]
```

### Use Case 2: Item with Bin-Level Stock (No Cartons)

**Scenario:**
- Item: `SKU-HAT-301-BLU-OS`
- Bin `A1-R01-L1-B1`: Total Qty: 50 (no carton tracking)

**Grouped Response:**
```json
[
  {
    "bin_location": "A1-R01-L1-B1",
    "cartons": null,
    "total_qty": 50
  }
]
```

### Use Case 3: Item at Warehouse Level (Not Yet Putaway)

**Scenario:**
- Item: `SKU-SHOES-101-BLK-43`
- Warehouse: `WH-MAIN`
- Bin: `null` (at dock, not yet putaway)
- Qty: 20

**Grouped Response:**
```json
[
  {
    "bin_location": null,
    "cartons": null,
    "total_qty": 20
  }
]
```

## Implementation Details

### Database Queries

1. **Stock Ledger Query:**
   ```sql
   SELECT item_code, warehouse, bin_location, qty, reserved_qty, available_qty, carton_id, ...
   FROM tabStockLedger
   WHERE item_code = ? AND warehouse = ?
   ```

2. **Carton Stock Query:**
   ```sql
   SELECT carton_id, item_code, warehouse, bin_location, qty, status
   FROM tabCartonStock
   WHERE item_code = ? AND warehouse = ? AND qty > 0 AND status = 'PUTAWAY'
   ```

### Data Merging Logic

1. Query `tabCartonStock` first (more granular)
2. Group cartons by `bin_location`
3. Query `tabStockLedger` for bin-level stock
4. For each bin location:
   - If carton stock exists → Use carton stock data
   - If no carton stock → Use stock ledger data
5. Build response in requested format (grouped or flat)

## Client Integration

### JavaScript/TypeScript Example

```javascript
// Fetch stock with multiple bins and cartons
const response = await fetch('/api/stock-ledger/SKU-001/WH-MAIN?format=grouped', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const stockData = await response.json();

// Process grouped format
stockData.forEach(bin => {
  console.log(`Bin: ${bin.bin_location}, Total Qty: ${bin.total_qty}`);
  
  if (bin.cartons) {
    bin.cartons.forEach(carton => {
      console.log(`  - Carton ${carton.carton_id}: ${carton.qty}`);
    });
  } else {
    console.log(`  - Bin-level stock (no cartons)`);
  }
});
```

### C# Example

```csharp
// Fetch stock with multiple bins and cartons
var response = await httpClient.GetAsync($"/api/stock-ledger/{itemCode}/{warehouse}?format=grouped");
var stockData = await response.Content.ReadFromJsonAsync<List<StockLedgerGrouped>>();

// Process grouped format
foreach (var bin in stockData)
{
    Console.WriteLine($"Bin: {bin.BinLocation}, Total Qty: {bin.TotalQty}");
    
    if (bin.Cartons != null)
    {
        foreach (var carton in bin.Cartons)
        {
            Console.WriteLine($"  - Carton {carton.CartonId}: {carton.Qty}");
        }
    }
    else
    {
        Console.WriteLine($"  - Bin-level stock (no cartons)");
    }
}
```

## Migration Notes

### For Existing Clients

- **Default Format**: Changed from flat to grouped format
- **Backward Compatibility**: Use `?format=flat` to get the original flat format
- **New Fields**: `cartons` array and `total_qty` in grouped format

### Recommended Actions

1. **Update Clients**: Use grouped format for better structure
2. **Handle Nulls**: Check for `null` in `cartons` and `bin_location`
3. **Sum Quantities**: Use `total_qty` instead of summing `cartons[].qty`

## Summary

✅ **Multiple Bins**: API returns all bin locations for an item  
✅ **Multiple Cartons**: API returns all cartons for each bin location  
✅ **Two Formats**: Grouped (default) and flat (backward compatible)  
✅ **Data Priority**: Carton stock takes priority over stock ledger  
✅ **Backward Compatible**: Use `?format=flat` for original format  

---

**Files Modified:**
- `wms-api/src/modules/stock-ledger/stockLedgerController.js` - Updated `getStockLedgerByItem` function
- `wms-api/src/routes/index.js` - Added alias route `/api/stock/item/:item_code/warehouse/:warehouse`
