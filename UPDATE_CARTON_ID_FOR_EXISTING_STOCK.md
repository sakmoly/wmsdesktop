# How to Update Carton ID for Existing Stock

## 📋 Overview

This guide explains how to update carton IDs for stock that already exists in the warehouse but doesn't have carton IDs assigned. This is useful when:
- Migrating from bin-level to carton-level inventory
- Retroactively assigning carton IDs to existing stock
- Correcting or updating carton IDs for existing items

## 🔧 Methods Available

### 1. Update Carton ID in `tabStockLedger` (Bin-Level Inventory)

If `tabStockLedger` has a `carton_id` column, you can update it directly:

```csharp
// Update all stock for a specific item+bin combination
var updated = await StockCartonUpdateService.UpdateCartonIdInStockLedgerAsync(
    settings: settings,
    cartonId: "CARTON-001",
    itemCode: "SKU-001",
    binLocation: "A1-R01-L1-B1",
    warehouse: "WH-MAIN"
);

Console.WriteLine($"Updated {updated} records");
```

**SQL Equivalent:**
```sql
UPDATE tabStockLedger
SET carton_id = 'CARTON-001',
    updated_at = NOW()
WHERE item_code = 'SKU-001'
  AND warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
  AND (carton_id IS NULL OR carton_id = '')
  AND qty > 0;
```

### 2. Create Carton Stock from Stock Ledger (Migration)

Create entries in `tabCartonStock` based on existing `tabStockLedger` data:

```csharp
// Create carton stock entries for all items at a specific bin
var created = await StockCartonUpdateService.CreateCartonStockFromStockLedgerAsync(
    settings: settings,
    cartonId: "CARTON-001",
    binLocation: "A1-R01-L1-B1",
    warehouse: "WH-MAIN"
    // itemCode: null = all items at this bin
);

Console.WriteLine($"Created/updated {created} carton stock entries");
```

**What this does:**
- Reads all stock from `tabStockLedger` at the specified bin location
- Creates corresponding entries in `tabCartonStock` with the provided carton ID
- Uses `INSERT ... ON DUPLICATE KEY UPDATE` to handle existing entries

### 3. Update Carton ID in `tabCartonStock`

Update existing carton IDs in `tabCartonStock`:

```csharp
// Update all entries with old carton ID to new carton ID
var updated = await StockCartonUpdateService.UpdateCartonIdInCartonStockAsync(
    settings: settings,
    newCartonId: "CARTON-002",
    oldCartonId: "CARTON-001",  // null = update all entries without carton_id
    itemCode: "SKU-001",        // optional
    binLocation: "A1-R01-L1-B1" // optional
);

Console.WriteLine($"Updated {updated} records");
```

**SQL Equivalent:**
```sql
UPDATE tabCartonStock
SET carton_id = 'CARTON-002',
    updated_at = NOW()
WHERE carton_id = 'CARTON-001'
  AND item_code = 'SKU-001'
  AND bin_location = 'A1-R01-L1-B1'
  AND qty > 0;
```

### 4. Batch Update Multiple Items

Update multiple items at once:

```csharp
var updates = new List<(string ItemCode, string BinLocation, string CartonId)>
{
    ("SKU-001", "A1-R01-L1-B1", "CARTON-001"),
    ("SKU-002", "A1-R01-L1-B1", "CARTON-001"),
    ("SKU-003", "A1-R01-L2-B1", "CARTON-002")
};

var updated = await StockCartonUpdateService.BatchUpdateCartonIdsAsync(
    settings: settings,
    updates: updates,
    warehouse: "WH-MAIN"
);

Console.WriteLine($"Batch updated {updated} records");
```

## 📝 Usage Examples

### Example 1: Assign Carton ID to All Items at a Bin

```csharp
// Scenario: Items at bin "A1-R01-L1-B1" were added without carton IDs
// Now we want to assign them all to "CARTON-001"

var updated = await StockCartonUpdateService.UpdateCartonIdInStockLedgerAsync(
    settings: settings,
    cartonId: "CARTON-001",
    itemCode: null,  // All items
    binLocation: "A1-R01-L1-B1",
    warehouse: "WH-MAIN"
);

// Also create entries in tabCartonStock (if using carton-level mode)
var created = await StockCartonUpdateService.CreateCartonStockFromStockLedgerAsync(
    settings: settings,
    cartonId: "CARTON-001",
    binLocation: "A1-R01-L1-B1",
    warehouse: "WH-MAIN"
);
```

### Example 2: Migrate Specific Item from Bin-Level to Carton-Level

```csharp
// Scenario: Item "SKU-001" exists in tabStockLedger without carton_id
// We want to create a carton stock entry for it

var created = await StockCartonUpdateService.CreateCartonStockFromStockLedgerAsync(
    settings: settings,
    cartonId: "CARTON-001",
    binLocation: "A1-R01-L1-B1",
    warehouse: "WH-MAIN",
    itemCode: "SKU-001"
);
```

