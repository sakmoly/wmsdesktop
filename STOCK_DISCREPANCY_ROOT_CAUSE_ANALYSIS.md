# Stock Discrepancy Root Cause Analysis

## 🐛 Issue

**Main Items Table:** Shows `Stock Qty: 96` for `SKU-HAT-301-BLU-OS`  
**Item Location Breakdown:** Shows `Qty: 98.00` at location `A1-R01-L3-B1`, Carton `CTN-555444`

**Discrepancy:** Item Location Breakdown shows **2 units MORE** than the main Items table.

---

## 🔍 Root Cause Analysis

### 1. **Main Items Table Source**

The main Items table displays `stock_qty` from `tabItem.stock_qty`:

```sql
SELECT stock_qty FROM tabItem WHERE code = 'SKU-HAT-301-BLU-OS'
```

**This value should equal:**
```sql
SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = 'SKU-HAT-301-BLU-OS'
```

**Current value:** `96`

---

### 2. **Item Location Breakdown Source**

The Item Location Breakdown queries `tabCartonStock`:

**Desktop App Query (ItemLocationBreakdownViewModel.cs):**
```csharp
// Lines 505-541: Selects only the most recent record (by id) for each carton+item+bin combination
var cartonSql = @"SELECT cs.carton_id, cs.qty
    FROM tabCartonStock cs
    INNER JOIN (
        SELECT 
            carton_id,
            item_code,
            warehouse,
            bin_location,
            MAX(id) as max_id
        FROM tabCartonStock
        WHERE item_code = @itemCode
          AND bin_location = @binLocation
          AND qty > 0
          AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
        GROUP BY carton_id, item_code, warehouse, bin_location
    ) latest
      ON cs.carton_id = latest.carton_id
      AND cs.item_code = latest.item_code
      AND cs.warehouse = latest.warehouse
      AND cs.bin_location = latest.bin_location
      AND cs.id = latest.max_id
    WHERE cs.qty > 0
      AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')";
```

**API Query (getStockLedgerByItem):**
```javascript
// Lines 593-650: Similar logic to select most recent record
```

**Current value:** `98`

---

## 🔎 Possible Causes

### Cause 1: Duplicate Records in `tabCartonStock` (Most Likely)

**Problem:** Even though the query selects only the most recent record (by `id`), there might be:
1. **Multiple records with the same `id`** (unlikely, but possible if `id` is not AUTO_INCREMENT)
2. **Records with different `batch_no`** (NULL vs non-NULL) causing the UNIQUE KEY to allow duplicates
3. **Records with different `warehouse`** values, causing the GROUP BY to create separate groups

**Check:**
```sql
-- Check for duplicates in tabCartonStock
SELECT 
  carton_id,
  item_code,
  bin_location,
  warehouse,
  batch_no,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty_sum,
  GROUP_CONCAT(id ORDER BY id DESC) as record_ids,
  MAX(id) as latest_id
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND bin_location = 'A1-R01-L3-B1'
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
GROUP BY carton_id, item_code, bin_location, warehouse, batch_no
HAVING COUNT(*) > 1;
```

---

### Cause 2: `tabItem.stock_qty` Not Updated Correctly

**Problem:** `tabItem.stock_qty` might not be synchronized with `tabStockLedger` or `tabCartonStock`.

**Check:**
```sql
-- Compare tabItem.stock_qty with tabStockLedger sum
SELECT 
  i.code,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(sl.qty), 0) as ledger_total,
  (i.stock_qty - COALESCE(SUM(sl.qty), 0)) as difference
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
WHERE i.code = 'SKU-HAT-301-BLU-OS'
GROUP BY i.code, i.stock_qty;

-- Compare tabItem.stock_qty with tabCartonStock sum (latest records only)
SELECT 
  i.code,
  i.stock_qty as item_stock_qty,
  COALESCE(SUM(cs.qty), 0) as carton_stock_total
FROM tabItem i
LEFT JOIN tabCartonStock cs ON cs.item_code = i.code
  AND cs.id IN (
    SELECT MAX(id)
    FROM tabCartonStock
    WHERE item_code = cs.item_code
      AND carton_id = cs.carton_id
      AND bin_location = cs.bin_location
      AND warehouse = cs.warehouse
    GROUP BY carton_id, item_code, bin_location, warehouse
  )
WHERE i.code = 'SKU-HAT-301-BLU-OS'
  AND cs.qty > 0
  AND (cs.status IS NULL OR cs.status = '' OR cs.status = 'PUTAWAY')
GROUP BY i.code, i.stock_qty;
```

---

### Cause 3: Different Warehouse Filters

**Problem:** The main Items table might be filtering by a different warehouse than the Item Location Breakdown.

