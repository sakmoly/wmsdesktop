# Fix: Transfer Carton Not Found Error

## Error Message
```
API error (404): 
{
  "code": "TRANSFER_CARTON_NOT_FOUND",
  "message": "Transfer carton PAW-ASN12225-1767107840801 not found"
}
```

## Problem
The transfer carton `PAW-ASN12225-1767107840801` doesn't exist in the `tabTransferCarton` table.

## Solutions

### Solution 1: Find the Correct Transfer Carton ID

The transfer carton ID format might be different. Check what transfer cartons actually exist:

**Run SQL:**
```sql
-- Check all transfer cartons for ASN-12225
SELECT tc_id, status, asn_no, store, created_on
FROM tabTransferCarton
WHERE asn_no = 'ASN-12225'
ORDER BY created_on DESC;
```

**Or use API:**
```http
GET http://localhost:3000/api/transfer-cartons?asn=ASN-12225
```

Then use the correct `tc_id` in your request.

### Solution 2: Create the Transfer Carton

If the transfer carton should exist but doesn't, create it:

**API Endpoint:**
```http
POST http://localhost:3000/api/transfer-cartons/create
Content-Type: application/json
```

**Request Body:**
```json
{
  "tc_id": "PAW-ASN12225-1767107840801",
  "asn_no": "ASN-12225",
  "to_no": null,
  "store": "WAREHOUSE",
  "user_id": "USER-786249"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "PAW-ASN12225-1767107840801",
    "status": "Created"
  }
}
```

### Solution 3: Use Box ID Instead

If you have a `box_id` instead of `tc_id`, you can use that:

**API Endpoint:**
```http
POST http://localhost:3000/api/putaway/scan-transfer-carton
Content-Type: application/json
```

**Request Body:**
```json
{
  "box_id": "BOX-WHMAIN-514364",
  "rack": "A1-R01-L1-B1",
  "bin": "B1",
  "user_id": "USER-786249"
}
```

The system will:
1. Find the transfer carton associated with the box
2. Create the putaway task if needed
3. Assign the location

### Solution 4: Check Transfer Carton Format

The ID format `PAW-ASN12225-1767107840801` looks unusual. Standard formats are:
- `TC-{number}` (e.g., `TC-1767100416319`)
- `TC-{ASN}-{number}` (e.g., `TC-ASN12225-001`)

**Check what format your system uses:**
```sql
SELECT tc_id, asn_no, created_on
FROM tabTransferCarton
ORDER BY created_on DESC
LIMIT 10;
```

## Diagnostic Steps

### Step 1: Run Diagnostic SQL
Execute `CHECK_TRANSFER_CARTON.sql` to:
- Check if the specific transfer carton exists
- Find similar transfer cartons
- See all recent transfer cartons

### Step 2: Check Transfer Carton Creation
Verify if transfer cartons are being created properly:
```sql
-- Check recent transfer carton creation
SELECT 
  tc_id,
  status,
  asn_no,
  store,
  created_by,
  created_on
FROM tabTransferCarton
WHERE created_on >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY created_on DESC;
```

### Step 3: Verify ASN Exists
Make sure the ASN exists:
```sql
SELECT title, status FROM tabAdvanceShippingNotice WHERE title = 'ASN-12225';
```

### Step 4: Check Inbound Session
Verify inbound session exists (needed for putaway):
```sql
SELECT title, asn_no, status FROM tabInboundSession WHERE asn_no = 'ASN-12225';
```

## Workflow

The correct workflow should be:

1. **Create Transfer Carton** (if not exists)
   ```http
   POST /api/transfer-cartons/create
   ```

2. **Seal Transfer Carton** (if needed)
   ```http
   POST /api/transfer-cartons/seal
   ```

3. **Scan Transfer Carton for Putaway**
   ```http
   POST /api/putaway/scan-transfer-carton
   ```

## Quick Fix

If you just need to test putaway, create a transfer carton first:

```http
POST http://localhost:3000/api/transfer-cartons/create
Content-Type: application/json

{
  "tc_id": "PAW-ASN12225-1767107840801",
  "asn_no": "ASN-12225",
  "to_no": null,
  "store": "WAREHOUSE",
  "user_id": "USER-786249"
}
```

Then try the putaway scan again.

## Prevention

To avoid this error:
1. **Always create transfer cartons first** before scanning for putaway
2. **Use the API to get transfer carton IDs** instead of hardcoding them
3. **Verify transfer carton exists** before scanning:
   ```http
   GET http://localhost:3000/api/transfer-cartons?asn=ASN-12225
   ```

