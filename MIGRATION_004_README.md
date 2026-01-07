# Migration 004: Make Purchase Order Optional for ASN Import

## Purpose
This migration allows ASN (Advance Shipping Notice) imports without requiring a Purchase Order number. The `purchase_order` column in `tabAdvanceShippingNotice` table will be changed from `NOT NULL` to `NULL`.

## When to Run
Run this migration if you want to import ASNs without Purchase Order numbers.

## How to Run

### Option 1: Using MySQL Command Line
```bash
mysql -u your_username -p your_database_name < MIGRATION_004_ASN_PURCHASE_ORDER_NULLABLE.sql
```

### Option 2: Using MySQL Workbench or phpMyAdmin
1. Open the migration file: `MIGRATION_004_ASN_PURCHASE_ORDER_NULLABLE.sql`
2. Copy the SQL command
3. Execute it in your MySQL client

### Option 3: Direct SQL Command
Run this SQL command in your MySQL client:
```sql
ALTER TABLE tabAdvanceShippingNotice 
MODIFY COLUMN purchase_order VARCHAR(100) NULL;
```

## Verification
After running the migration, verify the change:
```sql
DESCRIBE tabAdvanceShippingNotice;
```

You should see `purchase_order` with `NULL` in the "Null" column instead of "NO".

## What Changed
- **Database Schema**: `purchase_order` column is now nullable
- **Import Code**: Already handles empty Purchase Order values correctly
- **Template**: Purchase Order field is optional in the Excel template

## Notes
- Existing ASNs with Purchase Orders will not be affected
- The index on `purchase_order` will still work (MySQL allows NULL values in indexed columns)
- New ASN imports can now have empty Purchase Order fields

