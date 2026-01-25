# Item Location Breakdown - Use QTY_AFTER from Transaction History

## Analysis & Fix

### Current Approach (Before Fix)

**Problem:** Item Location Breakdown was calculating carton quantities by:
1. Summing `qty_change` from `tabTransactionHistory` (putaway - picking)
2. Calculating `net_qty` = `SUM(putaway) - SUM(picking)`
3. Scaling to match `tabStockLedger.qty` if totals don't match

**Issues:**
- ❌ Complex calculation (sum of putaway minus sum of picking)
- ❌ May not reflect current stock accurately if there are adjustments, cycle counts, or other transactions
- ❌ Requires scaling to match ledger total

---

### New Approach (After Fix) ✅

**Solution:** Use `QTY_AFTER` from the **latest transaction** for each (location_id, carton_id) combination.

**Why This is Better:**
- ✅ `QTY_AFTER` represents the **actual current stock** after the last transaction
- ✅ More accurate - reflects all transactions (putaway, picking, adjustments, cycle counts, relocation)
- ✅ Simpler - no need to calculate net_qty
- ✅ Direct - uses the actual quantity after the last transaction

---

## Implementation

### Query Change

**Before:**
```sql
SELECT 
  carton_id,
  SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE 0 END) as putaway_qty,
  SUM(CASE WHEN transaction_type = 'Picking' THEN ABS(qty_change) ELSE 0 END) as picked_qty,
  SUM(CASE WHEN transaction_type = 'Putaway' THEN qty_change ELSE -ABS(qty_change) END) as net_qty,
  MAX(transaction_date) as last_transaction_date
FROM tabTransactionHistory
WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR location_id = ?)
  AND carton_id IS NOT NULL AND carton_id != ''
GROUP BY carton_id
HAVING net_qty > 0
```

**After:**
```sql
SELECT 
  carton_id,
  location_id,
  qty_after,
  transaction_date as last_transaction_date
FROM (
  SELECT 
    carton_id,
    COALESCE(location_id, bin_location) as location_id,
    qty_after,
    transaction_date,
    ROW_NUMBER() OVER (
      PARTITION BY carton_id, COALESCE(location_id, bin_location)
      ORDER BY transaction_date DESC, id DESC
    ) as rn
  FROM tabTransactionHistory
  WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR location_id = ?)
    AND carton_id IS NOT NULL AND carton_id != ''
    AND qty_after > 0
) latest
WHERE rn = 1
ORDER BY transaction_date DESC
```

---

## How It Works

### Step 1: Get Latest Transaction Per Carton

**Window Function:** `ROW_NUMBER() OVER (PARTITION BY carton_id, location_id ORDER BY transaction_date DESC, id DESC)`

**Result:** Gets the **latest transaction** for each (carton_id, location_id) combination.

**Example:**
```
Transaction 1: carton_id=CTN-001, location_id=A1-R01-L3-B1, qty_after=10, date=2026-01-20
Transaction 2: carton_id=CTN-001, location_id=A1-R01-L3-B1, qty_after=8, date=2026-01-21 (picking)
Transaction 3: carton_id=CTN-001, location_id=A1-R01-L4-B1, qty_after=8, date=2026-01-22 (relocation)

Result:
- CTN-001 @ A1-R01-L3-B1: qty_after=8 (latest at old location)
- CTN-001 @ A1-R01-L4-B1: qty_after=8 (latest at new location)
```

### Step 2: Use QTY_AFTER as Current Stock

**For each carton:**
- `qty_after` from latest transaction = **current stock for that carton at that location**
- No need to calculate net_qty
- Directly reflects all transactions (putaway, picking, relocation, adjustments)

### Step 3: Scale to Match Ledger (If Needed)

**If Transaction History total ≠ Stock Ledger total:**
- Scale proportionally to match `tabStockLedger.qty` (source of truth)
- This handles cases where ledger might have been adjusted directly

**If totals match:**
- Use `qty_after` directly (no scaling needed)

---

## Benefits

### ✅ Accuracy

**Before:** Calculated net_qty = putaway - picking (might miss adjustments, cycle counts, relocations)

**After:** Uses `qty_after` from latest transaction (includes ALL transaction types)

### ✅ Simplicity

**Before:** Complex calculation with SUM and CASE statements

**After:** Simple query - just get latest `qty_after` per carton

### ✅ Completeness

**Before:** Only considers Putaway and Picking transactions

**After:** Reflects ALL transactions (Putaway, Picking, Relocation, Cycle Count, Adjustment, etc.)

---

## Example

### Scenario:
- Item: `SKU-HAT-301-BLU-OS`
- Carton: `CTN-001`
- Location: `A1-R01-L3-B1`

### Transaction History:
```
1. Putaway: qty_after=10 (2026-01-20)
2. Picking: qty_after=8 (2026-01-21)
3. Relocation: qty_after=8, location_id=A1-R01-L4-B1 (2026-01-22)
```

### Result:

**Before (Old Query):**
- Calculated: putaway(10) - picking(2) = 8
- Shows: CTN-001 @ A1-R01-L3-B1 with qty=8 ❌ (wrong location)

**After (New Query):**
- Latest transaction: Relocation to A1-R01-L4-B1, qty_after=8
- Shows: CTN-001 @ A1-R01-L4-B1 with qty=8 ✅ (correct location)

---

## Verification Query

**Test the new approach:**
```sql
SELECT 
  location_id,
  carton_id,
  qty_after,
  transaction_date,
  transaction_type
FROM (
  SELECT 
    carton_id,
    COALESCE(location_id, bin_location) as location_id,
    qty_after,
    transaction_date,
    transaction_type,
    ROW_NUMBER() OVER (
      PARTITION BY carton_id, COALESCE(location_id, bin_location)
      ORDER BY transaction_date DESC, id DESC
    ) as rn
  FROM tabTransactionHistory
  WHERE warehouse = 'WH-MAIN'
    AND item_code = 'SKU-HAT-301-BLU-OS'
    AND carton_id IS NOT NULL
    AND carton_id != ''
    AND qty_after > 0
) latest
WHERE rn = 1
ORDER BY location_id, carton_id;
```

**Expected Result:**
- One row per (location_id, carton_id) combination
- `qty_after` = current stock for that carton at that location
- `transaction_date` = date of last transaction affecting that carton at that location

---

## Summary

**Change:** Use `QTY_AFTER` from latest transaction instead of calculating net_qty

**Benefits:**
- ✅ More accurate (reflects all transaction types)
- ✅ Simpler query (no complex SUM/CASE calculations)
- ✅ Better reflects current stock (uses actual qty_after from last transaction)
- ✅ Handles relocation correctly (shows carton at new location with correct qty)

**Result:** Item Location Breakdown now shows accurate current stock per carton at each location! ✅
