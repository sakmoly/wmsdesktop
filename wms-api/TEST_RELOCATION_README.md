# Relocation Auto Test Script

## Purpose

This test script verifies that the relocation/bin transfer functionality correctly updates the database after committing a relocation operation.

## Issue

The user reported that "nothing changed in the data" after relocation operations. This test script will verify:

1. ✅ Session creation
2. ✅ Setting FROM/TO locations  
3. ✅ Committing relocation (both FULL_CARTON and CARTON_TO_CARTON)
4. ✅ **Verifying database updates in:**
   - `tabStockLedger` - Stock quantities at bin locations
   - `tabStockTransaction` - Transaction history records
   - `tabCartonStock` - Carton stock and bin locations

## Important Note

**RELOCATION_MOVE events do NOT automatically update the database!**

- Events are saved to `tabWmsScanEvent` table
- But the database updates (Stock Ledger, Transaction History, Carton Stock) only happen when you **call the commit endpoint**:
  - `POST /api/relocation/session/:session_id/commit-full` (for FULL_CARTON mode)
  - `POST /api/relocation/session/:session_id/commit-partial` (for CARTON_TO_CARTON or PARTIAL_ITEMS mode)

**The mobile app MUST call the commit endpoint after sending events to actually update the database!**

## Setup

1. **Update Configuration** in `test-relocation-auto.js`:

```javascript
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: 'your_password',
  database: 'your_database_name' // Update this
};

const API_BASE_URL = 'http://localhost:3000'; // Update if different
const API_KEY = 'your_api_key'; // Update this
```

2. **Install Dependencies** (if not already installed):

```bash
cd wms-api
npm install mysql2
```

## Running the Test

```bash
cd wms-api
node test-relocation-auto.js
```

## What the Test Does

### Test 1: Full Carton Move (Same Carton)
1. Creates a FULL_CARTON relocation session
2. Sets FROM location: `A1-R01-L1-B1` / `CTN-TEST-FROM-001`
3. Sets TO location: `A1-R02-L1-B2` / (same carton)
4. Commits the relocation
5. Verifies:
   - ✅ Stock Ledger at old bin (should be 0 or removed)
   - ✅ Stock Ledger at new bin (should be 10)
   - ✅ Carton Stock bin_location updated to new bin
   - ✅ Transaction history record created

### Test 2: Carton Merge (Different Cartons)
1. Creates a CARTON_TO_CARTON relocation session
2. Sets FROM location: `A1-R01-L1-B1` / `CTN-TEST-FROM-001` (10 qty)
3. Sets TO location: `A1-R02-L1-B2` / `CTN-TEST-TO-001` (5 qty)
4. Commits the relocation (moves 10 qty)
5. Verifies:
   - ✅ FROM carton stock = 0 (empty)
   - ✅ TO carton stock = 15 (5 + 10)
   - ✅ Stock Ledger at new bin = 15
   - ✅ Transaction history records created

## Expected Output

```
🚀 Starting Relocation Auto Test

📦 Setting up test data...
✅ Test data setup complete

🧪 TEST 1: Full Carton Move (Same Carton)

✅ Session created: RL-TEST-20260116-123456
✅ FROM location set: A1-R01-L1-B1 / CTN-TEST-FROM-001
✅ TO location set: A1-R02-L1-B2 / (same carton)
✅ Relocation committed

📊 Verifying data updates...
  Old bin (A1-R01-L1-B1): expected=0, actual=0, found=false
  New bin (A1-R02-L1-B2): expected=10, actual=10, found=true
  Carton stock: expected=10, actual=10, bin=A1-R02-L1-B2, expectedBin=A1-R02-L1-B2
  Transactions: expected=1, actual=1

✅ TEST 1 PASSED: Full Carton Move verified successfully

🧪 TEST 2: Carton Merge (Different Cartons)

✅ Session created: RL-TEST-20260116-789012
✅ FROM location set: A1-R01-L1-B1 / CTN-TEST-FROM-001
✅ TO location set: A1-R02-L1-B2 / CTN-TEST-TO-001
✅ Relocation committed

📊 Verifying data updates...
  FROM carton: expected=0, actual=0
  TO carton: expected=15, actual=15, bin=A1-R02-L1-B2
  New bin stock: expected=15, actual=15

✅ TEST 2 PASSED: Carton Merge verified successfully

============================================================
📊 TEST SUMMARY
============================================================
Test 1 (Full Carton Move): ✅ PASSED
Test 2 (Carton Merge): ✅ PASSED
============================================================

🎉 All tests passed!
```

## Troubleshooting

### Test Fails - Stock Ledger Not Updated

**Possible causes:**
1. Commit endpoint not being called
2. Transaction rolled back due to error
3. Warehouse mismatch
4. Missing carton stock entries

**Check:**
- Look for commit endpoint calls in backend logs
- Check for error messages in console
- Verify warehouse_id matches in session and stock tables

### Test Fails - Transaction History Not Created

**Possible causes:**
1. `tabStockTransaction` table missing required columns
2. Transaction insertion failed silently
3. Duplicate check preventing insertion

**Check:**
- Verify table structure: `DESCRIBE tabStockTransaction`
- Check backend logs for transaction insertion errors

### Test Fails - Carton Stock Not Updated

**Possible causes:**
1. `tabCartonStock` table doesn't exist
2. Carton ID mismatch
3. Warehouse mismatch

**Check:**
- Verify table exists: `SHOW TABLES LIKE 'tabCartonStock'`
- Check carton IDs in database vs. test script

## Manual Verification

After running the test (or after a real relocation), you can manually verify:

```sql
-- Check Stock Ledger
SELECT item_code, warehouse, bin_location, qty, last_transaction_type, last_transaction_ref
FROM tabStockLedger
WHERE item_code = 'SKU-TEST-001'
ORDER BY bin_location;

-- Check Transaction History
SELECT id, item_code, transaction_type, reference_doc, source_bin, target_bin, qty_change
FROM tabStockTransaction
WHERE reference_doc = 'RL-TEST-XXXXXX'
ORDER BY created_at;

-- Check Carton Stock
SELECT carton_id, item_code, warehouse, bin_location, qty
FROM tabCartonStock
WHERE carton_id IN ('CTN-TEST-FROM-001', 'CTN-TEST-TO-001')
ORDER BY carton_id;
```

## Next Steps

If the test fails:
1. Check backend logs for errors during commit
2. Verify the commit endpoint is being called
3. Check database transaction logs
4. Ensure all required tables and columns exist

If the test passes but real operations don't work:
1. Check if mobile app is calling commit endpoint
2. Verify API authentication (API key)
3. Check for errors in mobile app logs
4. Verify session mode matches endpoint called
