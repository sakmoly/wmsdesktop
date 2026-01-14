# How to Add Test Carton-Level Inventory Data

## Quick Start

After running Migration 005, you can add test carton data to see carton-level inventory in action.

## Option 1: Using the SQL Script (Recommended)

1. **Run the test data script:**
   ```sql
   SOURCE INSERT_TEST_CARTON_INVENTORY.sql;
   ```

   Or in MySQL Workbench/phpMyAdmin:
   - Open `INSERT_TEST_CARTON_INVENTORY.sql`
   - Execute the script

2. **The script will:**
   - Create 5 test bins (BIN-001 to BIN-005)
   - Create 7 test cartons (CARTON-001 to CARTON-007)
   - Add items to cartons (uses existing items from your database)
   - Create carton stock records

## Option 2: Manual Insertion

### Step 1: Create Bins

```sql
INSERT IGNORE INTO tabBin (bin_id, warehouse_id, zone, aisle, rack, level, position, bin_type, is_active)
VALUES
    ('BIN-001', 'Main Warehouse', 'Zone-A', 'Aisle-1', 'Rack-01', 'Level-1', 'Position-1', 'STORAGE', TRUE),
    ('BIN-002', 'Main Warehouse', 'Zone-A', 'Aisle-1', 'Rack-01', 'Level-1', 'Position-2', 'STORAGE', TRUE);
```

### Step 2: Create Cartons

```sql
INSERT IGNORE INTO tabCarton (carton_id, asn_no, status, current_bin_id, warehouse, created_on)
VALUES
    ('CARTON-001', 'ASN-0001', 'PUTAWAY', 'BIN-001', 'Main Warehouse', NOW()),
    ('CARTON-002', 'ASN-0001', 'PUTAWAY', 'BIN-001', 'Main Warehouse', NOW());
```

### Step 3: Add Items to Cartons

Replace `'YOUR-ITEM-CODE'` with an actual item code from your database:

```sql
INSERT IGNORE INTO tabCartonItem (carton_id, item_code, uom, qty, is_closed)
VALUES
    ('CARTON-001', 'YOUR-ITEM-CODE', 'Nos', 10.00, FALSE),
    ('CARTON-002', 'YOUR-ITEM-CODE', 'Nos', 15.00, FALSE);
```

### Step 4: Create Carton Stock

```sql
INSERT IGNORE INTO tabCartonStock (carton_id, item_code, warehouse, bin_location, qty, uom, status)
VALUES
    ('CARTON-001', 'YOUR-ITEM-CODE', 'Main Warehouse', 'BIN-001', 10.00, 'Nos', 'PUTAWAY'),
    ('CARTON-002', 'YOUR-ITEM-CODE', 'Main Warehouse', 'BIN-001', 15.00, 'Nos', 'PUTAWAY');
```

## Verify the Data

### Check Cartons Created

```sql
SELECT 
    carton_id,
    status,
    current_bin_id,
    warehouse
FROM tabCarton
ORDER BY carton_id;
```

### Check Carton Stock

```sql
SELECT 
    carton_id,
    item_code,
    bin_location,
    qty,
    status
FROM tabCartonStock
ORDER BY item_code, bin_location, carton_id;
```

### Check Item Inventory by Carton

```sql
SELECT 
    cs.item_code,
    cs.bin_location,
    cs.carton_id,
    cs.qty,
    b.zone,
    b.rack,
    b.level
FROM tabCartonStock cs
LEFT JOIN tabBin b ON cs.bin_location = b.bin_id
WHERE cs.status = 'PUTAWAY'
ORDER BY cs.item_code, cs.bin_location;
```

## View in Desktop App

1. **Enable Carton Mode:**
   - Settings → Inventory Tracking Mode → Select "Carton Level Inventory" → Save

2. **View Item Inventory:**
   - Go to **Items** menu
   - Select an item that has carton data
   - Click **"Show Location Breakdown"**
   - You should see the **Carton ID** column with carton-level inventory

## Test Data Summary

The test script creates:
- **5 Bins:** BIN-001 to BIN-005 in different zones/racks
- **7 Cartons:** CARTON-001 to CARTON-007
- **Multiple Items:** Uses existing items from your database
- **Carton Stock:** Each carton has stock in a specific bin

## Notes

- The script uses `INSERT IGNORE` so it's safe to run multiple times
- It automatically detects existing items from your database
- If no items exist, it uses default test item codes
- All cartons are in "PUTAWAY" status (ready for picking)

---

**File:** `INSERT_TEST_CARTON_INVENTORY.sql`  
**Status:** Ready to use

