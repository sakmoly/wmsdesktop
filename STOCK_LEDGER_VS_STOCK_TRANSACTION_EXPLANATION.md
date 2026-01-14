# Stock Ledger vs Stock Transaction - How They Work

## 📊 Two Different Tables for Different Purposes

### 1. **tabStockLedger** (Current Stock - REPLACES/UPDATES)

**Purpose:** Shows **CURRENT stock quantity** at each location (item + warehouse + bin_location)

**Database Structure:**
```sql
CREATE TABLE tabStockLedger (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,  -- CURRENT stock at this location
  reserved_qty DECIMAL(10,2) DEFAULT 0,
  qty_before DECIMAL(10,2) NULL,          -- Stock before LAST transaction
  qty_reduced DECIMAL(10,2) NULL,         -- Amount of LAST transaction
  last_transaction_date TIMESTAMP NULL,
  last_transaction_type VARCHAR(50) NULL,
  last_transaction_ref VARCHAR(100) NULL,
  UNIQUE KEY uk_item_warehouse_bin (item_code, warehouse, bin_location)  -- ← KEY POINT
);
```

**How It Works:**
- ✅ **ONE record per item+warehouse+bin_location combination**
- ✅ **UPDATES existing record** (does NOT create new record)
- ✅ Shows **CURRENT stock** at that location
- ✅ `qty_before` and `qty_reduced` show the **LAST transaction only**

**Example:**
```
Initial State:
- Item: SKU-JACKET-201-BLK-L
- Bin: A1-R01-L3-B1
- Qty: 150.00

After Picking 2 items:
- Item: SKU-JACKET-201-BLK-L
- Bin: A1-R01-L3-B1
- Qty: 148.00  ← UPDATED (not a new record)
- Qty Before: 150.00
- Qty Reduced: -2.00

After Picking 1 more item:
- Item: SKU-JACKET-201-BLK-L
- Bin: A1-R01-L3-B1
- Qty: 147.00  ← UPDATED again (same record)
- Qty Before: 148.00  ← REPLACED (shows last transaction only)
- Qty Reduced: -1.00  ← REPLACED (shows last transaction only)
```

