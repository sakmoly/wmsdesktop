# Auto Run Complete Guide - Material Request Stock Sync Fix

## ✅ All Fixes Applied

### 1. Backend Code Fix ✅
- **File:** `wms-api/src/modules/material-request/materialRequestController.js`
- **Change:** Updated `tabItem.stock_qty` calculation to prioritize `tabCartonStock` over `tabStockLedger`
- **Status:** ✅ **APPLIED** (No linter errors)

### 2. Desktop App Code Fix ✅
- **File:** `ViewModels/ItemLocationBreakdownViewModel.cs`
- **Change:** Added `batch_no` to GROUP BY to handle duplicate records correctly
- **Status:** ✅ **APPLIED** (No linter errors)

### 3. Event Insertion Fix ✅
- **File:** `wms-api/src/modules/events/eventController.js`
- **Change:** Check `affectedRows` after `INSERT IGNORE` to detect duplicates
- **Status:** ✅ **APPLIED** (No linter errors)

---

## 🚀 Auto Run Instructions

### Step 1: Run Database Fix Script

**Option A: MySQL Workbench / phpMyAdmin**
1. Open `SCRIPTS/AutoRunMaterialRequestStockFix.sql`
2. Edit `@item_code` if needed (line 7: `SET @item_code = 'SKU-HAT-301-BLU-OS';`)
3. Execute the script
4. Review the output

**Option B: MySQL Command Line**
```bash
mysql -u root -p wms_database < SCRIPTS/AutoRunMaterialRequestStockFix.sql
```

**Option C: PowerShell Script**
```powershell
.\SCRIPTS\AutoFixMaterialRequestStock.ps1 -ItemCode "SKU-HAT-301-BLU-OS"
```

**Option D: Batch Script**
```batch
SCRIPTS\RunAutoFixMaterialRequestStock.bat
```

---

### Step 2: Restart API Server

**Check if API server is running:**
```powershell
Get-Process -Name "node" -ErrorAction SilentlyContinue
```

**Stop API server (if running):**
- Press `Ctrl+C` in the terminal where it's running
- Or kill the process

**Start API server:**
```bash
cd wms-api
npm start
```

---

### Step 3: Rebuild Desktop App

1. Open the desktop app project in Visual Studio
2. Rebuild the solution (to apply code changes)
3. Run the desktop app

---

### Step 4: Verify Fix

1. **Refresh Items List** in the desktop app
2. **Open Item Location Breakdown** for `SKU-HAT-301-BLU-OS`
3. **Compare quantities:**
   - Main Items table: Should show `148` (or correct value)
   - Item Location Breakdown: Should show `148` (or correct value)
   - **Both should match** ✅

---

## 📋 Scripts Created

1. ✅ `SCRIPTS/AutoRunMaterialRequestStockFix.sql` - Complete auto-fix script
2. ✅ `SCRIPTS/AutoFixMaterialRequestStock.ps1` - PowerShell automation
3. ✅ `SCRIPTS/RunAutoFixMaterialRequestStock.bat` - Batch script
4. ✅ `SCRIPTS/CheckStockSyncForMaterialRequest.sql` - Diagnostic script
5. ✅ `SCRIPTS/FixMaterialRequestStockSync.sql` - Fix script

---

## 🔍 What Each Script Does

### AutoRunMaterialRequestStockFix.sql (Complete Solution)

1. **Diagnostic:** Shows current state
2. **Remove Duplicates:** Deletes duplicate records in `tabCartonStock`
3. **Sync from tabCartonStock:** Updates `tabItem.stock_qty` (priority)
4. **Sync from tabStockLedger:** Updates `tabItem.stock_qty` (fallback)
5. **Verification:** Confirms fix worked
6. **Check Triggers:** Verifies triggers are active

---

## ✅ Expected Results

### Before Fix
- Main Items: `146` (from `tabStockLedger`)
- Item Location Breakdown: `148` (from `tabCartonStock`)
- **Difference:** `2 units` ❌

### After Fix
- Main Items: `148` (from `tabCartonStock` - prioritized)
- Item Location Breakdown: `148` (from `tabCartonStock`)
- **Difference:** `0 units` ✅

---

## 🎯 Quick Test

After running the fix, test Material Request picking:

1. **Pick items** for a Material Request
2. **Check Main Items table** - should update immediately
3. **Check Item Location Breakdown** - should match Main Items table
4. **Both should show the same quantity** ✅

---

## 📞 Troubleshooting

### Issue: Quantities Still Don't Match

**Solution:**
1. Run diagnostic script again: `SCRIPTS/CheckStockSyncForMaterialRequest.sql`
2. Check for duplicate records
3. Ensure triggers are active (should show 6 triggers)
4. Restart API server
5. Rebuild desktop app

### Issue: API Server Not Starting

**Solution:**
```bash
cd wms-api
npm install  # Reinstall dependencies if needed
npm start
```

### Issue: Desktop App Not Updating

**Solution:**
1. Rebuild the solution in Visual Studio
2. Restart the desktop app
3. Clear cache if needed

---

**Status:** ✅ **ALL FIXES APPLIED - READY TO RUN**  
**Date:** 2026-01-13
