# Warehouse Name vs Code Guide

## Important: Stock Ledger Uses Warehouse NAME, Not CODE

### The Issue

The `tabStockLedger` table stores the warehouse **name** (e.g., "Main Warehouse"), not the warehouse **code** (e.g., "WH-MAIN").

### Warehouse Master Table Structure

```sql
tabWarehouse (
  code VARCHAR(100) PRIMARY KEY,  -- e.g., "WH-MAIN"
  name VARCHAR(255) NOT NULL,      -- e.g., "Main Warehouse"
  warehouse_type VARCHAR(50),      -- e.g., "Warehouse" or "Store"
  ...
)
```

### Stock Ledger Table Structure

```sql
tabStockLedger (
  item_code VARCHAR(100),
  warehouse VARCHAR(100),  -- Stores the NAME, not the CODE!
  bin_location VARCHAR(100),
  qty DECIMAL(10,2),
  ...
)
```

## How to Check What Warehouse Values Exist

### Option 1: Check via SQL

```sql
-- Check what warehouse names are in stock ledger
SELECT DISTINCT warehouse, COUNT(*) as count
FROM tabStockLedger
GROUP BY warehouse
ORDER BY count DESC;

-- Check warehouse master table
SELECT code, name, warehouse_type
FROM tabWarehouse
ORDER BY code;
```

### Option 2: Check via API

```
GET /api/master/warehouses
```

This returns both `code` and `name` for all warehouses.

## API Usage

### ✅ Correct Usage

```
GET /api/stock-ledger?warehouse=Main Warehouse
GET /api/stock-ledger/SKU-001/Main Warehouse
```

### ❌ Incorrect Usage

```
GET /api/stock-ledger?warehouse=WH-MAIN  ❌ (won't find data)
GET /api/stock-ledger/SKU-001/WH-MAIN     ❌ (won't find data)
```

## Why This Happens

When putaway tasks are completed, the system:
1. Gets the warehouse from the ASN or defaults to "Main Warehouse"
2. Stores the warehouse **name** in `tabStockLedger.warehouse`
3. The API does an exact match: `WHERE warehouse = ?`

## Solution

### For API Calls:
- Use the warehouse **name** (e.g., "Main Warehouse")
- Not the warehouse **code** (e.g., "WH-MAIN")

### To Find the Correct Warehouse Name:

1. **Check existing stock ledger data:**
   ```sql
   SELECT DISTINCT warehouse FROM tabStockLedger;
   ```

2. **Or use the master data API:**
   ```
   GET /api/master/warehouses
   ```
   Then use the `name` field, not the `code` field.

## Postman Collection

The Postman collection has been updated to use "Main Warehouse" (name) instead of "WH-MAIN" (code) for all stock ledger endpoints.

## Summary

- ✅ **Stock Ledger API:** Use warehouse **NAME** (e.g., "Main Warehouse")
- ❌ **Stock Ledger API:** Don't use warehouse **CODE** (e.g., "WH-MAIN")
- 💡 **Check first:** Use `GET /api/master/warehouses` to see available warehouses
- 📝 **Note:** This is a data consistency issue - the system stores names, not codes

