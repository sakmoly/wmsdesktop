# Quick Start: Running API Tests

## Prerequisites
1. Make sure the WMS API server is running:
   ```bash
   cd wms-api
   npm start
   ```

2. Ensure you have Node.js 18+ (for built-in fetch support)

## Run Tests

### Method 1: Using npm (Recommended)
```bash
cd wms-api
npm test
```

### Method 2: Direct execution
```bash
cd wms-api
node test-api.js
```

## Configuration (Optional)

Create or edit `.env` file in `wms-api` directory:

```env
API_BASE_URL=http://localhost:3000
TEST_USER=admin
TEST_PASSWORD=admin123
```

## What Gets Tested

✅ **25+ API Endpoints:**
- Authentication (login)
- All GET endpoints (master data, boxes, ASNs, etc.)
- All POST endpoints (create, update, delete operations)

## Expected Results

- ✅ Green checkmarks for passing tests
- ❌ Red X for failing tests (with error details)
- Summary report at the end with pass rate

## Troubleshooting

**If tests fail:**
1. Check that the API server is running
2. Verify database connection
3. Check that test user credentials are correct
4. Review error messages in the test output

**Note:** Some tests may show validation errors (400) if test data doesn't exist - this is expected and acceptable.

