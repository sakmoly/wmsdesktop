# How to Create Stock Ledger Data

## Why No Results?

The `GET /api/stock-ledger/SKU-001/WH-MAIN` endpoint returns an empty array `[]` because:
- ✅ **API is working correctly**
- ❌ **No stock ledger data exists** for `SKU-001` in `WH-MAIN` warehouse

## How Stock Ledger Data is Created

Stock ledger entries are **automatically created** when you perform these operations:

### 1. **Complete Putaway Task** ✅
When you complete a putaway task, stock ledger entries are created:
```
POST /api/putaway/complete
```
This creates entries in `tabStockLedger` for each item at its bin location.

### 2. **Complete Transfer In** ✅
When you receive items via Transfer In:
```
POST /api/transfer-in/:title/receive-line
```
This creates stock ledger entries.

### 3. **Stock Adjustments** ✅
Manual stock adjustments create ledger entries.

---

## How to Check What Data Exists

### Option 1: Check All Stock Ledger Data
```sql
SELECT 
    item_code,
    warehouse,
    bin_location,
    qty
FROM tabStockLedger
ORDER BY item_code, warehouse
LIMIT 20;
```

### Option 2: Check Specific Warehouse
```sql
SELECT 
    item_code,
    bin_location,
    qty
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
ORDER BY item_code
LIMIT 20;
```

### Option 3: Check What Items Exist
```sql
SELECT DISTINCT item_code 
FROM tabStockLedger
WHERE warehouse = 'WH-MAIN'
ORDER BY item_code;
```

### Option 4: Use API to Check All Stock Ledger
```
GET /api/stock-ledger?warehouse=WH-MAIN
```

---

## How to Create Test Data

### Method 1: Complete a Putaway Task

1. **Create Putaway Task:**
   ```
   POST /api/putaway/create-tasks
   {
     "asn_no": "ASN-0001",
     "warehouse": "WH-MAIN"
   }
   ```

2. **Complete Putaway:**
   ```
   POST /api/putaway/complete
   {
     "putaway_task": "PUT-0001",
     "performed_by": "USER-001",
     "location_id": "A1-R01-L1-B1",
     "items": [{
       "item_code": "SKU-001",
       "qty": 50.00,
       "location_id": "A1-R01-L1-B1",
       "completed": true
     }]
   }
   ```

This will automatically create stock ledger entries.

### Method 2: Use Test SQL Script

Run `TEST_PUTAWAY_DATA.sql` or `TEST_PUTAWAY_DATA_SIMPLE.sql` to create test data.

### Method 3: Direct SQL Insert (for testing only)

```sql
INSERT INTO tabStockLedger 
  (item_code, warehouse, bin_location, qty, reserved_qty, 
   last_transaction_date, last_transaction_type, last_transaction_ref, 
   updated_at, created_at)
VALUES 
  ('SKU-001', 'WH-MAIN', 'A1-R01-L1-B1', 50.00, 0, 
   NOW(), 'Putaway', 'TEST-001', NOW(), NOW());
```

---

## Quick Test

Try these API calls to see what data exists:

1. **Get all stock ledger entries:**
   ```
   GET /api/stock-ledger?warehouse=WH-MAIN
   ```

2. **Get stock ledger for a different item:**
   ```
   GET /api/stock-ledger/{actual_item_code}/WH-MAIN
   ```
   (Replace `{actual_item_code}` with an item that exists in your database)

3. **Check what items have stock:**
   ```
   GET /api/master/stock-ledger?warehouse=WH-MAIN
   ```

---

## Summary

- ✅ API is working correctly
- ❌ No data exists for `SKU-001` in `WH-MAIN`
- 💡 Create stock data by completing putaway tasks or using test scripts
- 🔍 Use the SQL queries above to check what data exists

