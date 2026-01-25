# Material Request Transaction History Aggregation Analysis

## 📋 Current Behavior

**Current Flow:**
1. User scans each item during Material Request picking
2. Each scan creates a separate record in `tabStockTransaction`
3. Database trigger automatically creates a separate record in `tabTransactionHistory` for each scan
4. Result: Multiple records for the same item/location/carton/reference

**Example:**
- User picks 5 units of `SKU-HAT-301-BLU-OS` from `A1-R02-L2-B2` in carton `PAW-ASN365425480` for `MR-0001`
- If picked in 3 scans (2+2+1), creates 3 separate transaction history records
- User wants: **1 aggregated record** with `qty_change = -5.00`

---

## 🎯 Requirements

Aggregate transaction history by:
- ✅ **Item Code** (`item_code`)
- ✅ **Location ID** (`bin_location` / `location_id`)
- ✅ **Carton ID** (`carton_id`)
- ✅ **Reference Document** (`reference_doc`)

**Additional Considerations:**
- `qty_before`: Should be the initial quantity (first scan)
- `qty_after`: Should be the final quantity (last scan)
- `qty_change`: Should be the sum of all scans
- `transaction_date`: Should be the date of the first or last scan?
- `performed_by`: Should be the first user or last user?

---

## 💡 Solution Options

### **Option 1: Database Trigger Aggregation (RECOMMENDED)** ⭐

**Approach:** Modify the database trigger to check for existing records and update instead of insert.

**Pros:**
- ✅ No API code changes required
- ✅ Automatic aggregation
- ✅ Works for all transaction types (not just Material Request)
- ✅ Preserves individual records in `tabStockTransaction` (full audit trail)

**Cons:**
- ⚠️ Trigger complexity increases
- ⚠️ Potential race conditions (multiple concurrent picks)
- ⚠️ Need to handle `qty_before` and `qty_after` correctly

**Implementation:**
```sql
-- In trigger: Check if record exists with same item_code, location_id, carton_id, reference_doc
-- If exists: UPDATE qty_change = qty_change + NEW.qty_change, qty_after = NEW.qty_after
-- If not exists: INSERT new record
```

**Time Window:** Aggregate within a time window (e.g., 5 minutes) or same transaction session?

---

### **Option 2: API-Level Batch Aggregation**

**Approach:** Collect all picks in a batch, aggregate, then insert once per unique combination.

**Pros:**
- ✅ Clean aggregation logic
- ✅ Full control over aggregation rules
- ✅ Can handle complex business rules

**Cons:**
- ❌ Requires significant API refactoring
- ❌ Need to track pending transactions
- ❌ Error handling complexity
- ❌ Only works if all picks are in same API call

**Implementation:**
- Modify `pickMaterialRequestItems` to collect all picks first
- Group by (item_code, location_id, carton_id, reference_doc)
- Insert aggregated records

---

### **Option 3: View-Based Aggregation**

**Approach:** Keep individual records, create a view that aggregates for display.

**Pros:**
- ✅ Preserves full audit trail
- ✅ Simple implementation
- ✅ No data changes

**Cons:**
- ❌ Base table still has individual records
- ❌ Desktop app needs to query view instead of table
- ❌ Doesn't solve the "too many records" problem

---

### **Option 4: Hybrid Approach (BEST)** ⭐⭐⭐

**Approach:** 
- Keep individual records in `tabStockTransaction` (operational table - full audit trail)
- Aggregate in `tabTransactionHistory` using trigger (reporting table - summarized view)

**Pros:**
- ✅ Best of both worlds
- ✅ Full audit trail preserved in operational table
- ✅ Clean aggregated view in history table
- ✅ No API changes needed
- ✅ Works for all transaction types

**Cons:**
- ⚠️ Trigger complexity (but manageable)

**Implementation:**
1. `tabStockTransaction`: Keep individual records (no changes)
2. `tabTransactionHistory`: Trigger checks for existing record with same:
   - `item_code`
   - `bin_location` / `location_id`
   - `carton_id`
   - `reference_doc`
   - `transaction_type`
   - Within time window (e.g., same day or 1 hour window)
3. If exists: UPDATE `qty_change = qty_change + NEW.qty_change`, `qty_after = NEW.qty_after`
4. If not exists: INSERT new record

---

## 🏆 Recommended Solution: **Option 4 (Hybrid Approach)**

### Implementation Details

**Time Window Strategy:**
- **Option A:** Same day (aggregate all picks for same item/location/carton/reference on same day)
- **Option B:** Time window (e.g., 1 hour - aggregate picks within 1 hour)
- **Option C:** Session-based (aggregate picks in same Material Request picking session)

**Recommendation:** **Option A (Same Day)** - Simplest and most intuitive

**Fields to Aggregate:**
- `qty_change`: SUM (add all qty_change values)
- `qty_after`: Use NEW.qty_after (latest value)
- `qty_before`: Use existing qty_before (first value)
- `transaction_date`: Use existing transaction_date (first scan time)
- `performed_by`: Use existing performed_by (first user) OR NEW.performed_by (last user)

**SQL Logic:**
```sql
-- Check if record exists
SELECT id, qty_change, qty_before, qty_after 
FROM tabTransactionHistory
WHERE item_code = NEW.item_code
  AND bin_location = NEW.bin_location
  AND carton_id = NEW.carton_id
  AND reference_doc = NEW.reference_doc
  AND transaction_type = NEW.transaction_type
  AND DATE(transaction_date) = DATE(NEW.transaction_date)
LIMIT 1;

-- If exists: UPDATE
UPDATE tabTransactionHistory
SET qty_change = qty_change + NEW.qty_change,
    qty_after = NEW.qty_after,
    updated_at = NOW()
WHERE id = existing_id;

-- If not exists: INSERT (normal insert)
```

---

## 📝 Implementation Steps

1. **Modify Database Trigger** (`trg_log_transaction_history_insert`)
   - Add check for existing record
   - Update if exists, insert if not
   - Handle time window logic

2. **Test Aggregation**
   - Test with multiple picks of same item
   - Test with different items
   - Test with different locations
   - Test with different cartons
   - Test with different reference docs

3. **Clean Up Existing Duplicates**
   - Run script to aggregate existing duplicate records
   - Keep one record per unique combination

---

## ⚠️ Edge Cases to Consider

1. **Different Users:** Multiple users picking same item - use first user or last user?
2. **Different Times:** Picks spread across hours - aggregate same day or time window?
3. **Partial Picks:** User picks 3, then picks 2 more later - should aggregate?
4. **Cancelled Picks:** What if a pick is cancelled/rolled back?
5. **Concurrent Picks:** Two users picking simultaneously - race condition handling

---

## ✅ Recommendation Summary

**Best Solution:** **Option 4 (Hybrid Approach)**
- Modify database trigger to aggregate in `tabTransactionHistory`
- Keep individual records in `tabStockTransaction`
- Aggregate by: item_code + location_id + carton_id + reference_doc + transaction_type + same day
- Time window: Same day (DATE(transaction_date) = DATE(NEW.transaction_date))

**Benefits:**
- ✅ No API changes
- ✅ Automatic aggregation
- ✅ Preserves full audit trail
- ✅ Clean reporting view
- ✅ Works for all transaction types
