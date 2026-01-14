# Stock Posting System - Automated Test Guide

## 🧪 Test Suite Overview

The comprehensive test suite (`test-stock-posting-system.js`) verifies all aspects of the Stock Posting System:

### Test Coverage

1. **Test 1: Verify Stock Posting Log Table**
   - Checks if `tabStockPostingLog` table exists
   - ✅ **Status:** Passing

2. **Test 2: Test Diagnostics Endpoint**
   - Tests `GET /api/wms/stock/diagnose` endpoint
   - Requires authentication
   - ⚠️ **Status:** Skipped without auth

3. **Test 3: Test Stock Consistency (Baseline)**
   - Verifies stock consistency across ledger, item, and bin
   - Requires authentication
   - ⚠️ **Status:** Skipped without auth

4. **Test 4: Verify Stock Posting Service Functions**
   - Checks if `stockPostingService.js` exists and exports functions
   - ✅ **Status:** Passing

5. **Test 5: Check Integration Points**
   - Verifies `postStock()` integration in all transaction endpoints:
     - Material Request Controller
     - Transfer Carton Controller
     - Event Controller (Putaway)
     - Cycle Count Controller
   - ✅ **Status:** Passing

6. **Test 6: Check Posting Log Functionality**
   - Verifies table structure and constraints
   - Checks for UNIQUE constraint on `posting_key`
   - ✅ **Status:** Passing

## 🚀 Running Tests

### Basic Test (No Authentication)

```bash
cd wms-api
node test-stock-posting-system.js
```

**Result:** Runs tests that don't require API authentication (Tests 1, 4, 5, 6)

### Full Test (With Authentication)

Set environment variables and run:

```bash
# Windows PowerShell
$env:TEST_USER_CODE="YOUR_USER_CODE"
$env:TEST_PASSWORD="YOUR_PASSWORD"
cd wms-api
node test-stock-posting-system.js

# Linux/Mac
export TEST_USER_CODE="YOUR_USER_CODE"
export TEST_PASSWORD="YOUR_PASSWORD"
cd wms-api
node test-stock-posting-system.js
```

**Result:** Runs all tests including API endpoint tests (Tests 2, 3)

### Expected Output

```
============================================================
Stock Posting System - Comprehensive Test Suite
============================================================

🔐 Logging in...
✅ Login successful

📋 Test 1: Verify Stock Posting Log Table
✅ Table exists

📋 Test 2: Test Diagnostics Endpoint
✅ Diagnostics endpoint working
   Item: SKU-HAT-301-BLU-OS
   Ledger Total: 96
   Item Stock: 96
   Bin Stock: 96

📋 Test 3: Test Stock Consistency (Baseline)
✅ SKU-HAT-301-BLU-OS: Consistent (96)
✅ SKU-HAT-301-GRN-OS: Consistent (50)
✅ All tested items are consistent

📋 Test 4: Verify Stock Posting Service Functions
✅ Stock posting service file exists
✅ Stock posting service functions available

📋 Test 5: Check Integration Points
✅ src/modules/material-request/materialRequestController.js: Integration found
✅ src/modules/transfer-cartons/transferCartonController.js: Integration found
✅ src/modules/events/eventController.js: Integration found
✅ src/modules/cycle-count/cycleCountController.js: Integration found
✅ All integration points verified

📋 Test 6: Check Posting Log Functionality
✅ Posting log table structure correct
   Columns: 9
   UNIQUE constraint: Yes

============================================================
Test Summary
============================================================
✅ Passed: 6
❌ Failed: 0
📊 Total: 6

🎉 All tests passed!
```

## 📊 Test Results Interpretation

### ✅ All Tests Passed
- System is properly configured
- All integration points are in place
- Table structure is correct
- Ready for production use

### ⚠️ Some Tests Skipped
- Authentication required for API endpoint tests
- Set `TEST_USER_CODE` and `TEST_PASSWORD` to run full suite
- Core functionality tests (1, 4, 5, 6) still pass

### ❌ Tests Failed
- Review error messages in test output
- Check database connection
- Verify API server is running (for endpoint tests)
- Check file paths and imports

## 🔍 What Each Test Validates

### Test 1: Table Verification
- **Purpose:** Ensures database setup is complete
- **Checks:** `tabStockPostingLog` table exists
- **Critical:** Yes - Required for system to work

### Test 2: Diagnostics Endpoint
- **Purpose:** Verifies API endpoint is accessible
- **Checks:** Endpoint returns correct data structure
- **Critical:** No - Nice to have for troubleshooting

### Test 3: Stock Consistency
- **Purpose:** Baseline check of current stock state
- **Checks:** Ledger, item, and bin totals match
- **Critical:** No - Informational only

### Test 4: Service Functions
- **Purpose:** Ensures code structure is correct
- **Checks:** Service file exists and exports functions
- **Critical:** Yes - Required for system to work

### Test 5: Integration Points
- **Purpose:** Verifies all transaction endpoints call stock posting
- **Checks:** `postStock()` is imported and called
- **Critical:** Yes - Required for automatic updates

### Test 6: Posting Log Structure
- **Purpose:** Ensures idempotency mechanism works
- **Checks:** Table structure and UNIQUE constraint
- **Critical:** Yes - Prevents duplicate updates

## 🛠️ Troubleshooting

### Issue: "Cannot find module 'mysql2'"
**Solution:** Install dependencies
```bash
cd wms-api
npm install
```

### Issue: "Connection refused" (API tests)
**Solution:** Start API server
```bash
cd wms-api
npm start
```

### Issue: "Invalid credentials"
**Solution:** Use correct credentials or skip auth tests
- Tests 1, 4, 5, 6 don't require authentication
- Set environment variables for full test suite

### Issue: "Table does not exist"
**Solution:** Run setup script
```bash
cd wms-api
node ../SCRIPTS/AutoSetupStockPosting.js
```

## 📝 Adding New Tests

To add a new test scenario:

1. Create a new test function:
```javascript
async function test7_NewScenario() {
  console.log('\n📋 Test 7: New Scenario');
  try {
    // Your test logic here
    console.log('✅ Test passed');
    testResults.passed++;
    return true;
  } catch (error) {
    console.log('❌ Error:', error.message);
    testResults.failed++;
    testResults.errors.push(`Test 7: ${error.message}`);
    return false;
  }
}
```

2. Call it in `runAllTests()`:
```javascript
await test7_NewScenario();
```

## 🎯 Continuous Integration

### Run Tests Automatically

Add to `package.json`:
```json
{
  "scripts": {
    "test:stock-posting": "node test-stock-posting-system.js"
  }
}
```

Run with:
```bash
npm run test:stock-posting
```

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:
```bash
#!/bin/sh
cd wms-api
node test-stock-posting-system.js
```

## ✅ Acceptance Criteria

All tests should pass before deploying:
- ✅ Test 1: Table exists
- ✅ Test 4: Service functions available
- ✅ Test 5: All integration points verified
- ✅ Test 6: Posting log structure correct

Optional (with authentication):
- ✅ Test 2: Diagnostics endpoint working
- ✅ Test 3: Stock consistency verified

## 📚 Related Documentation

- `STOCK_POSTING_SYSTEM_IMPLEMENTATION.md` - Implementation details
- `SCRIPTS/CreateStockPostingLog.sql` - Database setup
- `wms-api/src/modules/stock-ledger/stockPostingService.js` - Service code
