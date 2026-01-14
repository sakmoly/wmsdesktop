# Stock Posting Auto-Correction Feature

## 🎯 Goal

Ensure that if any wrong calculation happens, it is **automatically fixed at the next transaction level**. The stock posting service now includes validation and auto-correction logic.

## ✅ Features Added

### 1. Item Stock Validation & Auto-Correction

**Location:** `rebuildItemStockSummary()` function

**What it does:**
- Compares calculated stock (from ledger/carton) with current `tabItem.stock_qty`
- If discrepancy > 0.01, logs warning and auto-corrects
- Always uses calculated value (source of truth)

**Example:**
```
Current tabItem.stock_qty: 350
Calculated from ledger: 348
Difference: -2
→ Auto-corrects to 348
```

### 2. Bin Stock Duplicate Detection & Removal

**Location:** `rebuildBinStockSummary()` function

**What it does:**
- Detects duplicate records in `tabStockLedger` for same (item_code, warehouse, bin_location)
- Consolidates duplicates by summing quantities
- Removes duplicate records, keeping only the most recent
- Validates and fixes bin-level discrepancies

**Example:**
```
Found 2 duplicate records for SKU-001 @ WH-MAIN/A1-R01-L3-B1
Record 1: qty = 50
Record 2: qty = 48
Total: 98
→ Consolidates to single record with qty = 98
→ Deletes duplicate records
```

### 3. Post-Posting Validation

**Location:** `postStock()` function (after rebuilding summaries)

**What it does:**
- After rebuilding summaries, validates final consistency
- Compares `tabItem.stock_qty` with `SUM(tabStockLedger.qty)`
- If discrepancy found, auto-corrects `tabItem.stock_qty`
- Logs warnings for any discrepancies fixed

**Example:**
```
After posting:
  tabItem.stock_qty: 350
  SUM(tabStockLedger.qty): 348
  Discrepancy: 2
→ Auto-corrects tabItem.stock_qty to 348
→ Logs warning
```

## 🔄 How It Works

### Flow Diagram

```
Transaction (e.g., Material Request Picking)
    ↓
Updates tabStockLedger / tabCartonStock
    ↓
Calls postStock()
    ↓
1. Rebuild Item Stock Summary
   ├─ Calculate from tabCartonStock (if available)
   ├─ Fall back to tabStockLedger
   ├─ Compare with current tabItem.stock_qty
   └─ Auto-correct if discrepancy found
    ↓
2. Rebuild Bin Stock Summary
   ├─ Detect duplicates
   ├─ Consolidate quantities
   ├─ Remove duplicate records
   └─ Validate bin-level stock
    ↓
3. Post-Posting Validation
   ├─ Compare tabItem.stock_qty vs SUM(ledger)
   ├─ Auto-correct if discrepancy
   └─ Log warnings
    ↓
✅ Stock consistent everywhere!
```

## 📊 Validation Checks

### Check 1: Item Stock Consistency
```javascript
// Before updating
currentStockQty = tabItem.stock_qty
calculatedQty = SUM(tabCartonStock) OR SUM(tabStockLedger)

if (Math.abs(calculatedQty - currentStockQty) > 0.01) {
  // Auto-correct
  UPDATE tabItem SET stock_qty = calculatedQty
}
```

### Check 2: Bin Stock Duplicates
```sql
-- Detect duplicates
SELECT item_code, warehouse, bin_location, COUNT(*) as count
FROM tabStockLedger
GROUP BY item_code, warehouse, bin_location
HAVING count > 1

-- Consolidate
SUM(qty) for duplicates

-- Remove extras (keep most recent)
DELETE duplicates WHERE id NOT IN (SELECT MAX(id))
```

### Check 3: Final Consistency
```javascript
// After all updates
ledgerTotal = SUM(tabStockLedger.qty)
itemStock = tabItem.stock_qty

if (Math.abs(ledgerTotal - itemStock) > 0.01) {
  // Auto-correct
  UPDATE tabItem SET stock_qty = ledgerTotal
}
```

## 🛡️ Error Prevention

### Prevents:
- ✅ Duplicate records in `tabStockLedger`
- ✅ Mismatched `tabItem.stock_qty` vs ledger totals
- ✅ Incorrect bin-level stock quantities
- ✅ Accumulated calculation errors

