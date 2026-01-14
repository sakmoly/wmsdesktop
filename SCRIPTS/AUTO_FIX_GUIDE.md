# Auto Fix Stock Discrepancy - Guide

## 🚀 Quick Start

### Option 1: Fix Single Item (Recommended)

**Run this script to fix a specific item:**

```sql
-- Edit the @item_code variable at the top of the script
-- Then run: SCRIPTS/AutoFixStockDiscrepancy.sql
```

**Or use PowerShell:**

```powershell
# Fix specific item
.\SCRIPTS\RunAutoFix.ps1 -ItemCode "SKU-HAT-301-BLU-OS"

# Or with custom database credentials
.\SCRIPTS\RunAutoFix.ps1 -ItemCode "SKU-HAT-301-BLU-OS" -Database "wms_db" -User "root" -Password "password"
```

---

### Option 2: Fix All Items

**Run this script to fix ALL items in the database:**

```sql
-- Run: SCRIPTS/AutoFixAllItemsStock.sql
```

**Or use PowerShell:**

```powershell
# Fix all items
.\SCRIPTS\RunAutoFix.ps1 -AllItems

# Or with custom database credentials
.\SCRIPTS\RunAutoFix.ps1 -AllItems -Database "wms_db" -User "root" -Password "password"
```

---

## 📋 What the Scripts Do

### AutoFixStockDiscrepancy.sql (Single Item)

1. **Diagnostic:** Shows current state of the item
2. **Identify Duplicates:** Finds duplicate records in `tabCartonStock`
3. **Delete Duplicates:** Removes duplicates, keeping only the most recent record
4. **Update tabItem.stock_qty:** Syncs with `tabStockLedger`
5. **Verification:** Confirms the fix worked

### AutoFixAllItemsStock.sql (All Items)

1. **Delete All Duplicates:** Removes duplicate records for all items
2. **Update All Items:** Syncs `tabItem.stock_qty` for all items
3. **Verification:** Shows items that still have mismatches

---

## 🔧 Manual Execution

### Using MySQL Command Line

```bash
# Fix single item
mysql -u [username] -p [database] < SCRIPTS/AutoFixStockDiscrepancy.sql

# Fix all items
mysql -u [username] -p [database] < SCRIPTS/AutoFixAllItemsStock.sql
```

### Using MySQL Workbench / phpMyAdmin

1. Open the SQL script file
2. Edit the `@item_code` variable (for single item fix)
3. Execute the script

---

## ✅ After Running the Fix

1. **Rebuild Desktop App** (if code changes were made)
2. **Refresh Items List** in the desktop app
3. **Open Item Location Breakdown** for the item
4. **Verify** both show the same quantity

---

## 🔍 Troubleshooting

### Error: "MySQL command-line client not found"

**Solution:** Install MySQL client or add it to your PATH

**Windows:**

- Download MySQL Installer from https://dev.mysql.com/downloads/installer/
- Install MySQL Server (includes command-line client)
- Add `C:\Program Files\MySQL\MySQL Server X.X\bin` to PATH

**Or use MySQL Workbench:**

- Open the SQL script in MySQL Workbench
- Execute it manually

---

### Error: "Access denied for user"

**Solution:** Check your database credentials

```powershell
# Provide credentials explicitly
.\SCRIPTS\RunAutoFix.ps1 -ItemCode "SKU-HAT-301-BLU-OS" -Database "wms_db" -User "root" -Password "your_password"
```

---

### Script Runs But Quantities Still Don't Match

**Possible Causes:**

1. Desktop app not rebuilt (code changes not applied)
2. Desktop app cache (restart the app)
3. Database triggers not active (check `SCRIPTS/CreateStockSyncTriggers.sql`)

**Solution:**

1. Rebuild desktop app
2. Restart desktop app
3. Run database triggers script if needed

---

## 📝 Script Details

### Variables

**AutoFixStockDiscrepancy.sql:**

- `@item_code`: Item code to fix (default: 'SKU-HAT-301-BLU-OS')

**AutoFixAllItemsStock.sql:**

- No variables (fixes all items)

### What Gets Changed

1. **tabCartonStock:** Duplicate records deleted
2. **tabItem.stock_qty:** Updated to match `tabStockLedger`

### Safety

- Scripts use `DELETE` to remove duplicates (keeps most recent record)
- Scripts use `UPDATE` to sync `tabItem.stock_qty`
- **No data loss** - only removes duplicate records
- **Backup recommended** before running on production

---

## 🎯 Expected Results

**Before Fix:**

- Main Items table: `96`
- Item Location Breakdown: `98`
- **Difference:** `2 units`

**After Fix:**

- Main Items table: `96` (or correct value)
- Item Location Breakdown: `96` (or correct value)
- **Difference:** `0 units` ✅

---

## 📞 Support

If the fix doesn't work:

1. Check the verification output in the script
2. Run diagnostic script: `SCRIPTS/AnalyzeStockDiscrepancy.sql`
3. Check for database triggers: `SHOW TRIGGERS LIKE 'tabStockLedger%';`
4. Rebuild desktop app to ensure code changes are applied

---

**Status:** ✅ **READY TO USE**  
**Date:** 2026-01-13
