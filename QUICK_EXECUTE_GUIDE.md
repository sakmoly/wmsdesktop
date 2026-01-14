# Quick Execute Guide - Material Request Stock Fix

## ⚡ Quick Steps

### 1. Open MySQL Workbench
- Launch MySQL Workbench
- Connect to your database

### 2. Open SQL Script
- File → Open SQL Script
- Navigate to: `SCRIPTS/AutoRunMaterialRequestStockFix.sql`
- Open it

### 3. Execute Script
- Press `Ctrl+Shift+Enter` (or click Execute button)
- Review the output

### 4. Restart API Server
```bash
cd wms-api
npm start
```

### 5. Rebuild Desktop App
- Rebuild solution in Visual Studio
- Run the app
- Verify quantities match

---

## 📄 Script File

**Location:** `SCRIPTS/AutoRunMaterialRequestStockFix.sql`

**What it does:**
- ✅ Diagnoses current state
- ✅ Removes duplicate records
- ✅ Syncs `tabItem.stock_qty` from `tabCartonStock` (priority)
- ✅ Syncs `tabItem.stock_qty` from `tabStockLedger` (fallback)
- ✅ Verifies the fix
- ✅ Checks triggers

---

## ✅ Expected Output

After execution, you should see:
```
=== STEP 5: VERIFICATION ===
item_code: SKU-HAT-301-BLU-OS
item_stock_qty: 148
ledger_total: 146
carton_stock_total: 148
sync_status: ✅ Match
```

---

**That's it! The script will automatically fix everything.**