**Why This Design:**
- ✅ Fast queries (one record per location)
- ✅ Shows current stock immediately
- ✅ Efficient for real-time inventory display
- ❌ Does NOT keep transaction history (that's what `tabStockTransaction` is for)

---

### 2. **tabStockTransaction** (Transaction History - ADDS NEW RECORDS)

**Purpose:** Stores **COMPLETE HISTORY** of all stock movements (audit trail)

**Database Structure:**
```sql
CREATE TABLE tabStockTransaction (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,  -- ← No unique key, allows multiple records
  transaction_date TIMESTAMP NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  reference_doc_type VARCHAR(50) NULL,
  reference_doc VARCHAR(100) NULL,
  item_code VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL,
  bin_location VARCHAR(100) NULL,
  qty_change DECIMAL(10,2) NOT NULL,     -- Transaction amount
  qty_before DECIMAL(10,2) NOT NULL,      -- Stock before THIS transaction
  qty_after DECIMAL(10,2) NOT NULL,       -- Stock after THIS transaction
  source_bin VARCHAR(100) NULL,
  target_bin VARCHAR(100) NULL,
  performed_by VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**How It Works:**
- ✅ **NEW record for EACH transaction**
- ✅ **NEVER updates** existing records
- ✅ Shows **COMPLETE HISTORY** of all transactions
- ✅ Each transaction has its own `qty_before`, `qty_after`, `qty_change`

**Example:**
```
Transaction 1 (Picking 2 items):
- ID: 1
- Item: SKU-JACKET-201-BLK-L
- Bin: A1-R01-L3-B1
- Qty Before: 150.00
- Qty Change: -2.00
- Qty After: 148.00
- Transaction Date: 2026-01-13 20:20

Transaction 2 (Picking 1 item):
- ID: 2  ← NEW RECORD
- Item: SKU-JACKET-201-BLK-L
- Bin: A1-R01-L3-B1
- Qty Before: 148.00
- Qty Change: -1.00
- Qty After: 147.00
- Transaction Date: 2026-01-13 20:22

Both records exist - complete history is maintained!
```

**Why This Design:**
- ✅ Complete audit trail
- ✅ Can see all transactions for an item
- ✅ Can calculate stock at any point in time
- ✅ Useful for reporting and analysis

---

## 🔄 How They Work Together

### When Picking Items:

**1. Update tabStockLedger (REPLACE/UPDATE):**
```sql
-- Updates existing record (or creates if doesn't exist)
INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, qty_before, qty_reduced, ...)
VALUES 
  ('SKU-JACKET-201-BLK-L', 'WH-MAIN', 'A1-R01-L3-B1', 147.00, 148.00, -1.00, ...)
ON DUPLICATE KEY UPDATE
  qty = 147.00,           -- ← REPLACES old qty
  qty_before = 148.00,    -- ← REPLACES old qty_before
  qty_reduced = -1.00,    -- ← REPLACES old qty_reduced
  last_transaction_date = NOW(),
  ...
```

**Result:** One record per location, always shows CURRENT stock and LAST transaction.

**2. Insert into tabStockTransaction (ADD NEW):**
```sql
-- Always creates NEW record
INSERT INTO tabStockTransaction 
  (transaction_date, transaction_type, item_code, warehouse, bin_location, 
   qty_change, qty_before, qty_after, ...)
VALUES 
  (NOW(), 'Picking', 'SKU-JACKET-201-BLK-L', 'WH-MAIN', 'A1-R01-L3-B1',
   -1.00, 148.00, 147.00, ...)
```

**Result:** New record added, complete history maintained.

---

## 📊 Visual Comparison

### tabStockLedger (Current Stock):
```
| item_code          | warehouse | bin_location   | qty   | qty_before | qty_reduced |
|--------------------|-----------|----------------|-------|------------|-------------|
| SKU-JACKET-201-BLK-L | WH-MAIN  | A1-R01-L3-B1   | 147.00| 148.00     | -1.00       |
```
**One row per location** - shows CURRENT stock and LAST transaction only.

### tabStockTransaction (History):
```
| id | item_code          | bin_location   | qty_change | qty_before | qty_after | transaction_date |
|----|--------------------|----------------|------------|------------|-----------|------------------|
| 1  | SKU-JACKET-201-BLK-L | A1-R01-L3-B1 | -2.00      | 150.00     | 148.00    | 2026-01-13 20:20 |
| 2  | SKU-JACKET-201-BLK-L | A1-R01-L3-B1 | -1.00      | 148.00     | 147.00    | 2026-01-13 20:22 |
```
**Multiple rows** - shows COMPLETE history of all transactions.

---

## 🎯 Summary

### tabStockLedger:
- ✅ **REPLACES/UPDATES** existing record
- ✅ One record per item+warehouse+bin_location
- ✅ Shows CURRENT stock
- ✅ Shows LAST transaction only (`qty_before`, `qty_reduced`)
- ✅ Used for: Real-time stock display, Item Location Breakdown

### tabStockTransaction:
- ✅ **ADDS NEW** record for each transaction
- ✅ Multiple records per item+warehouse+bin_location
- ✅ Shows COMPLETE history
- ✅ Each transaction has its own `qty_before`, `qty_after`, `qty_change`
- ✅ Used for: Audit trail, reporting, transaction history

---

## 🔍 How to View Data

### View Current Stock (tabStockLedger):
```sql
SELECT * FROM tabStockLedger 
WHERE item_code = 'SKU-JACKET-201-BLK-L' 
  AND bin_location = 'A1-R01-L3-B1';
```
**Returns:** One row showing current stock (147.00)

### View Transaction History (tabStockTransaction):
```sql
SELECT * FROM tabStockTransaction 
WHERE item_code = 'SKU-JACKET-201-BLK-L' 
  AND bin_location = 'A1-R01-L3-B1'
ORDER BY transaction_date DESC;
```
**Returns:** Multiple rows showing all transactions (picking 2 items, then picking 1 item, etc.)

---

## ✅ This is CORRECT Behavior

**The design is intentional:**
- `tabStockLedger` = Current state (fast, efficient)
- `tabStockTransaction` = Complete history (audit trail)

**Both are updated when picking items:**
1. `tabStockLedger` is UPDATED (replaces old values)
2. `tabStockTransaction` gets a NEW record (adds to history)

---

**Status:** ✅ **DESIGN EXPLANATION**  
**Date:** 2026-01-13
