# Putaway Stock Update Implementation

## ✅ Implementation Complete

Stock ledger is now automatically updated when putaway tasks are completed. Quantities are added to the respective locations (rack/bin) and the total stock quantity is updated in the Item master.

---

## What Was Implemented

### 1. ✅ POST /api/putaway/complete - Stock Update

**File:** `wms-api/src/modules/putaway/putawayController.js`

**Functionality:**
- When a putaway task is completed, the system now:
  1. Gets all putaway lines with their locations (rack, bin) and quantities
  2. For each line, updates the stock ledger at that specific location
  3. Creates stock transaction records for audit trail
  4. Updates `tabItem.stock_qty` to sum all locations for each item

**Stock Ledger Updates:**
- **Location Format:** `{rack}-{bin}` (e.g., "A1-R01-L1-B1")
- **Warehouse:** Retrieved from ASN or defaults to "Main Warehouse"
- **Quantity:** Added to existing stock at that location
- **Transaction Type:** "Putaway"
- **Reference:** Putaway task ID

**Example:**
```javascript
// When putaway task PUT-20250120-0001 is completed:
// - Item SKU-001 at location "A1-R01-L1-B1" gets +50 qty
// - Item SKU-002 at location "A1-R01-L1-B1" gets +100 qty
// - tabItem.stock_qty is updated to sum all locations
```

---

### 2. ✅ Event-Based Stock Update

**File:** `wms-api/src/modules/events/eventController.js`

**Functionality:**
- Added `processPutawayCompletionEvent()` function
- Processes `PUTAWAY_CONFIRM` or `PUTAWAY_COMPLETE` events
- Automatically updates stock ledger when completion events are received
- Works as fallback when API endpoint is unavailable

**Event Types Supported:**
- `PUTAWAY_CONFIRM`
- `PUTAWAY_COMPLETE`

---

## Stock Update Flow

### When Putaway is Completed:

1. **Get Putaway Lines**
   ```sql
   SELECT item_code, qty, rack, bin
   FROM tabPutawayLine
   WHERE parent_title = ?
   ```

2. **For Each Line:**
   - Combine rack + bin into `bin_location` (e.g., "A1-R01-L1-B1")
   - Get current stock at that location
   - Add putaway quantity to current stock
   - Update `tabStockLedger`:
     ```sql
     INSERT INTO tabStockLedger 
       (item_code, warehouse, bin_location, qty, ...)
     VALUES (?, ?, ?, ?, ...)
     ON DUPLICATE KEY UPDATE qty = ?
     ```

3. **Create Stock Transaction**
   ```sql
   INSERT INTO tabStockTransaction 
     (transaction_type, reference_doc, item_code, 
      warehouse, bin_location, qty_change, ...)
   VALUES ('Putaway', ?, ?, ?, ?, ?, ...)
   ```

4. **Update Item Master**
   ```sql
   UPDATE tabItem
   SET stock_qty = (
     SELECT COALESCE(SUM(qty), 0)
     FROM tabStockLedger 
     WHERE item_code = ?
   )
   WHERE code = ?
   ```

---

## Database Tables Updated

### 1. `tabStockLedger`
- **Purpose:** Real-time stock by Item + Warehouse + Bin Location
- **Updated Fields:**
  - `qty` - Quantity at this location (incremented)
  - `last_transaction_type` - Set to "Putaway"
  - `last_transaction_ref` - Putaway task ID
  - `last_transaction_date` - Current timestamp

### 2. `tabStockTransaction`
- **Purpose:** Complete audit trail of stock movements
- **New Records:** Created for each putaway line
- **Fields:**
  - `transaction_type` = "Putaway"
  - `reference_doc` = Putaway task ID
  - `qty_change` = Quantity added
  - `qty_before` = Stock before putaway
  - `qty_after` = Stock after putaway

### 3. `tabItem`
- **Purpose:** Item master with total stock quantity
- **Updated Field:**
  - `stock_qty` = Sum of all locations for this item

---

## Response Format

### POST /api/putaway/complete Response:

```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "status": "Completed",
    "stock_updated": true,
    "warehouse": "Main Warehouse",
    "items_updated": 3,
    "stock_updates": [
      {
        "item_code": "SKU-001",
        "location": "A1-R01-L1-B1",
        "qty_added": 50.0,
        "qty_before": 0.0,
        "qty_after": 50.0
      },
      {
        "item_code": "SKU-002",
        "location": "A1-R01-L1-B1",
        "qty_added": 100.0,
        "qty_before": 0.0,
        "qty_after": 100.0
      }
    ]
  }
}
```

---

## Location Breakdown Display

The desktop app's "Item Location Breakdown" will now show:

- **Location ID:** Combined rack-bin (e.g., "A1-R01-L1-B1")
- **Zone/Aisle/Rack/Level/Bin:** Parsed from location string
- **Qty:** Quantity at that specific location
- **Total Qty:** Sum of all locations (from `tabItem.stock_qty`)

---

## Testing

### Test Putaway Completion with Stock Update:

```bash
POST /api/putaway/complete
{
  "putaway_task": "PUT-20250120-0001",
  "performed_by": "USER-002"
}
```

### Verify Stock Update:

```sql
-- Check stock ledger
SELECT * FROM tabStockLedger 
WHERE item_code = 'SKU-001' 
ORDER BY bin_location;

-- Check item master
SELECT code, name, stock_qty 
FROM tabItem 
WHERE code = 'SKU-001';

-- Check stock transactions
SELECT * FROM tabStockTransaction 
WHERE reference_doc = 'PUT-20250120-0001'
ORDER BY transaction_date DESC;
```

---

## Important Notes

1. **Location Format:** 
   - If both rack and bin are provided: `{rack}-{bin}`
   - If only rack: `{rack}`
   - If neither: `NULL` (warehouse-level stock)

2. **Warehouse Detection:**
   - First tries to get from ASN
   - Falls back to default warehouse from `tabWarehouse`
   - Defaults to "Main Warehouse" if none found

3. **Stock Calculation:**
   - `tabItem.stock_qty` = Sum of all `tabStockLedger.qty` for that item
   - Updated automatically when putaway is completed

4. **Idempotency:**
   - Stock updates are additive (adds to existing stock)
   - Multiple completions will add stock multiple times
   - Use transaction logs to track all changes

---

## Summary

✅ **Stock is now updated when putaway is completed**
✅ **Quantities are added to specific locations (rack/bin)**
✅ **Item master stock_qty is updated to sum all locations**
✅ **Stock transactions are logged for audit trail**
✅ **Works via API endpoint and event-based processing**

The desktop app's "Item Location Breakdown" will now display stock quantities by location, and the main "Stock Qty" column will show the total across all locations.

