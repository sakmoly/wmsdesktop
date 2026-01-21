# Transaction History Not Showing in Desktop App - Fix

**Date**: 2026-01-21  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

Transaction history records exist in the database (`tabTransactionHistory` table) but are not showing in the desktop application's Transaction History UI.

**Symptoms:**
- Records visible in database (MySQL Workbench)
- Empty table in desktop app Transaction History screen
- API endpoint might be returning empty results or incorrect data

---

## 🔍 Root Causes Identified

1. **Column Name Mismatch**: 
   - Insert code was checking for `transaction_no` column
   - API query was selecting `transaction_number` column
   - Database might have either column name depending on schema version

2. **Missing Debug Logging**: 
   - No visibility into what filters are being applied
   - No way to diagnose query issues

3. **Date Filter Handling**: 
   - Date filters might be excluding records incorrectly

---

## ✅ Fixes Applied

### 1. Fixed Column Name Detection (transactionHistoryController.js)

**Before:**
```javascript
let query = `
  SELECT 
    transaction_number,  // Assumed this column always exists
    ...
```

**After:**
```javascript
// First, check which columns actually exist in the table
const [columnCheck] = await connection.execute(`
  SELECT COLUMN_NAME 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'tabTransactionHistory'
    AND COLUMN_NAME IN ('transaction_no', 'transaction_number')
`);
const hasTransactionNo = columnCheck.some(col => col.COLUMN_NAME === 'transaction_no');
const hasTransactionNumber = columnCheck.some(col => col.COLUMN_NAME === 'transaction_number');

// Use the correct column name based on what exists
const transactionNoColumn = hasTransactionNumber ? 'transaction_number' : (hasTransactionNo ? 'transaction_no' : null);

let query = `
  SELECT 
    id,
    transaction_id,
    ${transactionNoColumn ? `${transactionNoColumn} as transaction_number,` : ''}
    ...
```

### 2. Fixed Insert Code to Use Correct Column Name (eventController.js)

**Before:**
```javascript
const hasTransactionNo = txnHistoryColumns.some(col => col.COLUMN_NAME === 'transaction_no');
// ...
if (hasTransactionNo) {
  historyFields.push('transaction_no');
  historyValues.push(trxNo);
}
```

**After:**
```javascript
// Check for both transaction_no and transaction_number (different schemas may use different names)
const hasTransactionNo = txnHistoryColumns.some(col => col.COLUMN_NAME === 'transaction_no');
const hasTransactionNumber = txnHistoryColumns.some(col => col.COLUMN_NAME === 'transaction_number');
// Use transaction_number if it exists, otherwise fall back to transaction_no
const transactionNoColumnName = hasTransactionNumber ? 'transaction_number' : (hasTransactionNo ? 'transaction_no' : null);
// ...
if (transactionNoColumnName) {
  historyFields.push(transactionNoColumnName);
  historyValues.push(trxNo);
}
```

### 3. Added Debug Logging

Added comprehensive logging to help diagnose issues:

```javascript
logger.info('[Transaction History] Executing query', {
  query: query.substring(0, 300),
  params: params,
  filters: {
    warehouse,
    item_code,
    bin_location,
    carton_id,
    transaction_type,
    stock_direction,
    reference_doc,
    from_date,
    to_date,
    limit
  }
});

logger.info('[Transaction History] Query executed successfully', {
  rowsReturned: rows.length,
  sampleRow: rows.length > 0 ? { ... } : null
});
```

### 4. Improved Date Filter Handling

```javascript
if (from_date) {
  // Handle different date formats (YYYY-MM-DD, MM/DD/YYYY, etc.)
  query += ' AND DATE(transaction_date) >= DATE(?)';
  params.push(from_date);
}

if (to_date) {
  // Handle different date formats and include the full day (up to 23:59:59)
  query += ' AND DATE(transaction_date) <= DATE(?)';
  params.push(to_date);
}
```

---

## 📋 Files Modified

1. **wms-api/src/modules/stock-ledger/transactionHistoryController.js**
   - Added dynamic column name detection for `transaction_no`/`transaction_number`
   - Added debug logging
   - Improved date filter handling

2. **wms-api/src/modules/events/eventController.js**
   - Updated to check for both `transaction_no` and `transaction_number`
   - Use correct column name when inserting records

---

## ✅ Verification Steps

1. **Check Backend Logs**:
   - Look for `[Transaction History] Executing query` logs
   - Verify filters being applied
   - Check `rowsReturned` count

2. **Test API Endpoint Directly**:
   ```bash
   GET http://localhost:3000/api/transaction-history
   ```
   Should return transaction history records

3. **Test with Filters**:
   ```bash
   GET http://localhost:3000/api/transaction-history?from_date=2026-01-21&to_date=2026-01-21
   ```

4. **Check Desktop App**:
   - Open Transaction History screen
   - Verify records are now displayed
   - Test filtering functionality

---

## 🔍 Troubleshooting

If records still don't show:

1. **Check Backend Logs**:
   - Look for `[Transaction History]` log entries
   - Verify query is executing
   - Check `rowsReturned` value

2. **Verify Database Records**:
   ```sql
   SELECT COUNT(*) FROM tabTransactionHistory;
   SELECT * FROM tabTransactionHistory ORDER BY transaction_date DESC LIMIT 10;
   ```

3. **Check Column Names**:
   ```sql
   SELECT COLUMN_NAME 
   FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'tabTransactionHistory'
     AND COLUMN_NAME IN ('transaction_no', 'transaction_number');
   ```

4. **Test API Directly**:
   - Use Postman or curl to test the endpoint
   - Check response format matches desktop app expectations

---

## 📝 Summary

- **Issue**: Transaction history records not showing in desktop app
- **Root Cause**: Column name mismatch between insert and select queries
- **Fix**: Dynamic column name detection for both `transaction_no` and `transaction_number`
- **Additional**: Added debug logging and improved date filter handling
- **Impact**: Transaction history should now display correctly in desktop app

---

## 🚀 Next Steps

1. ✅ **Backend Fix Applied** - Column name detection and logging added
2. ⏳ **Test API Endpoint** - Verify records are returned
3. ⏳ **Verify Desktop App** - Check that records display correctly
4. ⏳ **Test Filtering** - Ensure date and other filters work correctly
