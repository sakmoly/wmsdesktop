# WMS Test Scripts - Complete Module Testing

This directory contains comprehensive automated test scripts for all major WMS modules. These tests verify the complete workflows from creation to completion and ensure data integrity.

## 📋 Available Test Scripts

### 1. Cycle Count Test
**File:** `test-cycle-count-complete.js`
**Command:** `npm run test:cycle-count`

**What it tests:**
- ✅ User authentication
- ✅ Cycle count task creation
- ✅ Starting cycle count task
- ✅ Counting items with different carton IDs
- ✅ Verifying separate lines are created for each carton
- ✅ Submitting cycle count task
- ✅ Completing cycle count task
- ✅ Verifying carton stock updates in `tabCartonStock`
- ✅ Verifying item stock quantity calculation in `tabItem`
- ✅ Data cleanup

---

### 2. InBound Test
**File:** `test-inbound-complete.js`
**Command:** `npm run test:inbound`

**What it tests:**
- ✅ User authentication
- ✅ Creating/starting inbound session
- ✅ Updating inbound session (completed cartons)
- ✅ Getting inbound sessions list
- ✅ Completing inbound session
- ✅ Verifying inbound session in database
- ✅ Data cleanup

---

### 3. Putaway Test
**File:** `test-putaway-complete.js`
**Command:** `npm run test:putaway`

**What it tests:**
- ✅ User authentication
- ✅ Creating transfer carton (prerequisite)
- ✅ Creating putaway task for remaining items
- ✅ Scanning transfer carton for putaway
- ✅ Getting putaway tasks list
- ✅ Completing putaway task
- ✅ Verifying putaway task in database
- ✅ Data cleanup

---

### 4. Transfer IN Test
**File:** `test-transfer-in-complete.js`
**Command:** `npm run test:transfer-in`

**What it tests:**
- ✅ User authentication
- ✅ Creating Transfer IN document
- ✅ Submitting Transfer IN
- ✅ Receiving Transfer IN line (by carton ID)
- ✅ Getting Transfer IN details
- ✅ Verifying Transfer IN in database
- ✅ Data cleanup

---

### 5. Material Request Test
**File:** `test-material-request-complete.js`
**Command:** `npm run test:material-request`

**What it tests:**
- ✅ User authentication
- ✅ Creating Material Request
- ✅ Updating Material Request status (Submit)
- ✅ Picking Material Request items
- ✅ Getting Material Request details
- ✅ Verifying Material Request in database
- ✅ Data cleanup

---

## 🚀 Quick Start

### Prerequisites

1. **Database Configuration**: Ensure your `.env` file has the correct database credentials:
   ```env
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=wms_desktop
   API_URL=http://localhost:3000
   ```

2. **Test User Credentials**: The scripts use these default credentials (can be overridden via environment variables):
   ```env
   TEST_USER_CODE=sysadmin
   TEST_PASSWORD=123456
   ```

3. **API Server**: Make sure your API server is running on `http://localhost:3000` (or update `API_URL` in `.env`)

### Running Tests

#### Run Individual Test
```bash
# Run Cycle Count test
npm run test:cycle-count

# Run InBound test
npm run test:inbound

# Run Putaway test
npm run test:putaway

# Run Transfer IN test
npm run test:transfer-in

# Run Material Request test
npm run test:material-request
```

#### Run All Tests
```bash
npm run test:all
```

#### Run with Custom Credentials
```bash
# Set environment variables before running
export TEST_USER_CODE=your_user
export TEST_PASSWORD=your_password
npm run test:inbound
```

Or in PowerShell:
```powershell
$env:TEST_USER_CODE="your_user"
$env:TEST_PASSWORD="your_password"
npm run test:inbound
```

---

## 📊 Test Output

Each test script provides:
- ✅ **Detailed console output** showing each test step
- ✅ **Test summary** with passed/failed counts
- ✅ **Database verification** to confirm data persistence
- ✅ **Automatic cleanup** of test data