### Example 3: Correct Carton ID for Multiple Items

```csharp
// Scenario: Several items were assigned wrong carton ID "CARTON-OLD"
// We need to update them to "CARTON-NEW"

var updated = await StockCartonUpdateService.UpdateCartonIdInCartonStockAsync(
    settings: settings,
    newCartonId: "CARTON-NEW",
    oldCartonId: "CARTON-OLD"
);
```

## 🔍 Direct SQL Scripts

If you prefer to run SQL directly, here are some scripts:

### Update Carton ID in tabStockLedger (if column exists)

```sql
-- Update carton_id for specific item+bin
UPDATE tabStockLedger
SET carton_id = 'CARTON-001',
    updated_at = NOW()
WHERE item_code = 'SKU-001'
  AND warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
  AND (carton_id IS NULL OR carton_id = '')
  AND qty > 0;

-- Update carton_id for all items at a bin
UPDATE tabStockLedger
SET carton_id = 'CARTON-001',
    updated_at = NOW()
WHERE warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
  AND (carton_id IS NULL OR carton_id = '')
  AND qty > 0;
```

### Create Carton Stock from Stock Ledger

```sql
-- Create carton stock entries for all items at a bin
INSERT INTO tabCartonStock 
    (carton_id, item_code, warehouse, bin_location, qty, status, created_at, updated_at)
SELECT 
    'CARTON-001' as carton_id,
    item_code,
    warehouse,
    bin_location,
    qty,
    'PUTAWAY' as status,
    NOW() as created_at,
    NOW() as updated_at
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
  AND qty > 0
ON DUPLICATE KEY UPDATE
    qty = VALUES(qty),
    updated_at = NOW(),
    status = 'PUTAWAY';
```

### Update Carton ID in tabCartonStock

```sql
-- Update carton_id for existing entries
UPDATE tabCartonStock
SET carton_id = 'CARTON-NEW',
    updated_at = NOW()
WHERE carton_id = 'CARTON-OLD'
  AND qty > 0;

-- Clear carton_id (set to NULL)
UPDATE tabCartonStock
SET carton_id = NULL,
    updated_at = NOW()
WHERE carton_id = 'CARTON-001'
  AND qty > 0;
```

## ⚠️ Important Notes

1. **Data Integrity**: Always verify stock quantities before and after updates
2. **Transaction Safety**: Consider wrapping updates in transactions for data consistency
3. **Carton Existence**: Ensure carton IDs you assign actually exist in `tabCarton` table (if applicable)
4. **Stock Ledger Column**: Check if `tabStockLedger` has `carton_id` column before using that method
5. **Carton-Level Mode**: If using carton-level inventory mode, always update `tabCartonStock`
6. **Bin-Level Mode**: If using bin-level inventory mode, `tabStockLedger` is the primary table

## 🔄 Workflow Recommendations

### For Bin-Level Inventory:
1. Use `UpdateCartonIdInStockLedgerAsync` if `carton_id` column exists
2. Optionally create entries in `tabCartonStock` for reporting/visibility

### For Carton-Level Inventory:
1. Use `CreateCartonStockFromStockLedgerAsync` to migrate from bin-level to carton-level
2. Use `UpdateCartonIdInCartonStockAsync` to update existing carton IDs

### For Mixed/Migration Scenarios:
1. Update `tabStockLedger` first (if column exists)
2. Create/update `tabCartonStock` entries
3. Verify data consistency between both tables

## 📊 Verification Queries

After updating, verify the changes:

```sql
-- Check carton IDs in tabStockLedger
SELECT item_code, bin_location, carton_id, qty
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
ORDER BY item_code;

-- Check carton stock entries
SELECT carton_id, item_code, bin_location, qty, status
FROM tabCartonStock
WHERE warehouse = 'WH-MAIN'
  AND bin_location = 'A1-R01-L1-B1'
ORDER BY carton_id, item_code;

-- Compare quantities between tables
SELECT 
    sl.item_code,
    sl.bin_location,
    sl.qty as stock_ledger_qty,
    COALESCE(SUM(cs.qty), 0) as carton_stock_qty,
    (sl.qty - COALESCE(SUM(cs.qty), 0)) as difference
FROM tabStockLedger sl
LEFT JOIN tabCartonStock cs ON sl.item_code = cs.item_code 
    AND sl.warehouse = cs.warehouse 
    AND sl.bin_location = cs.bin_location
WHERE sl.warehouse = 'WH-MAIN'
  AND sl.bin_location = 'A1-R01-L1-B1'
GROUP BY sl.item_code, sl.bin_location, sl.qty;
```

## 📁 Files

- **Service**: `Services/StockCartonUpdateService.cs`
- **Documentation**: `UPDATE_CARTON_ID_FOR_EXISTING_STOCK.md`

---

**Status**: ✅ Utility service created and ready to use
