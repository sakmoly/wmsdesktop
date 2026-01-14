# 🚀 Run Transaction History Setup Automatically

## ✅ Scripts Created

I've created **3 different ways** to run the setup automatically:

### 1. **Batch File** (Windows - Easiest)
**File:** `SCRIPTS/RunTransactionHistorySetup.bat`

**To run:**
```bash
.\SCRIPTS\RunTransactionHistorySetup.bat
```

**Or double-click the file in Windows Explorer**

---

### 2. **PowerShell Script**
**File:** `SCRIPTS/RunTransactionHistorySetup.ps1`

**To run:**
```powershell
.\SCRIPTS\RunTransactionHistorySetup.ps1
```

---

### 3. **Node.js Script** (Uses API's database connection)
**File:** `SCRIPTS/runTransactionHistorySetup.js`

**To run:**
```bash
cd wms-api
node ../SCRIPTS/runTransactionHistorySetup.js
```

---

## ⚠️ If MySQL Command-Line Not in PATH

If you get "MySQL command-line client not found", use one of these:

### Option A: Use Node.js Script (Recommended)

Since your API already connects to the database, use the Node.js script:

```bash
cd wms-api
node ../SCRIPTS/runTransactionHistorySetup.js
```

This uses the same database connection as your API.

---

### Option B: Add MySQL to PATH

1. Find MySQL installation (usually `C:\Program Files\MySQL\MySQL Server X.X\bin`)
2. Add to Windows PATH:
   - Right-click "This PC" → Properties
   - Advanced System Settings → Environment Variables
   - Edit "Path" → Add MySQL bin directory
3. Restart terminal and run batch file again

---

### Option C: Use MySQL Workbench (Most Reliable)

1. **Open MySQL Workbench**
2. **Connect to database** (using your credentials)
3. **File → Open SQL Script**
4. **Navigate to:** `SCRIPTS/AutoSetupTransactionHistory.sql`
5. **Click Execute** (or press `Ctrl+Shift+Enter`)

---

## 📋 Database Credentials (Already Configured)

The scripts are pre-configured with:
- **Host:** localhost
- **Port:** 3306
- **User:** erppadmin
- **Password:** P61nt!
- **Database:** wms_desktop

---

## ✅ What Happens When You Run

The script will automatically:
1. ✅ Create `tabTransactionHistory` table
2. ✅ Create trigger to auto-capture transactions
3. ✅ Update carton_id (if column exists)
4. ✅ Backfill existing transactions
5. ✅ Verify everything is working
6. ✅ Show verification results

---

## 🧪 After Setup

Test by performing any transaction:
- Material Request picking
- Putaway
- Cycle Count
- Any stock movement

Then check:
```sql
SELECT * FROM tabTransactionHistory ORDER BY id DESC LIMIT 5;
```

---

## 🎯 Quick Start

**Easiest Method:**
1. Open `SCRIPTS` folder
2. Double-click `RunTransactionHistorySetup.bat`
3. Wait for completion message
4. Done! ✅

**If that doesn't work:**
- Use MySQL Workbench (Option C above)
- Or use Node.js script (Option A above)

---

**Status:** ✅ **Ready to Run!**