**Example Output:**
```
🚀 Starting Complete InBound Procedure Test

============================================================
Test Configuration:
  ASN No: ASN-TEST-1768128284651
  Dock: DOCK-01
  Total Cartons: 3
============================================================
✅ Database connected

👤 Test 0a: Ensuring test user exists...
✅ Ensure Test User: Found existing user: sysadmin, password updated

🔐 Test 0: Logging in to get authentication token...
   Attempting login with user_code: sysadmin
✅ Login: Authentication successful, token obtained

...

============================================================
📊 TEST SUMMARY
============================================================
✅ Ensure Test User: Found existing user: sysadmin, password updated
✅ Login: Authentication successful, token obtained
✅ Create InBound Session: Session created: SESSION-ASN-TEST-...
✅ Update InBound Session: Session updated: completed_cartons=2
...
============================================================
Total: 7 | Passed: 7 | Failed: 0
============================================================

🎉 All tests passed!
```

---

## 🔧 Customization

### Modify Test Configuration

Each test script has a `TEST_CONFIG` object at the top that you can modify:

```javascript
const TEST_CONFIG = {
  warehouse: 'WH-MAIN',
  itemCode: 'SKU-HAT-301-BLU-OS',
  // ... other config
};
```

### Add More Test Cases

You can extend any test script by adding new test functions:

```javascript
async function testMyNewCase() {
  console.log('\n🧪 Test X: My New Test Case...');
  
  const result = await apiRequest('GET', '/api/my-endpoint');
  
  if (result.status === 200) {
    return logTest('My New Test Case', true, 'Test passed');
  } else {
    return logTest('My New Test Case', false, `Failed: ${result.status}`);
  }
}
```

Then call it in the `runCompleteTest()` function.

---

## ⚠️ Important Notes

1. **Database Cleanup**: All test scripts automatically clean up test data at the end. Test data is identified by unique timestamps or prefixes like `TEST-`, `TI-TEST-`, `MR-TEST-`, etc.

2. **Real Items**: The tests use real item codes like `SKU-HAT-301-BLU-OS`. Make sure these items exist in your `tabItem` table, or modify the `TEST_CONFIG` to use existing items.

3. **API Server Must Be Running**: All tests require the API server to be running and accessible at the configured URL.

4. **Authentication**: Tests automatically handle authentication and use JWT tokens for all API requests.

5. **Database Transactions**: Tests use database transactions where appropriate, and automatically rollback on errors.

---

## 🐛 Troubleshooting

### Test Fails with "Authentication failed"
- Check that `TEST_USER_CODE` and `TEST_PASSWORD` are correct
- Verify the user exists in `tabUser` table
- Check that password hashing matches your system

### Test Fails with "Item not found"
- Verify the test item code exists in `tabItem` table
- Or modify `TEST_CONFIG.itemCode` to use an existing item

### Test Fails with "Database connection error"
- Check your `.env` file has correct database credentials
- Ensure MySQL server is running
- Verify database `wms_desktop` exists

### Test Fails with "API request failed"
- Ensure API server is running on `http://localhost:3000`
- Check `API_URL` in `.env` file
- Verify network connectivity to API server

---

## 📝 Test Script Structure

Each test script follows this structure:

1. **Setup**: Import dependencies, load environment variables, configure database
2. **Helper Functions**: `apiRequest()`, `logTest()`, authentication helpers
3. **Test Functions**: Individual test cases (Test 0-6)
4. **Main Function**: `runCompleteTest()` orchestrates all tests
5. **Summary**: Print test results and exit codes

---

## ✅ Benefits

These comprehensive test scripts help you:
- 🧪 **Verify workflows** end-to-end before production deployment
- 🔍 **Catch issues early** in development
- 📊 **Document API usage** with working examples
- 🚀 **Speed up testing** with automated scripts
- 🛡️ **Ensure data integrity** with database verification

---

## 📞 Support

If you encounter issues with the test scripts, please:
1. Check the error messages in the console output
2. Verify your database schema matches expected structure
3. Ensure API endpoints match the expected format
4. Review the individual test script for detailed error handling

---

**Happy Testing! 🎉**
