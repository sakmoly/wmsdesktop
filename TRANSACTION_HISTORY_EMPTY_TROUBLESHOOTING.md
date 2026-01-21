# Transaction History Empty - Troubleshooting Guide

**Date**: 2026-01-21  
**Status**: 🔍 **TROUBLESHOOTING**

---

## 🚨 Problem

Transaction history records exist in database (`tabTransactionHistory` table) but desktop app shows empty table.

---

## ✅ Fixes Already Applied

1. ✅ Warehouse normalization (handles "WH-MAIN", "Main Warehouse", "WH-Main")
2. ✅ Date filtering improvements (uses `DATE()` for reliable comparisons)
3. ✅ Transaction date insertion (uses `NOW()` in SQL)
4. ✅ Response format (`{ ok: true, data: [...] }`)
5. ✅ Enhanced logging

---

## 🔍 Troubleshooting Steps

### Step 1: Check Backend Logs

Look for these log entries when desktop app calls the API:

```
[Transaction History] Executing query
[Transaction History] Query executed successfully
[Transaction History] Returning response
[Transaction History] Sending response
```

**What to check:**
- `rowsReturned` value - should be > 0 if data exists
- `sampleRow` - should show actual transaction data
- `dataArrayLength` in response - should match `rowsReturned`

**If `rowsReturned: 0`:**
- Date filters might be excluding records
- Warehouse filter might not match
- Query might have syntax error

### Step 2: Verify Database Records

Run this SQL query to verify records exist:

```sql
SELECT 
  id,
  transaction_id,
  transaction_number,
  transaction_date,
  transaction_type,
  item_code,
  warehouse,
  bin_location,
  qty_change,
  qty_before,
  qty_after,
  reference_doc
FROM tabTransactionHistory
ORDER BY transaction_date DESC
LIMIT 10;
```

**Expected**: Should return records with `transaction_date` around `2026-01-21`

### Step 3: Test API Directly

**Test 1: Without date filters**
```bash
GET http://localhost:3000/api/transaction-history?limit=10
Authorization: Bearer <your-token>
```

**Test 2: With date filters**
```bash
GET http://localhost:3000/api/transaction-history?from_date=2026-01-21&to_date=2026-01-21&limit=10
Authorization: Bearer <your-token>
```

**Test 3: With warehouse filter**
```bash
GET http://localhost:3000/api/transaction-history?warehouse=WH-MAIN&from_date=2026-01-21&to_date=2026-01-21&limit=10
Authorization: Bearer <your-token>
```

**Expected Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": 20,
      "transaction_id": 176899361836817,
      "transaction_number": "TRX-PUT-1768993618364-469",
      "transaction_date": "2026-01-21T11:06:58.000Z",
      "transaction_type": "Putaway",
      "item_code": "SKU-HAT-301-BLU-OS",
      ...
    }
  ],
  "count": 1
}
```

### Step 4: Check Desktop App Error Logs

Check desktop app error logs (usually in `ErrorLogs/` folder):

**Look for:**
- `TransactionHistoryService: API Response received`
- `TransactionHistoryService: Parsed X transactions from API response`
- Any error messages about API calls

**Common Issues:**
- `403 Forbidden` - API key/token expired or invalid
- `API response format unexpected` - Response doesn't match expected format
- `Parsed 0 transactions` - API returned empty array

### Step 5: Verify Date Filters

The desktop app sets default date range:
- `FromDate`: 90 days ago
- `ToDate`: Tomorrow

**If records are from `2026-01-21`**, they should be included.

**To test without date filters:**
- Click "Clear Filters" button in desktop app
- Or click "Load All" button

### Step 6: Check Authentication

The API requires authentication. Verify:
1. Desktop app has valid API token
2. Token is being sent in `Authorization: Bearer <token>` header
3. Token hasn't expired

**Check backend logs for:**
- `401 Unauthorized` errors
- `403 Forbidden` errors

---

## 🔧 Common Issues and Fixes

### Issue 1: Date Filter Excluding Records

**Symptom**: `rowsReturned: 0` in logs, but records exist in database

**Fix**: The date filter uses `DATE()` function which should work, but verify:
- Records have `transaction_date` within the filter range
- Date format in database matches filter format (YYYY-MM-DD)

**Test**: Call API without date filters to verify records exist

### Issue 2: Warehouse Filter Not Matching

**Symptom**: Records exist but `rowsReturned: 0` when warehouse filter is applied

**Fix**: Warehouse normalization should handle this, but verify:
- Database has `warehouse = 'WH-MAIN'` (uppercase)
- Desktop app might be sending different format
- Check backend logs for `normalized_warehouse` value

**Test**: Call API without warehouse filter

### Issue 3: Response Format Mismatch

**Symptom**: API returns data but desktop app shows empty

**Fix**: Verify response format matches:
```json
{
  "ok": true,
  "data": [...],
  "count": X
}
```

**Check**: Desktop app logs for "API response format unexpected"

### Issue 4: Authentication Failure

**Symptom**: `401` or `403` errors in logs

**Fix**: 
- Login to desktop app to get new token
- Verify API key is correct in settings
- Check backend authentication middleware

---

## 📋 Verification Checklist

- [ ] Database has transaction history records (SQL query returns data)
- [ ] Backend logs show `rowsReturned > 0`
- [ ] API test (Postman/curl) returns data
- [ ] Desktop app error logs show "Parsed X transactions"
- [ ] Date filters include record dates
- [ ] Warehouse filter matches database values
- [ ] Authentication token is valid
- [ ] Response format matches expected structure

---

## 🚀 Next Steps

1. **Check Backend Logs** - Look for `[Transaction History]` entries
2. **Test API Directly** - Use Postman/curl to verify data is returned
3. **Check Desktop App Logs** - Look for API response parsing
4. **Verify Date Range** - Ensure filters include record dates
5. **Test Without Filters** - Use "Load All" button to bypass filters

---

## 📝 Summary

The backend fixes are in place. If data still doesn't show:

1. **Verify API returns data** - Test with Postman/curl
2. **Check backend logs** - Look for `rowsReturned` value
3. **Check desktop app logs** - Look for parsing errors
4. **Test without filters** - Use "Load All" button
5. **Verify authentication** - Ensure token is valid

The most likely issue is:
- Date filters excluding records (check date range)
- Authentication failure (check token)
- Response format mismatch (check desktop app logs)