**Check:**
```sql
-- Check which warehouse the Item Location Breakdown is using
-- The desktop app tries multiple warehouses: "Main Warehouse", "WH-MAIN", "WH-Main"

-- Check stock in each warehouse
SELECT 
  warehouse,
  COALESCE(SUM(qty), 0) as total_qty
FROM tabStockLedger
WHERE item_code = 'SKU-HAT-301-BLU-OS'
GROUP BY warehouse;

-- Check carton stock in each warehouse
SELECT 
  warehouse,
  COALESCE(SUM(qty), 0) as total_qty
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND qty > 0
  AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
GROUP BY warehouse;
```

---

### Cause 4: Status Filter Mismatch

**Problem:** The Item Location Breakdown filters by `status IS NULL OR status = '' OR status = 'PUTAWAY'`, but `tabItem.stock_qty` might include stock with different statuses.

**Check:**
```sql
-- Check stock by status in tabCartonStock
SELECT 
  status,
  COUNT(*) as record_count,
  SUM(qty) as total_qty
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND bin_location = 'A1-R01-L3-B1'
GROUP BY status;
```

---

## ✅ Diagnostic Steps

### Step 1: Run Diagnostic SQL

Run `SCRIPTS/AnalyzeStockDiscrepancy.sql` to:
1. Check `tabItem.stock_qty`
2. Check `tabStockLedger` total
3. Check `tabCartonStock` total
4. Check for duplicate records
5. Check specific location (A1-R01-L3-B1)
6. Calculate what Item Location Breakdown should show

### Step 2: Check for Duplicates

```sql
-- Check if there are multiple records for the same carton+item+bin
SELECT 
  carton_id,
  item_code,
  bin_location,
  warehouse,
  COUNT(*) as count,
  SUM(qty) as total_qty,
  GROUP_CONCAT(CONCAT('id:', id, ',qty:', qty, ',batch:', IFNULL(batch_no, 'NULL')) ORDER BY id DESC) as details
FROM tabCartonStock
WHERE item_code = 'SKU-HAT-301-BLU-OS'
  AND bin_location = 'A1-R01-L3-B1'
GROUP BY carton_id, item_code, bin_location, warehouse
HAVING COUNT(*) > 1;
```

### Step 3: Verify `tabItem.stock_qty` Sync

```sql
-- Update tabItem.stock_qty to match tabStockLedger
UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = tabItem.code
),
updated_at = NOW()
WHERE code = 'SKU-HAT-301-BLU-OS';

-- Verify
SELECT 
  code,
  stock_qty,
  (SELECT COALESCE(SUM(qty), 0) FROM tabStockLedger WHERE item_code = tabItem.code) as ledger_total
FROM tabItem
WHERE code = 'SKU-HAT-301-BLU-OS';
```

---

## 🔧 Fix Strategy

### Fix 1: Remove Duplicate Records in `tabCartonStock`

If duplicates are found, keep only the most recent record (highest `id`):

```sql
-- Delete duplicate records, keeping only the most recent (highest id)
DELETE cs1 FROM tabCartonStock cs1
INNER JOIN tabCartonStock cs2
WHERE cs1.carton_id = cs2.carton_id
  AND cs1.item_code = cs2.item_code
  AND cs1.bin_location = cs2.bin_location
  AND cs1.warehouse = cs2.warehouse
  AND cs1.id < cs2.id
  AND cs1.item_code = 'SKU-HAT-301-BLU-OS'
  AND cs1.bin_location = 'A1-R01-L3-B1';
```

### Fix 2: Sync `tabItem.stock_qty` with `tabStockLedger`

```sql
-- Update all items' stock_qty from stock ledger
UPDATE tabItem
SET stock_qty = (
  SELECT COALESCE(SUM(qty), 0)
  FROM tabStockLedger
  WHERE item_code = tabItem.code
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 
  FROM tabStockLedger 
  WHERE item_code = tabItem.code
);
```

### Fix 3: Ensure Database Triggers Are Active

Check if triggers are updating `tabItem.stock_qty` automatically:

```sql
-- Check if triggers exist
SHOW TRIGGERS LIKE 'tabStockLedger%';
SHOW TRIGGERS LIKE 'tabCartonStock%';
```

If triggers don't exist, create them (see `SCRIPTS/CreateStockSyncTriggers.sql`).

---

## 📋 Summary

**Issue:** Item Location Breakdown shows 98, Main Items table shows 96 (2 unit difference)

**Most Likely Cause:** 
1. Duplicate records in `tabCartonStock` causing the sum to be 98 instead of 96
2. `tabItem.stock_qty` not synchronized with actual stock

**Next Steps:**
1. Run `SCRIPTS/AnalyzeStockDiscrepancy.sql` to diagnose
2. Check for duplicate records in `tabCartonStock`
3. Sync `tabItem.stock_qty` with `tabStockLedger`
4. Verify database triggers are active

---

**Status:** 🔍 **INVESTIGATION REQUIRED**  
**Date:** 2026-01-13  
**Item:** `SKU-HAT-301-BLU-OS`
