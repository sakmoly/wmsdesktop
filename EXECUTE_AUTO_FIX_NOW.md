# Execute Auto Fix - Step by Step Guide

## ✅ All Code Fixes Applied

1. ✅ Backend code fix (prioritizes `tabCartonStock`)
2. ✅ Desktop app code fix (handles `batch_no` correctly)
3. ✅ Event insertion fix (detects duplicates)

---

## 🚀 Execute SQL Script Now

### Option 1: MySQL Workbench (Easiest - Recommended)

1. **Open MySQL Workbench**
2. **Connect to your database**
3. **Open File:** `SCRIPTS/AutoRunMaterialRequestStockFix.sql`
4. **Edit line 7** if needed:
   ```sql
   SET @item_code = 'SKU-HAT-301-BLU-OS';  -- Change this if needed
   ```
5. **Click Execute** (or press `Ctrl+Shift+Enter`)
6. **Review the output** - you should see:
   - Current state
   - Duplicates removed
   - Sync completed
   - Verification showing "✅ Match"

---

### Option 2: MySQL Command Line

**If MySQL is installed and in PATH:**

```bash
# Navigate to project directory
cd "D:\Development Project\Printechs WMS\Wms.Desktop"

# Run the script
mysql -u root -p wms_database < SCRIPTS/AutoRunMaterialRequestStockFix.sql
```

**You will be prompted for password.**

---

### Option 3: phpMyAdmin

1. **Open phpMyAdmin** in your browser
2. **Select your database**
3. **Click "SQL" tab**
4. **Copy and paste** the contents of `SCRIPTS/AutoRunMaterialRequestStockFix.sql`
5. **Edit `@item_code`** if needed (line 7)
6. **Click "Go"** to execute

---

## 📋 What the Script Does

The script will automatically:

1. **Diagnose:** Show current state (item_stock_qty, ledger_total, carton_stock_total)
2. **Remove Duplicates:** Delete duplicate records in `tabCartonStock` (keeps latest)
3. **Sync from tabCartonStock:** Update `tabItem.stock_qty` from `tabCartonStock` (priority)
4. **Sync from tabStockLedger:** Update `tabItem.stock_qty` from `tabStockLedger` (fallback)
5. **Verify:** Confirm the fix worked (should show "✅ Match")
6. **Check Triggers:** Verify triggers are active

---

## ✅ After Running the Script

### 1. Restart API Server

```bash
# Stop current server (Ctrl+C in terminal)
# Then restart:
cd wms-api
npm start
```

### 2. Rebuild Desktop App

1. Open Visual Studio
2. Rebuild the solution (to apply code changes)
3. Run the desktop app

### 3. Verify Fix

1. **Refresh Items List** in desktop app
2. **Open Item Location Breakdown** for `SKU-HAT-301-BLU-OS`
3. **Check quantities:**
   - Main Items table: Should show correct value
   - Item Location Breakdown: Should show same value
   - **Both should match** ✅

---

## 🎯 Expected Results

**Before Fix:**
- Main Items: `146`
- Item Location Breakdown: `148`
- **Difference:** `2 units` ❌

**After Fix:**
- Main Items: `148` (synced from `tabCartonStock`)
- Item Location Breakdown: `148` (from `tabCartonStock`)
- **Difference:** `0 units` ✅

---

## 📝 Script Location

**File:** `SCRIPTS/AutoRunMaterialRequestStockFix.sql`

**To change item code:** Edit line 7:
```sql
SET @item_code = 'YOUR-ITEM-CODE-HERE';
```

---

## 🔍 Verification

After running the script, check the verification output:

**Look for:**
```
sync_status: ✅ Match
```

**If you see "❌ Mismatch":**
1. Check for duplicate records (run diagnostic again)
2. Ensure triggers are active (should show 6 triggers)
3. Restart API server
4. Rebuild desktop app

---

**Status:** ✅ **READY TO EXECUTE**  
**Date:** 2026-01-13
