# Transfer Carton Schema Fix Summary

## Issue
The `tabTransferCarton` table may have column names that don't match what the API expects.

## API Expected Columns
- `asn_no` (not `advance_shipping_notice`, `asn_number`, `asn_id`, or `asn`)
- `to_no` (not `transfer_order` or `to_number`)
- `tc_id` (PRIMARY KEY)
- `store`
- `status`
- `updated_on`
- `created_at`
- `updated_at`

## Automated Fix Script

Run this command to automatically fix the schema:

```bash
npm run fix-transfer-carton
```

Or directly:

```bash
node src/db/fixTransferCartonSchema.js
```

## What the Script Does

1. **Checks if table exists** - Creates it if missing
2. **Detects column names** - Checks what columns currently exist
3. **Renames columns if needed:**
   - `advance_shipping_notice` → `asn_no`
   - `asn_number` → `asn_no`
   - `asn_id` → `asn_no`
   - `asn` → `asn_no`
   - `transfer_order` → `to_no`
   - `to_number` → `to_no`
4. **Adds missing columns** - Adds `asn_no` or `to_no` if they don't exist
5. **Shows final schema** - Displays the corrected structure

## Manual Fix (If Needed)

If you prefer to fix it manually, run these SQL commands based on what you find:

```sql
-- Check current structure
DESCRIBE tabTransferCarton;

-- If column is 'advance_shipping_notice', rename it:
ALTER TABLE tabTransferCarton 
  CHANGE COLUMN advance_shipping_notice asn_no VARCHAR(100) NOT NULL;

-- If column is 'transfer_order', rename it:
ALTER TABLE tabTransferCarton 
  CHANGE COLUMN transfer_order to_no VARCHAR(100) NOT NULL;

-- If columns don't exist, add them:
ALTER TABLE tabTransferCarton 
  ADD COLUMN asn_no VARCHAR(100) NOT NULL AFTER tc_id;

ALTER TABLE tabTransferCarton 
  ADD COLUMN to_no VARCHAR(100) NOT NULL AFTER asn_no;
```

## Code Updates

All API code has been updated to use `asn_no` and `to_no` consistently:
- ✅ `pullController.js` - Updated queries
- ✅ `putawayController.js` - Updated queries
- ✅ `normalizeAsnNumbers.js` - Updated normalization script
- ✅ `tcController.js` - Already uses correct column names

## After Fix

Once the schema is fixed, all transfer carton endpoints will work correctly:
- `GET /api/transfer-cartons`
- `POST /api/transfer-cartons/create`
- `POST /api/transfer-cartons/seal`
- `POST /api/transfer-cartons/dispatch`
- `POST /api/putaway/dispatch`

