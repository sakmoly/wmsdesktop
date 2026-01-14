# Cycle Count Carton ID Update Fix

## 🐛 Issue

Carton IDs from cycle count lines were not being propagated to stock tables (`tabStockLedger` and `tabCartonStock`) when a cycle count was completed/submitted. This caused a discrepancy where:

- **Cycle Count Task** showed carton_id: `CTN-333` (from `tabCycleCountLine`)
- **Item Location Breakdown** showed carton_id: `CTN-SKUJACKET2-A1` (from `tabCartonStock`, which was set by automated script, not from cycle count)

## 🔍 Root Cause

The `updateStockFromCycleCount` function in `cycleCountController.js` was:
1. ✅ Storing `carton_id` in `tabCycleCountLine` correctly
2. ❌ NOT including `carton_id` when updating `tabStockLedger`
3. ❌ NOT updating `tabCartonStock` at all when cycle count was completed

## ✅ Fix Applied

### 1. **Added carton_id to Stock Update Query**

**File:** `wms-api/src/modules/cycle-count/cycleCountController.js`

**Changes:**
- Modified the SELECT query to include `carton_id` from `tabCycleCountLine` (line ~304)
- Check if `carton_id` column exists in `tabStockLedger` before updating
- Include `carton_id` in INSERT/UPDATE query for `tabStockLedger` if column exists and value is provided (line ~451-457)

```javascript
// Check if carton_id column exists in tabStockLedger
const [stockLedgerCartonIdColumn] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabStockLedger' 
  AND COLUMN_NAME = 'carton_id'
`);
const hasStockLedgerCartonIdColumn = stockLedgerCartonIdColumn.length > 0;

// Include carton_id in UPDATE if column exists and cartonId is provided
if (hasStockLedgerCartonIdColumn && cartonId) {
  updateStockSql += `, carton_id`;
  valuesClause += `, ?`;
  updateClause += `, carton_id = ?`;
  params.push(cartonId);
  console.log(`[Cycle Count] 📦 Including carton_id in tabStockLedger update: ${cartonId} for item ${itemCode}`);
}
```

### 2. **Update tabCartonStock on Cycle Count Completion**

**File:** `wms-api/src/modules/cycle-count/cycleCountController.js`

**Changes:**
- Check if `tabCartonStock` table exists
- Update or create entry in `tabCartonStock` with the `carton_id` from cycle count line (line ~479-501)
- Use `actual_qty` (the quantity that was counted) as the quantity for carton stock

```javascript
// Update tabCartonStock if table exists and carton_id is provided
if (hasCartonStockTable && cartonId && binLocation) {
  try {
    // Use INSERT ... ON DUPLICATE KEY UPDATE to handle existing entries
    // Note: created_on has DEFAULT CURRENT_TIMESTAMP, so we don't set it manually
    await connection.execute(`
      INSERT INTO tabCartonStock 
        (carton_id, item_code, warehouse, bin_location, qty, status)
      VALUES 
        (?, ?, ?, ?, ?, 'PUTAWAY')
      ON DUPLICATE KEY UPDATE
        qty = VALUES(qty),
        updated_at = NOW(),
        status = 'PUTAWAY',
        bin_location = VALUES(bin_location)
    `, [cartonId, itemCode, warehouse, binLocation, actualQty]);
    
    console.log(`[Cycle Count] 📦 Updated tabCartonStock: carton_id=${cartonId}, item=${itemCode}, qty=${actualQty}, bin=${binLocation}`);
  } catch (cartonStockError) {
    console.warn(`[Cycle Count] ⚠️ Could not update tabCartonStock: ${cartonStockError.message}`);
    // Don't fail the transaction - stock ledger is already updated
  }
}
```

### 3. **Include carton_id in Stock Transaction Log**

**File:** `wms-api/src/modules/cycle-count/cycleCountController.js`

**Changes:**
- Check if `carton_id` column exists in `tabStockTransaction`
- Include `carton_id` in transaction log if column exists and value is provided (line ~518-542)

```javascript
// Check if carton_id column exists in tabStockTransaction
const [transactionCartonIdColumn] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'tabStockTransaction' 
  AND COLUMN_NAME = 'carton_id'
`);
const hasTransactionCartonIdColumn = transactionCartonIdColumn.length > 0;

// Include carton_id if column exists and cartonId is provided
if (hasTransactionCartonIdColumn && cartonId) {
  transactionSql += `, carton_id`;
  transactionValues += `, ?`;
  transactionParams.push(cartonId);
}
```

## 🧪 Testing

To verify the fix:

1. **Create a Cycle Count Task** with a carton_id
2. **Complete the cycle count** with items that have carton_id
3. **Check tabStockLedger**: Should have `carton_id` set if column exists
4. **Check tabCartonStock**: Should have entry with `carton_id` from cycle count
5. **Check Item Location Breakdown**: Should show the carton_id from cycle count

### Test Query:
```sql
-- Check cycle count line with carton_id
SELECT item_code, bin_location, carton_id, actual_qty, discrepancy
FROM tabCycleCountLine
WHERE parent_title = 'CC-A1-R01-L2-B1-MK8NYSXO'
  AND carton_id IS NOT NULL;

-- Check stock ledger with carton_id (if column exists)
SELECT item_code, bin_location, carton_id, qty
FROM tabStockLedger
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND bin_location = 'A1-R01-L2-B1';

-- Check carton stock
SELECT carton_id, item_code, bin_location, qty, status
FROM tabCartonStock
WHERE item_code = 'SKU-JACKET-201-BLK-L'
  AND bin_location = 'A1-R01-L2-B1';
```

## 📋 Data Flow

**Before Fix:**
```
Cycle Count (POST /api/cycle-count/:title/count)
  ↓
tabCycleCountLine.carton_id = "CTN-333" ✅
  ↓
Cycle Count Complete/Submit (POST /api/cycle-count/:title/submit)
  ↓
updateStockFromCycleCount()
  ↓
tabStockLedger.carton_id = NULL ❌ (not updated)
tabCartonStock = Not updated ❌
```

**After Fix:**
```
Cycle Count (POST /api/cycle-count/:title/count)
  ↓
tabCycleCountLine.carton_id = "CTN-333" ✅
  ↓
Cycle Count Complete/Submit (POST /api/cycle-count/:title/submit)
  ↓
updateStockFromCycleCount()
  ↓
tabStockLedger.carton_id = "CTN-333" ✅ (if column exists)
tabCartonStock.carton_id = "CTN-333" ✅ (carton_id, item_code, bin_location, qty)
tabStockTransaction.carton_id = "CTN-333" ✅ (if column exists)
```

## 🎯 Expected Behavior

After this fix:
1. ✅ `carton_id` from cycle count lines is propagated to `tabStockLedger` (if column exists)
2. ✅ `carton_id` from cycle count lines creates/updates entries in `tabCartonStock`
3. ✅ `carton_id` is included in stock transaction logs (if column exists)
4. ✅ Item Location Breakdown shows the carton_id from cycle count (not from automated script)
5. ✅ Carton IDs are consistent across all stock tables

## ⚠️ Notes

- The fix checks for column/table existence before updating, so it's backward compatible
- If `tabStockLedger` doesn't have `carton_id` column, only `tabCartonStock` will be updated
- If `tabCartonStock` doesn't exist, only `tabStockLedger` will be updated (if column exists)
- The fix uses `actual_qty` (counted quantity) for `tabCartonStock`, not `new_qty` (calculated after discrepancy)

---

**Status:** ✅ **FIXED**  
**Date:** 2026-01-10  
**Files Modified:** `wms-api/src/modules/cycle-count/cycleCountController.js`
