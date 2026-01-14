# How to Update Carton ID for Item Location Breakdown

## Overview

The Item Location Breakdown window shows stock by location. This guide explains how to update carton IDs for existing stock that appears in this window.

## Understanding Item Location Breakdown Data Sources

The Item Location Breakdown gets data from:
1. **`tabStockLedger`** - Bin-level inventory (main source)
2. **`tabCartonStock`** - Carton-level inventory (if carton stock exists)

## Methods to Update Carton IDs

### Method 1: Direct SQL Update (Recommended for Specific Items)

#### 1.1 Update Carton ID in `tabStockLedger` (if column exists)

If `tabStockLedger` has a `carton_id` column:

```sql
-- Update carton_id for specific item+location
UPDATE tabStockLedger
SET carton_id = 'CARTON-001',  -- Your carton ID
    updated_at = NOW()
WHERE item_code = 'SKU-HAT-301-BLU-OS'  -- Your item code
  AND warehouse = 'WH-MAIN'  -- Your warehouse code (must be CODE, not name)
  AND bin_location = 'A1-R01-L1-B1'  -- Your bin location
  AND (carton_id IS NULL OR carton_id = '')
  AND qty > 0;
```

#### 1.2 Create Carton Stock Entry in `tabCartonStock`

If you want to track at carton level:

```sql
-- Create carton stock entry
INSERT INTO tabCartonStock 
    (carton_id, item_code, warehouse, bin_location, qty, status)
VALUES 
    ('CARTON-001', 'SKU-HAT-301-BLU-OS', 'WH-MAIN', 'A1-R01-L1-B1', 3.00, 'PUTAWAY')
ON DUPLICATE KEY UPDATE
    qty = VALUES(qty),
    updated_at = NOW(),
    status = 'PUTAWAY',
    bin_location = VALUES(bin_location);
```

### Method 2: Bulk Update from Transaction Data

#### 2.1 Update from Completed Putaway Tasks

If your putaway tasks have carton IDs:

```sql
UPDATE tabStockLedger sl
INNER JOIN tabPutawayLine pl ON 
    sl.item_code = pl.item_code 
    AND sl.warehouse = 'WH-MAIN'
    AND sl.bin_location = CONCAT(COALESCE(pl.rack, ''), IF(pl.bin IS NOT NULL, CONCAT('-', pl.bin), ''))
INNER JOIN tabPutawayTask pt ON pl.parent_title = pt.title AND pt.status = 'Completed'
SET sl.carton_id = pl.carton_id,
    sl.updated_at = NOW()
WHERE pl.carton_id IS NOT NULL
  AND pl.carton_id != ''
  AND (sl.carton_id IS NULL OR sl.carton_id = '')
  AND sl.qty > 0;
```

#### 2.2 Update from Completed Cycle Count Tasks

If your cycle count tasks have carton IDs:

```sql
UPDATE tabStockLedger sl
INNER JOIN tabCycleCountLine ccl ON 
    sl.item_code = ccl.item_code 
    AND sl.warehouse = 'WH-MAIN'
    AND sl.bin_location = ccl.bin_location
INNER JOIN tabCycleCountTask cct ON ccl.parent_title = cct.title AND cct.status = 'Completed'
SET sl.carton_id = ccl.carton_id,
    sl.updated_at = NOW()
WHERE ccl.carton_id IS NOT NULL
  AND ccl.carton_id != ''
  AND (sl.carton_id IS NULL OR sl.carton_id = '')
  AND sl.qty > 0;
```

### Method 3: Automated Script (Node.js)

Run the automated script:

```bash
cd wms-api
node update-carton-ids-for-stock.js
```

This script:
- Finds all stock without carton IDs
- Generates carton IDs automatically
- Updates `tabStockLedger` or creates entries in `tabCartonStock`

### Method 4: Desktop App Service

Use the `StockCartonUpdateService` in the desktop app:

