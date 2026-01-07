# Update Existing Putaway Stock - SQL Script Guide

## 📋 Overview

This guide explains how to update existing putaway tasks that have locations assigned but stock wasn't updated yet. This is useful for backfilling stock data for putaway tasks that were completed before the stock update fix was implemented.

---

## 📁 Files Created

1. **`UPDATE_EXISTING_PUTAWAY_STOCK.sql`** - Comprehensive update script
2. **`UPDATE_EXISTING_PUTAWAY_STOCK_SIMPLE.sql`** - Simpler version with verification queries (Recommended)

---

## ⚠️ Before Running

1. **Backup your database** - Always backup before running update scripts
2. **Review the queries** - Check what will be updated
3. **Test on a development database first** - Verify the results

---

## 🚀 How to Use

### Option 1: Using MySQL Command Line

```bash
# Connect to your database
mysql -u your_username -p your_database_name

# Run the script
source UPDATE_EXISTING_PUTAWAY_STOCK_SIMPLE.sql
```

### Option 2: Using MySQL Workbench / phpMyAdmin

1. Open MySQL Workbench or phpMyAdmin
2. Select your database
3. Open the SQL script file
4. Execute the queries step by step (recommended) or all at once

### Option 3: Using Node.js Script (if you prefer)

You can also use the existing `wms-api/run-stock-ledger-from-putaway.js` script, but it only handles completed tasks.

---

## 📊 What the Script Does

### Step 1: Check Current State
- Shows putaway tasks that need stock updates
- Displays task status, line counts, and quantities

### Step 2: Update Stock Ledger
- Creates/updates `tabStockLedger` entries for putaway lines with locations
- Only processes lines that haven't been updated yet (checks by `last_transaction_ref`)
- Combines rack and bin into `bin_location` format: `{rack}-{bin}`

### Step 3: Create Stock Transactions
- Creates audit trail records in `tabStockTransaction`
- Records quantity changes, before/after quantities
- Links to putaway task for reference

### Step 4: Update Item Stock
- Updates `tabItem.stock_qty` to sum all locations for each item
- Only updates items that have putaway lines with locations

### Step 5: Mark Tasks as Completed
- Updates putaway task status to "Completed" if:
  - Task has locations assigned
  - Task has items with quantities
  - Task is not already "Completed"

### Step 6: Verification
- Shows summary of what was updated
- Counts of tasks, stock ledger entries, transactions, and items updated

### Step 7: Sample Data
- Shows sample of updated putaway tasks
- Displays item codes, quantities, locations, and stock quantities

---

## 🔍 Verification Queries

After running the script, verify the results:

```sql
-- Check putaway tasks status
SELECT title, status, advance_shipping_notice, created_at, updated_at
FROM tabPutawayTask
WHERE status = 'Completed'
ORDER BY updated_at DESC;

-- Check stock ledger entries
SELECT 
  item_code,
  warehouse,
  bin_location,
  qty,
  last_transaction_type,
  last_transaction_ref
FROM tabStockLedger
WHERE last_transaction_type = 'Putaway'
ORDER BY updated_at DESC
LIMIT 20;

-- Check item stock quantities
SELECT 
  code,
  name,
  stock_qty,
  updated_at
FROM tabItem
WHERE stock_qty > 0
ORDER BY updated_at DESC
LIMIT 20;

-- Check stock transactions
SELECT 
  transaction_date,
  transaction_type,
  reference_doc,
  item_code,
  qty_change,
  qty_before,
  qty_after
FROM tabStockTransaction
WHERE transaction_type = 'Putaway'
ORDER BY created_at DESC
LIMIT 20;
```

---

## ⚙️ Script Details

### Warehouse Detection
The script automatically detects the warehouse from:
1. ASN's `store` field (from `tabAdvanceShippingNotice`)
2. Defaults to "Main Warehouse" if not found

### Location Format
- If both rack and bin exist: `{rack}-{bin}` (e.g., "STAGE-01-SL-01")
- If only rack exists: `{rack}` (e.g., "STAGE-01")
- If neither exists: `NULL` (warehouse-level stock)

### Duplicate Prevention
- Checks `last_transaction_ref` to avoid duplicate updates
- Uses `ON DUPLICATE KEY UPDATE` for stock ledger
- Skips transactions that already exist

---

## 🐛 Troubleshooting

### Issue: "No rows updated"
- Check if putaway lines have `rack` assigned
- Verify `item_code` is not NULL
- Check if stock ledger entries already exist for these tasks

### Issue: "Duplicate key error"
- This is normal - the script uses `ON DUPLICATE KEY UPDATE`
- It will update existing entries instead of creating duplicates

### Issue: "Wrong warehouse"
- Check ASN's `store` field in `tabAdvanceShippingNotice`
- Verify warehouse name matches your setup
- Update the default warehouse in the script if needed

### Issue: "Stock quantities don't match"
- Run verification queries to check stock ledger
- Verify putaway line quantities are correct
- Check if there are other stock transactions affecting the same items

---

## 📝 Example Output

After running the script, you should see:

```
+----------------------------------------+-------+
| summary                                | count |
+----------------------------------------+-------+
| Putaway Tasks Marked Completed         |     2 |
| Stock Ledger Entries Created/Updated  |    10 |
| Stock Transactions Created            |    10 |
| Items Stock Updated                    |     5 |
+----------------------------------------+-------+
```

---

## ✅ Success Criteria

After running the script, verify:

- [ ] Putaway tasks with locations are marked "Completed"
- [ ] Stock ledger has entries for all putaway items with locations
- [ ] `tabItem.stock_qty` reflects the sum of all locations
- [ ] Stock transaction records exist for audit trail
- [ ] Desktop app shows correct stock quantities

---

## 🔄 Re-running the Script

The script is **idempotent** - you can run it multiple times safely:
- It checks for existing entries before creating new ones
- It only updates tasks that need updating
- It won't create duplicate transactions

However, if you need to re-run:
1. The script will update existing stock ledger entries (adds quantities)
2. It will skip creating duplicate transactions
3. It will update item stock quantities again

---

## 📞 Support

If you encounter issues:
1. Check the verification queries to see what was updated
2. Review the sample data output
3. Check database logs for any errors
4. Verify putaway task and line data is correct

---

## 🎯 Next Steps

After running the script:
1. **Restart the backend server** to ensure all changes are loaded
2. **Refresh the desktop app** to see updated stock quantities
3. **Test putaway flow** in mobile app to verify new putaway tasks update stock correctly
4. **Monitor stock transactions** to ensure future putaway completions work as expected

