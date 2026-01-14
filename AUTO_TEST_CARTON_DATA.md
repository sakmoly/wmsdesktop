# Auto Test Carton Data - Quick Guide

## Automatic Test

The test data insertion now **automatically verifies** the data after insertion. When you click "Insert Test Carton Data" in Settings, it will:

1. ✅ Insert test carton data
2. ✅ Automatically verify the data was inserted correctly
3. ✅ Show you a summary with counts

## Manual Test (Optional)

If you want to run a standalone test program:

### Option 1: Using the Test Program

1. **Build the project** (the TestCartonData.cs is included)
2. **Run from command line:**
   ```bash
   dotnet run --project . TestCartonData.cs
   ```

### Option 2: Using SQL Verification

Run the verification script:
```sql
SOURCE VERIFY_CARTON_DATA.sql;
```

## What Gets Tested

The automatic verification checks:
- ✅ Bins were created
- ✅ Cartons were created  
- ✅ Carton items were created
- ✅ Carton stock records were created
- ✅ Data counts match expectations

## Expected Results

After running "Insert Test Carton Data", you should see:
- **5 bins** (BIN-001 to BIN-005)
- **7 cartons** (CARTON-001 to CARTON-007)
- **7 carton items** (one per carton)
- **7 carton stock records** (inventory tracking)

## View in Desktop App

1. **Enable Carton Mode:**
   - Settings → Inventory Tracking Mode → "Carton Level Inventory" → Save

2. **View Item Inventory:**
   - Items → Select an item → "Show Location Breakdown"
   - You should see **Carton ID** column

## Troubleshooting

### No data inserted?
- Check database connection
- Ensure Migration 005 was run first
- Check error log for details

### Verification fails?
- Data might already exist (this is OK)
- Check if tables exist: `SHOW TABLES LIKE 'tabCarton%';`
- Check if bins exist: `SELECT COUNT(*) FROM tabBin;`

### Carton ID column not showing?
- Ensure carton mode is enabled in Settings
- Check if carton data exists for the selected item
- Verify item code matches carton stock records

---

**Status:** ✅ Automatic verification enabled  
**Test Program:** `TestCartonData.cs` (optional)  
**Verification Script:** `VERIFY_CARTON_DATA.sql` (optional)

