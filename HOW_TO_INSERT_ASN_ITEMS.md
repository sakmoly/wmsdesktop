# How to Insert Dummy ASN Items Data

## 📋 Overview

This guide helps you insert dummy data into the `tabAsnItemDetails` table after accidentally deleting the data.

## 🔍 Step 1: Check Existing ASN Records

First, check what ASN parent records exist in your database:

```sql
SELECT title, status, purchase_order, supplier 
FROM tabAdvanceShippingNotice 
ORDER BY title;
```

**Note:** The `tabAsnItemDetails` table has a foreign key to `tabAdvanceShippingNotice`, so you can only insert items for ASNs that exist.

## 📝 Step 2: Choose Your Script

### Option A: Complete Script (Creates ASNs + Items)
**File:** `DUMMY_ASN_ITEMS_DATA.sql`

This script:
- Creates 5 dummy ASN parent records (ASN-0001 through ASN-0005)
- Inserts 21 dummy item records across these ASNs
- Includes verification queries

**Use this if:** You don't have any ASN records or want fresh dummy data.

### Option B: Simple Script (Items Only)
**File:** `DUMMY_ASN_ITEMS_SIMPLE.sql`

This script:
- Only inserts item records
- Assumes ASN parent records already exist
- You need to adjust ASN titles to match your existing ASNs

**Use this if:** You already have ASN records and just need to add items.

## 🚀 Step 3: Execute the Script

### Using MySQL Command Line:

```bash
mysql -u your_username -p your_database_name < DUMMY_ASN_ITEMS_DATA.sql
```

### Using MySQL Workbench or phpMyAdmin:

1. Open the SQL script file
2. Review and adjust ASN titles if needed
3. Execute the script

### Using Desktop App Database Connection:

If you have database connection details in your desktop app settings, you can use a MySQL client to connect and run the script.

## 📊 Step 4: Verify the Data

After inserting, verify the data:

```sql
-- Check total items inserted
SELECT COUNT(*) AS total_items FROM tabAsnItemDetails;

-- Check items by ASN
SELECT 
    parent_title AS asn,
    COUNT(*) AS item_count,
    SUM(shipped_qty) AS total_qty,
    COUNT(DISTINCT carton_id) AS carton_count
FROM tabAsnItemDetails
GROUP BY parent_title
ORDER BY parent_title;

-- View all items
SELECT 
    parent_title AS asn,
    item_code,
    po_item_reference,
    shipped_qty,
    carton_id,
    carton_assigned_status
FROM tabAsnItemDetails
ORDER BY parent_title, carton_id, item_code;
```

## 🔧 Customizing the Data

### To Add Items for Your Existing ASN:

1. Find your ASN title:
   ```sql
   SELECT title FROM tabAdvanceShippingNotice;
   ```

2. Replace `'ASN-0002'` in the INSERT statements with your actual ASN title:
   ```sql
   INSERT INTO tabAsnItemDetails 
   (parent_title, item_code, po_item_reference, shipped_qty, carton_id, carton_assigned_status)
   VALUES
   ('YOUR-ASN-TITLE', 'SKU-ITEM-001', 'PO-REF-001', 50.00, 'CTN-0101', 'Assigned'),
   ('YOUR-ASN-TITLE', 'SKU-ITEM-002', 'PO-REF-002', 30.00, 'CTN-0102', 'Assigned');
   ```

### Field Descriptions:

- **parent_title**: Must match an existing ASN title from `tabAdvanceShippingNotice`
- **item_code**: SKU/item identifier (e.g., 'SKU-JEANS-001-BLU-32')
- **po_item_reference**: Purchase order item reference (can be NULL)
- **shipped_qty**: Quantity shipped (decimal number)
- **carton_id**: Carton identifier (can be NULL)
- **carton_assigned_status**: 'Assigned' or 'Missing' (default: 'Assigned')

## ⚠️ Important Notes

1. **Foreign Key Constraint**: The `parent_title` must exist in `tabAdvanceShippingNotice` table
2. **No Duplicates**: If you run the script multiple times, you may get duplicate key errors
3. **Carton IDs**: Carton IDs should be unique per ASN (e.g., CTN-0101, CTN-0102)
4. **Item Codes**: Item codes can be any format you prefer (e.g., SKU-XXX-XXX)

## 🧹 Clean Up (If Needed)

If you need to delete the dummy data:

```sql
-- Delete all items for specific ASNs
DELETE FROM tabAsnItemDetails WHERE parent_title IN ('ASN-0001', 'ASN-0002', 'ASN-0003');

-- Delete all items (be careful!)
DELETE FROM tabAsnItemDetails;
```

## ✅ Summary

1. Check existing ASN records
2. Choose the appropriate script (complete or simple)
3. Adjust ASN titles if needed
4. Execute the script
5. Verify the data

The dummy data includes:
- 5 ASN parent records
- 21 item detail records
- Multiple cartons per ASN
- Various item codes and quantities