```csharp
// Update carton ID in stock ledger
var updated = await StockCartonUpdateService.UpdateCartonIdInStockLedgerAsync(
    settings: settings,
    cartonId: "CARTON-001",
    itemCode: "SKU-HAT-301-BLU-OS",
    binLocation: "A1-R01-L1-B1",
    warehouse: "WH-MAIN"
);

// Create carton stock entry
var created = await StockCartonUpdateService.CreateCartonStockFromStockLedgerAsync(
    settings: settings,
    cartonId: "CARTON-001",
    binLocation: "A1-R01-L1-B1",
    warehouse: "WH-MAIN",
    itemCode: "SKU-HAT-301-BLU-OS"  // Optional: null for all items at bin
);
```

## Step-by-Step Guide

### Step 1: Check Current State

Run these queries to see what needs updating:

```sql
-- See items in Item Location Breakdown
SELECT 
    item_code,
    warehouse,
    bin_location,
    carton_id,
    qty
FROM tabStockLedger
WHERE qty > 0
ORDER BY item_code, bin_location;

-- See items missing carton IDs
SELECT 
    item_code,
    warehouse,
    bin_location,
    qty
FROM tabStockLedger
WHERE qty > 0
  AND (carton_id IS NULL OR carton_id = '')
ORDER BY item_code, bin_location;
```

### Step 2: Update Carton IDs

Choose one of the methods above based on your needs:
- **Specific items**: Use Method 1 (Direct SQL)
- **Multiple items from transactions**: Use Method 2 (Bulk Update)
- **All items automatically**: Use Method 3 (Automated Script)

### Step 3: Verify the Update

Check that carton IDs are now populated:

```sql
-- Verify carton IDs in stock ledger
SELECT 
    item_code,
    warehouse,
    bin_location,
    carton_id,
    qty
FROM tabStockLedger
WHERE qty > 0
ORDER BY item_code, bin_location;

-- Check Item Location Breakdown should now show carton IDs
-- Open desktop app -> Items -> Show Location Breakdown
```

## Important Notes

1. **Warehouse Code vs Name**: Use warehouse **CODE** (e.g., `WH-MAIN`), not name (e.g., `Main Warehouse`)
2. **Carton ID Format**: Carton IDs should be unique and follow your naming convention
3. **Both Tables**: You can update either `tabStockLedger.carton_id` or create entries in `tabCartonStock`, or both
4. **Item Location Breakdown Priority**: 
   - If `tabStockLedger` has `carton_id`, it uses that
   - If not, it looks up `tabCartonStock` for cartons at that bin location

## SQL Script

A complete SQL script with examples is available in:
- **`SCRIPTS/UpdateCartonIdForItemLocationBreakdown.sql`**

Run this script in your MySQL client to update carton IDs for existing stock.

## Troubleshooting

### Carton ID Still Not Showing

1. **Check warehouse code**: Ensure you're using warehouse CODE (e.g., `WH-MAIN`), not name
2. **Refresh desktop app**: Close and reopen the Item Location Breakdown window
3. **Check both tables**: Verify carton ID exists in either `tabStockLedger` or `tabCartonStock`
4. **Verify bin_location**: Ensure bin_location matches exactly (case-sensitive)

### Multiple Cartons at Same Location

If multiple cartons exist at the same bin location:
- Item Location Breakdown shows them as separate rows
- Each row shows a different carton ID with its quantity
- Make sure each carton has a unique `carton_id`

## Summary

✅ **Check current state** with verification queries
✅ **Choose update method** based on your needs
✅ **Execute update** using SQL or script
✅ **Verify results** in Item Location Breakdown window
✅ **Use warehouse CODE** (not name) in all queries

---

**Files:**
- `SCRIPTS/UpdateCartonIdForItemLocationBreakdown.sql` - Complete SQL script with examples
- `wms-api/update-carton-ids-for-stock.js` - Automated Node.js script
- `Services/StockCartonUpdateService.cs` - C# service for desktop app
