# WMS API Test Suite

## Overview

This test suite automatically tests all GET and POST endpoints in the WMS API to ensure they're working properly.

## Prerequisites

- Node.js 18+ (for built-in `fetch` support)
- WMS API server running
- Database configured with test data (optional - tests handle missing data gracefully)

## Configuration

Create a `.env` file in the `wms-api` directory with the following variables (optional):

```env
API_BASE_URL=http://localhost:3000
TEST_USER=admin
TEST_PASSWORD=admin123
```

If not provided, defaults are:
- `API_BASE_URL`: `http://localhost:3000`
- `TEST_USER`: `admin`
- `TEST_PASSWORD`: `admin123`

## Running Tests

### Option 1: Using npm script
```bash
cd wms-api
npm test
```

### Option 2: Direct execution
```bash
cd wms-api
node test-api.js
```

## Test Coverage

### Authentication
- ✅ `POST /api/auth/login` - User login

### GET Endpoints
- ✅ `GET /health` - Health check
- ✅ `GET /api/master/asns` - Get all ASNs
- ✅ `GET /api/asn/:asn_no` - Get ASN by number
- ✅ `GET /api/transfer-order/by-asn/:asn_no` - Get transfer order by ASN
- ✅ `GET /api/master/transfer-orders` - Get all transfer orders
- ✅ `GET /api/master/boxes` - Get all boxes (master)
- ✅ `GET /api/boxes` - Get boxes (filtered)
- ✅ `GET /api/boxes/:box_id` - Get box by ID
- ✅ `GET /api/master/transfer-cartons` - Get all transfer cartons
- ✅ `GET /api/master/warehouse-racks` - Get all warehouse racks
- ✅ `GET /api/master/warehouses` - Get all warehouses
- ✅ `GET /api/master/warehouses-stores` - Get warehouses and stores
- ✅ `GET /api/master/locations` - Get all locations

### POST Endpoints
- ✅ `POST /api/boxes/create` - Create box (warehouse)
- ✅ `POST /api/boxes/create` - Create box (store with TO)
- ✅ `POST /api/boxes/close` - Close box
- ✅ `POST /api/boxes/delete` - Delete box
- ✅ `POST /api/boxes/print` - Print box label
- ✅ `POST /api/carton/lock` - Lock carton
- ✅ `POST /api/carton/complete` - Complete carton
- ✅ `POST /api/cartons/update-status` - Update carton status
- ✅ `POST /api/inbound/receive-lines` - Create receive lines
- ✅ `POST /api/inbound/update` - Update inbound session
- ✅ `POST /api/inbound/complete` - Complete inbound session
- ✅ `POST /api/events/batch` - Batch insert events
- ✅ `POST /api/putaway/assign-rack` - Assign rack for putaway
- ✅ `POST /api/transfer-cartons/create` - Create transfer carton
- ✅ `POST /api/transfer-cartons/seal` - Seal transfer carton
- ✅ `POST /api/transfer-cartons/dispatch` - Dispatch transfer carton

## Test Results

The test suite provides:
- ✅ **Passed tests** - Endpoints responding correctly
- ❌ **Failed tests** - Endpoints with errors (with error details)
- ⚠️ **Skipped tests** - Tests that were skipped (if any)

### Expected Behaviors

1. **Authentication Required**: Most tests require a valid auth token (obtained from login)
2. **Graceful Handling**: Tests accept various HTTP status codes as valid:
   - `200` - Success
   - `201` - Created
   - `400` - Validation error (acceptable for test data)
   - `404` - Not found (acceptable if test data doesn't exist)
3. **Data Validation**: Tests validate response structure and data types

## Example Output

```
========================================
WMS API Comprehensive Test Suite
========================================
Base URL: http://localhost:3000
Test User: admin

Step 1: Authentication
✓ POST /api/auth/login
  Token obtained: eyJhbGciOiJIUzI1NiIs...

Step 2: Testing GET Endpoints
✓ GET /health
✓ GET /api/master/asns
✓ GET /api/asn/:asn_no
✓ GET /api/master/warehouses-stores
...

Step 3: Testing POST Endpoints
✓ POST /api/boxes/create
✓ POST /api/carton/lock
...

========================================
Test Summary
========================================
Passed: 25
Failed: 0
Skipped: 0

Pass Rate: 100.0%
```

## Troubleshooting

### "fetch is not defined"
- **Solution**: Upgrade to Node.js 18+ or install `node-fetch` package

### "Connection refused"
- **Solution**: Make sure the API server is running on the configured port

### "Authentication failed"
- **Solution**: Check that `TEST_USER` and `TEST_PASSWORD` are correct in `.env` file

### "Unexpected status: 500"
- **Solution**: Check server logs and database connection

## Notes

- Tests use sample data that may not exist in your database
- Validation errors (400) are acceptable for non-existent test data
- The test suite is designed to be non-destructive (uses test IDs)
- Some tests may fail if required master data doesn't exist (this is expected)

