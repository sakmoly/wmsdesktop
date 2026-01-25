# Stock Ledger vs Transaction History Mismatch Analysis

## 🐛 Problem

**Stock Ledger** and **Transaction History** are showing different values for the same transaction:

**Stock Ledger shows:**
- Individual transaction details from `tabStockLedger`
- `qty_before` and `qty_reduced` from the **LAST individual transaction**
- Example: If picks are 2+2+1, shows: `qty_before=23, qty_reduced=-1` (last pick only)

**Transaction History shows:**
- Aggregated transaction details from `tabTransactionHistory`
- `qty_before` and `qty_change` from the **AGGREGATED transaction**
- Example: If picks are 2+2+1, shows: `qty_before=27, qty_change=-5` (sum of all picks)

**Result:** They don't match! ❌

---

## 🔍 Root Cause

1. **Material Request Picking:**
   - Each scan creates a record in `tabStockTransaction`
   - Each record updates `tabStockLedger` with individual transaction values
   - Database trigger aggregates records in `tabTransactionHistory`

2. **Stock Ledger Query:**
   - Queries `tabStockLedger` directly
   - Shows `qty_before` and `qty_reduced` from the **last individual transaction**
   - Does NOT use aggregated values from `tabTransactionHistory`

3. **Transaction History Query:**
   - Queries `tabTransactionHistory` (aggregated)
   - Shows `qty_before` and `qty_change` from the **aggregated transaction**

**Example Flow:**
```
Pick 1: qty_before=27, qty_reduced=-2, qty_after=25
  → tabStockLedger updated: qty_before=27, qty_reduced=-2
  → tabTransactionHistory: qty_before=27, qty_change=-2

Pick 2: qty_before=25, qty_reduced=-2, qty_after=23
  → tabStockLedger updated: qty_before=25, qty_reduced=-2
  → tabTransactionHistory: qty_before=27, qty_change=-4 (aggregated)

Pick 3: qty_before=23, qty_reduced=-1, qty_after=22
  → tabStockLedger updated: qty_before=23, qty_reduced=-1
  → tabTransactionHistory: qty_before=27, qty_change=-5 (aggregated)

Stock Ledger shows: qty_before=23, qty_reduced=-1 (last pick)
Transaction History shows: qty_before=27, qty_change=-5 (aggregated)
```

---

## 💡 Solution Options

### **Option 1: Join Stock Ledger with Transaction History (RECOMMENDED)** ⭐

**Approach:** Modify Stock Ledger query to join with `tabTransactionHistory` to get aggregated values.

**Pros:**
- ✅ Shows aggregated values (matches Transaction History)
- ✅ No changes to data storage
- ✅ Preserves individual transaction data in `tabStockLedger`

**Cons:**
- ⚠️ Requires join query (slight performance impact)
- ⚠️ Need to handle cases where Transaction History record doesn't exist

**Implementation:**
```sql
SELECT 
  sl.item_code,
  sl.warehouse,
  sl.bin_location,
  sl.qty,
  sl.reserved_qty,
  COALESCE(th.qty_before, sl.qty_before) as qty_before,
  COALESCE(th.qty_change, sl.qty_reduced) as qty_reduced,
  sl.last_transaction_date,
  sl.last_transaction_type,
  sl.last_transaction_ref
FROM tabStockLedger sl
LEFT JOIN tabTransactionHistory th ON 
  th.item_code = sl.item_code
  AND th.bin_location = sl.bin_location
  AND th.reference_doc = sl.last_transaction_ref
  AND th.transaction_type = sl.last_transaction_type
  AND DATE(th.transaction_date) = DATE(sl.last_transaction_date)
WHERE ...
```

---

### **Option 2: Update tabStockLedger with Aggregated Values**

**Approach:** When updating `tabStockLedger`, also update it with aggregated values from Transaction History.

**Pros:**
- ✅ Stock Ledger query stays simple
- ✅ No join needed

**Cons:**
- ❌ Requires complex logic to find and update aggregated values
- ❌ Risk of data inconsistency
- ❌ Performance impact (extra queries)

---

### **Option 3: Store Aggregated Values in tabStockLedger**

**Approach:** Modify Material Request picking to calculate aggregated values before updating `tabStockLedger`.

**Pros:**
- ✅ Simple query (no join)
- ✅ Consistent data

**Cons:**
- ❌ Requires significant API changes
- ❌ Complex aggregation logic in API
- ❌ Risk of bugs

---

## 🏆 Recommended Solution: **Option 1 (Join with Transaction History)**

### Implementation Details

**Modify `getStockLedger` function:**
1. Add LEFT JOIN with `tabTransactionHistory`
2. Use aggregated values from Transaction History when available
3. Fallback to `tabStockLedger` values if Transaction History record doesn't exist

**Join Criteria:**
- `item_code` = `item_code`
- `bin_location` = `bin_location` (or `location_id`)
- `reference_doc` = `last_transaction_ref`
- `transaction_type` = `last_transaction_type`
- `DATE(transaction_date)` = `DATE(last_transaction_date)`

**Fields to Use from Transaction History:**
- `qty_before` → Use from Transaction History (first pick)
- `qty_change` → Use from Transaction History (aggregated sum)
- `qty_after` → Use from `tabStockLedger` (current stock)

---

## 📝 Implementation Steps

1. **Modify Stock Ledger Query**
   - Add LEFT JOIN with `tabTransactionHistory`
   - Use `COALESCE` to prefer Transaction History values
   - Fallback to `tabStockLedger` values if not found

2. **Test Matching**
   - Verify Stock Ledger and Transaction History show same values
   - Test with multiple picks of same item
   - Test with different transaction types

3. **Handle Edge Cases**
   - Transaction History record doesn't exist (use `tabStockLedger` values)
   - Multiple Transaction History records (use most recent)
   - Different transaction types

---

## ✅ Expected Result

**After Fix:**
- Stock Ledger shows: `qty_before=27, qty_reduced=-5` (aggregated)
- Transaction History shows: `qty_before=27, qty_change=-5` (aggregated)
- **They match!** ✅