### Auto-Fixes:
- ✅ Consolidates duplicate bin records
- ✅ Corrects item stock to match ledger
- ✅ Removes orphaned or incorrect records
- ✅ Ensures consistency across all views

## 📝 Logging

### Normal Operation
```
✅ Rebuilt item stock summary for SKU-001: 348
✅ Rebuilt bin stock summary for 3 bin locations
✅ Stock posted for MR_PICK:MR-123: 1 items, 3 bin locations
```

### With Discrepancies
```
⚠️  Stock discrepancy detected for SKU-001:
   Current tabItem.stock_qty: 350
   Calculated from ledger/carton: 348
   Difference: -2
   Auto-correcting to calculated value...
✅ Fixed stock discrepancy for SKU-001: 350 → 348 (corrected by -2)
✅ Rebuilt bin stock summary: 3 locations, 1 duplicates fixed, 0 discrepancies fixed
⚠️  1 discrepancy(ies) detected and auto-corrected
```

## 🧪 Testing

### Test Case 1: Duplicate Records
```sql
-- Create duplicate
INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty)
VALUES ('SKU-001', 'WH-MAIN', 'A1-R01-L3-B1', 50);

INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty)
VALUES ('SKU-001', 'WH-MAIN', 'A1-R01-L3-B1', 48);

-- Run stock posting
-- Expected: Duplicates consolidated, single record with qty = 98
```

### Test Case 2: Item Stock Mismatch
```sql
-- Set incorrect item stock
UPDATE tabItem SET stock_qty = 350 WHERE code = 'SKU-001';
-- Actual ledger total: 348

-- Run stock posting
-- Expected: tabItem.stock_qty auto-corrected to 348
```

### Test Case 3: Multiple Issues
```sql
-- Create multiple issues
-- 1. Duplicate bin records
-- 2. Incorrect item stock
-- 3. Mismatched totals

-- Run stock posting
-- Expected: All issues detected and auto-corrected
```

## ⚙️ Configuration

### Discrepancy Threshold
Currently set to `0.01` (allows for floating-point rounding):
```javascript
const discrepancy = Math.abs(totalQty - currentStockQty);
if (discrepancy > 0.01) {
  // Auto-correct
}
```

### Auto-Correction Behavior
- **Always corrects** to calculated value (source of truth)
- **Logs warnings** for any corrections made
- **Returns warnings** in posting result for monitoring

## 📈 Benefits

1. **Self-Healing:** Automatically fixes calculation errors
2. **Consistency:** Ensures stock matches across all views
3. **Reliability:** Prevents accumulation of errors over time
4. **Transparency:** Logs all corrections for audit trail
5. **Proactive:** Fixes issues before they cause problems

## 🔍 Monitoring

### Check Posting Log
```sql
SELECT 
  posting_key,
  transaction_type,
  transaction_id,
  item_codes,
  posted_at
FROM tabStockPostingLog
WHERE transaction_type = 'MR_PICK'
ORDER BY posted_at DESC
LIMIT 10;
```

### Check for Discrepancies
```sql
-- Items with potential discrepancies
SELECT 
  i.code as item_code,
  i.stock_qty as item_stock,
  COALESCE(SUM(sl.qty), 0) as ledger_total,
  ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) as discrepancy
FROM tabItem i
LEFT JOIN tabStockLedger sl ON sl.item_code = i.code
GROUP BY i.code, i.stock_qty
HAVING ABS(i.stock_qty - COALESCE(SUM(sl.qty), 0)) > 0.01;
```

### Check for Duplicates
```sql
-- Bin locations with duplicates
SELECT 
  item_code,
  warehouse,
  bin_location,
  COUNT(*) as duplicate_count,
  SUM(qty) as total_qty
FROM tabStockLedger
GROUP BY item_code, warehouse, bin_location
HAVING COUNT(*) > 1;
```

## ✅ Result

- ✅ **Automatic error detection** at every transaction
- ✅ **Auto-correction** of any discrepancies found
- ✅ **Duplicate removal** from bin stock
- ✅ **Consistency validation** after each posting
- ✅ **Comprehensive logging** for audit trail

The system is now **self-healing** and will automatically fix any calculation errors at the next transaction level!
