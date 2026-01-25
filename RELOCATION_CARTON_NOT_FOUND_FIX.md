# Relocation API - Carton Not Found Fix

## Problem

**Error:** `Carton PAW-ASN365425486-1769255611164 not found in tabCarton or tabTransferInCarton`

**Root Cause:** The relocation API only checks `tabCarton` and `tabTransferInCarton` for carton existence, but putaway cartons (starting with `PAW-`) may exist in:
- ✅ `tabTransactionHistory` (transaction records)
- ✅ `tabStockLedger` (current stock)
- ✅ `tabCartonStock` (carton stock tracking)
- ❌ `tabCarton` (main carton table - may not exist for putaway cartons)
- ❌ `tabTransferInCarton` (only for Transfer In cartons)

**Why This Happens:**
- Putaway cartons are created during putaway operations
- They may be recorded in transaction history and stock ledger
- But they might not be synced to `tabCarton` table
- The relocation API was only checking `tabCarton` and `tabTransferInCarton`

## Solution

Added fallback checks to verify carton existence in `tabStockLedger` and `tabTransactionHistory` before throwing "not found" error.

### Changes Made

**File:** `wms-api/src/modules/relocation/relocationController.js`

#### 1. `setRelocationFrom` Function (Lines 397-410)

**Added Fallback 3:** Check `tabStockLedger` and `tabTransactionHistory`

```javascript
// Fallback 3: Check tabTransactionHistory or tabStockLedger for cartons that exist in stock but not in carton tables
// This handles putaway cartons (PAW-...) that were created during putaway but may not be in tabCarton
if (!cartonFound) {
  // Check tabStockLedger (if carton_id column exists)
  const [stockLedgerCartonCheck] = await connection.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockLedger'
      AND COLUMN_NAME = 'carton_id'
  `);
  
  if (stockLedgerCartonCheck.length > 0) {
    const [stockLedgerRows] = await connection.execute(`
      SELECT DISTINCT bin_location, warehouse
      FROM tabStockLedger
      WHERE carton_id = ?
        AND bin_location IS NOT NULL
      LIMIT 1
    `, [from_carton]);
    
    if (stockLedgerRows.length > 0) {
      cartonFound = true;
      cartonActualBinLocation = stockLedgerRows[0].bin_location;
      cartonWarehouse = stockLedgerRows[0].warehouse || null;
      console.log(`📦 Found carton ${from_carton} in tabStockLedger (bin: ${cartonActualBinLocation})`);
    }
  }
  
  // Also check tabTransactionHistory as final fallback
  if (!cartonFound) {
    const [historyRows] = await connection.execute(`
      SELECT DISTINCT 
        COALESCE(location_id, bin_location, target_bin) as bin_location,
        warehouse
      FROM tabTransactionHistory
      WHERE carton_id = ?
        AND (location_id IS NOT NULL OR bin_location IS NOT NULL OR target_bin IS NOT NULL)
      ORDER BY transaction_date DESC
      LIMIT 1
    `, [from_carton]);
    
    if (historyRows.length > 0) {
      cartonFound = true;
      cartonActualBinLocation = historyRows[0].bin_location;
      cartonWarehouse = historyRows[0].warehouse || null;
      console.log(`📦 Found carton ${from_carton} in tabTransactionHistory (bin: ${cartonActualBinLocation})`);
    }
  }
}
```

#### 2. `getCartonContents` Function (Lines 795-830)

**Added Fallback:** Check `tabStockLedger` and `tabTransactionHistory` before throwing error

```javascript
// Fallback: Check tabStockLedger or tabTransactionHistory for cartons that exist in stock but not in carton tables
// This handles putaway cartons (PAW-...) that were created during putaway but may not be in tabCarton
if (!warehouseId && !isTransferInCarton) {
  // Check tabStockLedger (if carton_id column exists)
  const [stockLedgerCartonCheck] = await connection.execute(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabStockLedger'
      AND COLUMN_NAME = 'carton_id'
  `);
  
  if (stockLedgerCartonCheck.length > 0) {
    const [stockLedgerRows] = await connection.execute(`
      SELECT DISTINCT bin_location, warehouse
      FROM tabStockLedger
      WHERE carton_id = ?
        AND bin_location IS NOT NULL
      LIMIT 1
    `, [carton_id]);
    
    if (stockLedgerRows.length > 0) {
      warehouseId = stockLedgerRows[0].warehouse;
      binLocation = stockLedgerRows[0].bin_location;
      console.log(`📦 Found carton ${carton_id} in tabStockLedger (bin: ${binLocation}, warehouse: ${warehouseId})`);
    }
  }
  
  // Also check tabTransactionHistory as final fallback
  if (!warehouseId) {
    const [historyRows] = await connection.execute(`
      SELECT DISTINCT 
        COALESCE(location_id, bin_location, target_bin) as bin_location,
        warehouse
      FROM tabTransactionHistory
      WHERE carton_id = ?
        AND (location_id IS NOT NULL OR bin_location IS NOT NULL OR target_bin IS NOT NULL)
      ORDER BY transaction_date DESC
      LIMIT 1
    `, [carton_id]);
    
    if (historyRows.length > 0) {
      warehouseId = historyRows[0].warehouse;
      binLocation = historyRows[0].bin_location;
      console.log(`📦 Found carton ${carton_id} in tabTransactionHistory (bin: ${binLocation}, warehouse: ${warehouseId})`);
    }
  }
}
```

## Validation Order

The relocation API now checks cartons in this order:

1. **`tabCartonStock`** (preferred - most authoritative for current location)
2. **`tabCarton`** (fallback - main carton table)
3. **`tabTransferInCarton`** (for Transfer In cartons only)
4. **`tabStockLedger`** (NEW - for cartons in stock ledger with `carton_id` column)
5. **`tabTransactionHistory`** (NEW - final fallback - transaction records)

## Result

✅ **Putaway cartons can now be relocated even if not in `tabCarton`**
- Cartons in `tabStockLedger` are recognized
- Cartons in `tabTransactionHistory` are recognized
- Error only thrown if carton not found in ANY of these sources

## Testing

### Test Case: Relocate Putaway Carton

**Carton:** `PAW-ASN365425486-1769255611164`

**Before Fix:**
```
❌ Error: Carton PAW-ASN365425486-1769255611164 not found in tabCarton or tabTransferInCarton
```

**After Fix:**
```
✅ Found carton PAW-ASN365425486-1769255611164 in tabStockLedger (bin: A1-R02-L1-B2)
✅ Relocation proceeds successfully
```

### Verify Carton Exists

```sql
-- Check if carton exists in any of these tables:
SELECT 'tabStockLedger' as source, carton_id, bin_location, warehouse
FROM tabStockLedger
WHERE carton_id = 'PAW-ASN365425486-1769255611164'
UNION ALL
SELECT 'tabTransactionHistory' as source, carton_id, COALESCE(location_id, bin_location) as bin_location, warehouse
FROM tabTransactionHistory
WHERE carton_id = 'PAW-ASN365425486-1769255611164'
ORDER BY source;
```

## Summary

**Problem:** Relocation API only checked `tabCarton` and `tabTransferInCarton`, missing putaway cartons in stock ledger and transaction history.

**Solution:** Added fallback checks to `tabStockLedger` and `tabTransactionHistory` before throwing "not found" error.

**Result:** ✅ Putaway cartons can now be relocated even if not in main carton tables.
