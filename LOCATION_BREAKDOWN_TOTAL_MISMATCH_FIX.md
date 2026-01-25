# Location Breakdown Total Mismatch Fix

## 🐛 Problem

**Location Breakdown** shows **57 total** (25 + 20 + 2 + 10), but **actual stock is 52**.

**Root Cause:**
- Location A1-R02-L2-B2: Transaction History shows cartons with net_qty = 2 + 20 = **22**
- But tabStockLedger shows: **17** for that location
- The carton with net_qty = -5 is excluded (HAVING net_qty > 0)
- So we're showing 22 instead of 17

**Breakdown:**
- A1-R01-L2-B1: 25 ✓ (matches ledger)
- A1-R02-L2-B2: 20 + 2 = 22 ✗ (should be 17)
- B3-R01-L1-B3: 10 ✓ (matches ledger)
- **Total: 25 + 22 + 10 = 57** (should be 52)

---

## ✅ Fix Applied

**File**: `wms-api/src/modules/stock-ledger/stockLedgerController.js` (Line ~1117-1143)

**Solution**: Scale Transaction History carton quantities proportionally to match ledger total.

**Logic:**
1. Calculate `historyTotalQty` = sum of all cartons' net_qty from Transaction History
2. Compare with `ledgerTotalQty` from tabStockLedger
3. If they don't match, scale each carton: `(net_qty / historyTotalQty) * ledgerTotalQty`

**Example for A1-R02-L2-B2:**
- Transaction History: 2 + 20 = 22
- Ledger: 17
- Scaling:
  - Carton 1: 2 * (17/22) = **1.55**
  - Carton 2: 20 * (17/22) = **15.45**
  - Total: 1.55 + 15.45 = **17** ✓

---

## 📊 Expected Results

**After Fix:**
- A1-R01-L2-B1: 25.00 ✓
- A1-R02-L2-B2: 1.55 + 15.45 = 17.00 ✓
- B3-R01-L1-B3: 10.00 ✓
- **Total: 25 + 17 + 10 = 52** ✓

---

## ⚠️ Next Steps

1. **Restart API server** to apply the fix
2. **Test Location Breakdown** - should show 52 total
3. **Verify each location** - quantities should match ledger

---

## 🔍 Technical Details

**Scaling Formula:**
```javascript
if (Math.abs(historyTotalQty - ledgerTotalQty) > 0.01 && historyTotalQty > 0) {
  cartonQty = (netQty / historyTotalQty) * ledgerTotalQty;
}
```

**Why Scaling is Needed:**
- Transaction History shows historical net quantities per carton
- Some cartons may have been partially picked/dispatched
- Ledger shows current stock (source of truth)
- We need to scale carton quantities to match current stock while preserving proportions
