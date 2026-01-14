# Auto Run Material Request Stock Fix

## 🚀 Quick Start

### Option 1: Run SQL Script Directly (Easiest)

**Using MySQL Workbench / phpMyAdmin:**
1. Open `SCRIPTS/AutoRunMaterialRequestStockFix.sql`
2. Edit `@item_code` variable if needed (line 7)
3. Execute the script

**Using MySQL Command Line:**
```bash
mysql -u [username] -p [database] < SCRIPTS/AutoRunMaterialRequestStockFix.sql
```

---

### Option 2: Run PowerShell Script

```powershell
# Navigate to project directory
cd "D:\Development Project\Printechs WMS\Wms.Desktop"

# Run auto-fix script
.\SCRIPTS\AutoFixMaterialRequestStock.ps1 -ItemCode "SKU-HAT-301-BLU-OS"
```

---

### Option 3: Run Batch Script

```batch
# Double-click or run from command prompt
SCRIPTS\RunAutoFixMaterialRequestStock.bat
```

---

## 📋 What the Scripts Do

### AutoRunMaterialRequestStockFix.sql

1. **Diagnostic:** Shows current state (item_stock_qty, ledger_total, carton_stock_total)
2. **Remove Duplicates:** Deletes duplicate records in `tabCartonStock` (keeps latest)
3. **Sync from tabCartonStock:** Updates `tabItem.stock_qty` from `tabCartonStock` (priority)
4. **Sync from tabStockLedger:** Updates `tabItem.stock_qty` from `tabStockLedger` (fallback)
5. **Verification:** Confirms the fix worked
6. **Check Triggers:** Verifies triggers are active

---

## ✅ After Running

### 1. Restart API Server

```bash
# Stop current server (Ctrl+C)
# Then restart:
cd wms-api
npm start
```

### 2. Refresh Desktop App

1. Refresh the Items list
2. Open Item Location Breakdown for the item
3. Both should show the same quantity

---

## 🔍 Verification

After running the script, check the verification output:

**Expected Result:**
```
sync_status: ✅ Match
item_stock_qty = carton_stock_total
```

**If Still Mismatch:**
1. Check for duplicate records (run diagnostic again)
2. Ensure triggers are active (should show 6 triggers)
3. Check if Material Request picking is updating both tables correctly

---

## 📝 Script Details

### Variables

**AutoRunMaterialRequestStockFix.sql:**
- `@item_code`: Item code to fix (default: 'SKU-HAT-301-BLU-OS')
- Edit line 7 to change the item

### What Gets Changed

1. **tabCartonStock:** Duplicate records deleted
2. **tabItem.stock_qty:** Updated to match `tabCartonStock` (priority) or `tabStockLedger` (fallback)

### Safety

- Scripts use `DELETE` to remove duplicates (keeps most recent record)
- Scripts use `UPDATE` to sync `tabItem.stock_qty`
- **No data loss** - only removes duplicate records
- **Backup recommended** before running on production

---

## 🎯 Expected Results

**Before Fix:**
- Main Items table: `146`
- Item Location Breakdown: `148`
- **Difference:** `2 units`

**After Fix:**
- Main Items table: `148` (synced from `tabCartonStock`)
- Item Location Breakdown: `148` (from `tabCartonStock`)
- **Difference:** `0 units` ✅

---

**Status:** ✅ **READY TO RUN**  
**Date:** 2026-01-13
