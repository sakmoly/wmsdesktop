# Stock Ledger and Carton ID - Implementation Plan

## 📋 Current Implementation Strategy

### **Hybrid Approach (Recommended) ✅**

We are using a **dual-table approach** instead of adding `carton_id` to `tabStockLedger`:

#### **Bin-Level Mode:**
- **Table:** `tabStockLedger`
- **Tracking Level:** `item_code + warehouse + bin_location`
- **No Carton ID:** Carton ID is NOT stored in stock ledger
- **Use Case:** Traditional inventory tracking by bin location only

#### **Carton-Level Mode:**
- **Table:** `tabCartonStock` (separate table)
- **Tracking Level:** `carton_id + item_code + warehouse + bin_location`
- **Carton ID Required:** Every stock record has a carton_id
- **Use Case:** Track which specific carton contains which items in which bin

---

## 🎯 Why NOT Add `carton_id` to `tabStockLedger`?

### **Problems with Adding `carton_id` Column:**

1. **Unique Key Complexity:**
   ```sql
   -- Would need conditional unique key:
   -- If carton_id IS NULL → unique on (item_code, warehouse, bin_location)
   -- If carton_id IS NOT NULL → unique on (item_code, warehouse, bin_location, carton_id)
   -- MySQL doesn't support partial unique indexes easily
   ```

2. **Performance Issues:**
   - NULL values in indexes reduce performance
   - Queries become more complex with NULL checks
   - Indexes less efficient with nullable columns

3. **Data Integrity:**
   - Risk of mixing bin-level and carton-level records
   - Harder to validate data consistency
   - Complex constraints needed

4. **Query Complexity:**
   - Every query needs to check if carton_id is NULL or NOT NULL
   - Aggregations become more complex
   - Reporting queries need conditional logic

---

## ✅ Current Solution: Separate Tables

### **Table Structure:**

#### **1. `tabStockLedger` (Bin-Level Mode)**
```sql
CREATE TABLE tabStockLedger (
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,  -- NULL = warehouse-level
  qty DECIMAL(10,2) NOT NULL,
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  available_qty DECIMAL(10,2) GENERATED ALWAYS AS (qty - reserved_qty) STORED,
  UNIQUE KEY uk_item_warehouse_bin (item_code, warehouse, bin_location),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location)
);
```
- **No `carton_id` column** - stays bin-level only
- Used when `InventoryTrackingMode = "BinLevel"`

#### **2. `tabCartonStock` (Carton-Level Mode)**
```sql
CREATE TABLE tabCartonStock (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  carton_id VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  uom VARCHAR(50) NULL,
  batch_no VARCHAR(100) NULL,
  serial_no VARCHAR(100) NULL,
  status VARCHAR(50) DEFAULT 'PUTAWAY',
  UNIQUE KEY uk_carton_item_batch (carton_id, item_code, batch_no),
  INDEX idx_carton_id (carton_id),
  INDEX idx_item_code (item_code),
  INDEX idx_warehouse (warehouse),
  INDEX idx_bin_location (bin_location)
);
```
- **Has `carton_id` column** - required for carton-level tracking
- Used when `InventoryTrackingMode = "CartonLevel"`

#### **3. `tabStockTransaction` (Transaction Log)**
```sql
CREATE TABLE tabStockTransaction (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  carton_id VARCHAR(100) NULL,  -- ✅ Added for transaction logging
  qty_change DECIMAL(10,2) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  -- ... other fields
  INDEX idx_carton_id (carton_id)
);
```
- **Has `carton_id` column** - for transaction history/audit trail
- Used in BOTH modes for logging transactions

---

## 🔄 How It Works

### **Stock Update Flow:**

```csharp
// In StockLedgerService.UpdateStockAsync()

if (IsCartonLevelMode(settings) && !string.IsNullOrEmpty(cartonId))
{
    // Carton-Level Mode: Update tabCartonStock
    await UpdateCartonStockAsync(...);
    // Also log to tabStockTransaction with carton_id
}
else
{
    // Bin-Level Mode: Update tabStockLedger
    await UpdateBinLevelStockAsync(...);
    // Log to tabStockTransaction (carton_id = NULL)
}
```

### **Stock Query Flow:**

```csharp
// In ItemLocationBreakdownViewModel

if (IsCartonLevelMode)
{
    // Query tabCartonStock
    var stock = await CartonDataService.GetCartonStockAsync(...);
}
else
{
    // Query tabStockLedger
    var stock = await StockLedgerService.GetStockByBinAsync(...);
}
```

---

## 📊 Benefits of This Approach

### ✅ **Advantages:**

1. **Clean Separation:**
   - Bin-level and carton-level data are completely separate
   - No mixing of data types
   - Easier to understand and maintain

2. **Performance:**
   - Optimized indexes for each table
   - No NULL value performance issues
   - Faster queries (no conditional logic needed)

3. **Backward Compatibility:**
   - Existing bin-level data remains unchanged
   - Can switch modes without data migration
   - Old queries still work

4. **Data Integrity:**
   - Clear constraints on each table
   - No risk of invalid data combinations
   - Easier to validate

5. **Flexibility:**
   - Can run both modes side-by-side (for testing)
   - Easy to rollback if needed
   - Can aggregate from carton to bin level if needed

---

## 🔍 Summary

### **Stock Ledger (`tabStockLedger`):**
- ❌ **NO `carton_id` column** - stays bin-level only
- ✅ Used for bin-level inventory mode
- ✅ Maintains backward compatibility

### **Carton Stock (`tabCartonStock`):**
- ✅ **HAS `carton_id` column** - required for carton tracking
- ✅ Used for carton-level inventory mode
- ✅ Tracks: carton + item + bin + quantity

### **Stock Transaction (`tabStockTransaction`):**
- ✅ **HAS `carton_id` column** - for audit trail
- ✅ Used in BOTH modes for transaction logging
- ✅ Records all stock movements with carton context (if available)

---

## 🎯 Conclusion

**The stock ledger (`tabStockLedger`) does NOT need a `carton_id` column.**

Instead, we use:
- **`tabStockLedger`** for bin-level inventory (no carton tracking)
- **`tabCartonStock`** for carton-level inventory (with carton tracking)
- **`tabStockTransaction`** for transaction logging (with optional carton_id)

This hybrid approach provides the best performance, maintainability, and flexibility.

