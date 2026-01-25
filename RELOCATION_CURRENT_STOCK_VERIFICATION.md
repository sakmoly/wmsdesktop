# Relocation - Current Stock Verification

## How Current Stock is Calculated

### Item Location Breakdown Screen

The Item Location Breakdown uses **`tabStockLedger.qty`** as the **source of truth** for current stock at each bin location.

**Calculation Flow:**
1. **Read from `tabCartonStock`** - Get carton-level details (carton_id, qty per carton)
2. **Read from `tabStockLedger`** - Get current stock quantity (`qty`) and reserved quantity (`reserved_qty`)
3. **Use `tabStockLedger.qty` as source of truth** - This represents the actual current stock at the bin
4. **Calculate available_qty** = `total_qty - reserved_qty - blocked_qty`

**Code Reference:**
```javascript
// wms-api/src/modules/stock-ledger/stockLedgerController.js (lines 977-989)
// CRITICAL: Use stockLedgerQty as source of truth for current stock
if (binCartonMap.has(binLocation)) {
  const binData = binCartonMap.get(binLocation);
  binData.reserved_qty = reservedQty;
  // ✅ Update total_qty to match stock ledger (source of truth for current stock)
  binData.total_qty = stockLedgerQty;
}
```

---

## After Relocation - What Gets Updated

### ✅ Tables Updated During Relocation:

1. **`tabCartonStock.bin_location`** - Updated to new bin location
2. **`tabStockLedger`** - Updated with:
   - **Decrease** stock at old bin location
   - **Increase** stock at new bin location
   - **Include `carton_id`** (if column exists) ✅ **NEW FIX**
3. **`tabStockTransaction`** - Transaction history inserted
4. **`tabCarton.current_bin_id`** - Updated to new bin location

### ✅ Current Stock Calculation:

**After relocation, current stock is calculated as:**

```sql
-- Old bin location: qty decreases
UPDATE tabStockLedger
SET qty = qty - moved_qty
WHERE item_code = ? AND warehouse = ? AND bin_location = old_bin;

-- New bin location: qty increases
INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, carton_id, ...)
VALUES (?, ?, new_bin, existing_qty + moved_qty, carton_id, ...)
ON DUPLICATE KEY UPDATE qty = qty + moved_qty;
```

**Result:**
- ✅ Old bin: Stock decreases (or removed if qty = 0)
- ✅ New bin: Stock increases (or created if doesn't exist)
- ✅ Total stock across all bins: **Remains the same** (stock is moved, not created/destroyed)

---

## Item Location Breakdown After Relocation

### Expected Behavior:

**Before Relocation:**
- Item `SKU-001` at bin `A1-R01-L3-B1`: 10 qty (carton `CTN-001`)
- Item `SKU-001` at bin `A1-R01-L4-B1`: 0 qty

**After Relocating Carton `CTN-001` from `A1-R01-L3-B1` to `A1-R01-L4-B1`:**
- Item `SKU-001` at bin `A1-R01-L3-B1`: 0 qty (carton moved)
- Item `SKU-001` at bin `A1-R01-L4-B1`: 10 qty (carton `CTN-001`) ✅

**Item Location Breakdown should show:**
- ✅ Carton `CTN-001` at new bin `A1-R01-L4-B1` with 10 qty
- ✅ Old bin `A1-R01-L3-B1` should NOT show the carton (moved)

---

## Total Stock Quantity (`tabItem.stock_qty`)

### Automatic Update via Database Triggers

**Database triggers automatically update `tabItem.stock_qty` when:**
- `tabStockLedger` is INSERTED/UPDATED/DELETED
- `tabCartonStock` is INSERTED/UPDATED/DELETED

**Trigger Logic:**
```sql
-- After UPDATE on tabStockLedger
CREATE TRIGGER trg_update_item_stock_after_stock_ledger_update
AFTER UPDATE ON tabStockLedger
FOR EACH ROW
BEGIN
  UPDATE tabItem
  SET stock_qty = (
    SELECT COALESCE(SUM(qty), 0)
    FROM tabStockLedger
    WHERE item_code = NEW.item_code
  ),
  updated_at = NOW()
  WHERE code = NEW.item_code;
END
```

**Result:**
- ✅ `tabItem.stock_qty` = Sum of all `tabStockLedger.qty` for that item
- ✅ Automatically updated after relocation (via triggers)
- ✅ No manual update needed in relocation code

---

## Verification Queries

### 1. Check Current Stock at Each Bin (Item Location Breakdown)

```sql
-- Get current stock for item at all bins
SELECT 
  sl.bin_location,
  sl.carton_id,
  sl.qty as current_stock,
  sl.reserved_qty,
  sl.available_qty,
  cs.qty as carton_stock_qty
FROM tabStockLedger sl
LEFT JOIN tabCartonStock cs 
  ON cs.item_code = sl.item_code 
  AND cs.bin_location = sl.bin_location
  AND cs.carton_id = sl.carton_id
WHERE sl.item_code = 'SKU-001'
  AND sl.warehouse = 'WH-MAIN'
ORDER BY sl.bin_location;
```

### 2. Check Total Stock Quantity

```sql
-- Compare tabItem.stock_qty vs sum from tabStockLedger
SELECT 
  i.code as item_code,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total_qty,
  CASE 
    WHEN ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) < 0.01 THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as status
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE i.code = 'SKU-001'
GROUP BY i.code, i.stock_qty;
```

### 3. Check Carton Location After Relocation

```sql
-- Verify carton is at new bin location
SELECT 
  cs.carton_id,
  cs.item_code,
  cs.bin_location,
  cs.qty,
  sl.qty as ledger_qty,
  sl.carton_id as ledger_carton_id
FROM tabCartonStock cs
LEFT JOIN tabStockLedger sl 
  ON sl.item_code = cs.item_code 
  AND sl.bin_location = cs.bin_location
  AND sl.carton_id = cs.carton_id
WHERE cs.carton_id = 'CTN-001'
ORDER BY cs.bin_location;
```

---

## Summary

### ✅ Current Stock is Correct After Relocation

1. **`tabStockLedger.qty`** - ✅ Updated correctly (decrease at old bin, increase at new bin)
2. **`tabCartonStock.bin_location`** - ✅ Updated to new bin location
3. **`tabStockLedger.carton_id`** - ✅ Now included (NEW FIX)
4. **Item Location Breakdown** - ✅ Shows carton at new bin location
5. **`tabItem.stock_qty`** - ✅ Updated automatically via database triggers

### Current Stock Calculation:

- **Source of Truth:** `tabStockLedger.qty` (per bin location)
- **Item Location Breakdown:** Uses `tabStockLedger.qty` as current stock
- **Total Stock:** Sum of all `tabStockLedger.qty` for the item
- **Automatic Sync:** Database triggers keep `tabItem.stock_qty` in sync

### After Relocation:

- ✅ Stock quantities are correctly updated in `tabStockLedger`
- ✅ Carton location is correctly updated in `tabCartonStock`
- ✅ Carton appears in Item Location Breakdown at new bin location
- ✅ Total stock quantity remains the same (stock is moved, not created/destroyed)
- ✅ `tabItem.stock_qty` is automatically updated via triggers

**Result:** Current stock is correctly calculated and displayed after relocation! ✅
