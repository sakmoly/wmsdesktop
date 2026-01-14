# Barcode NOT NULL Constraint Fix

## Issue
Error: `NOT NULL constraint failed: item_master.barcode` when syncing item `SKU-TEST-001`

This error occurs when trying to insert or update items without providing a `barcode` value, but the database schema requires `barcode` to be NOT NULL.

## Root Cause
1. **Backend Scripts**: Some scripts were inserting items without including `barcode` in the INSERT statement
2. **Mobile App**: The mobile app's local database (`item_master` table) may have `barcode` as NOT NULL, and items are being synced without barcode values

## Fixes Applied

### 1. Backend Scripts Updated

#### `update-item-master.js`
- **Before**: INSERT statement didn't include `barcode`
- **After**: INSERT statement includes `barcode` with default value (item_code)
```javascript
INSERT INTO tabItem 
    (code, name, item_group, brand, barcode, default_uom, stock_uom, maintain_stock, stock_qty, reserved_qty, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, 'Nos', 'Nos', TRUE, 0, 0, NOW(), NOW())
```
- Uses `itemCode` as default barcode if not provided

#### `test-cycle-count-complete.js`
- **Before**: Test item creation didn't include `barcode`
- **After**: Test item creation includes `barcode` (using item_code as default)

#### `test-cycle-count-direct-db.js`
- **Before**: Test item creation didn't include `barcode`
- **After**: Test item creation includes `barcode` (using item_code as default)

## Mobile App Recommendations

If the mobile app is experiencing this error, ensure:

### 1. Always Include Barcode in Item Sync
When syncing items from the backend API to the mobile app's local database:

```javascript
// ✅ CORRECT: Include barcode (use item_code as fallback)
INSERT INTO item_master (item_code, item_name, barcode, ...)
VALUES (?, ?, COALESCE(?, item_code), ...)

// ❌ WRONG: Missing barcode
INSERT INTO item_master (item_code, item_name, ...)
VALUES (?, ?, ...)
```

### 2. Use Default Value
If barcode is not available from the API, use `item_code` as the default:

```javascript
const barcode = item.barcode || item.item_code || item.code;
```

### 3. Update Database Schema (Alternative)
If barcode should be optional, update the mobile app's database schema:

```sql
-- Make barcode nullable
ALTER TABLE item_master MODIFY COLUMN barcode VARCHAR(255) NULL;

-- OR provide a default value
ALTER TABLE item_master MODIFY COLUMN barcode VARCHAR(255) NOT NULL DEFAULT '';
```

## Backend API Behavior

The backend API (`GET /api/master/items`) returns items with barcode:
- If `barcode` exists in database → returns actual barcode
- If `barcode` is NULL → returns `null` in JSON response

**Example Response:**
```json
{
  "item_code": "SKU-TEST-001",
  "item_name": "Test Item",
  "barcode": "SKU-TEST-001"  // or null if not set
}
```

## Verification

### Check Backend Database
```sql
-- Check items without barcode
SELECT code, name, barcode 
FROM tabItem 
WHERE barcode IS NULL OR barcode = '';

-- Update items without barcode (use item_code as default)
UPDATE tabItem 
SET barcode = code 
WHERE barcode IS NULL OR barcode = '';
```

### Test Item Creation
After the fix, test scripts should now create items with barcode:
```bash
npm run test:cycle-count
```

## Summary

✅ **Backend scripts fixed** - All INSERT statements now include barcode
✅ **Default value provided** - Uses item_code as default barcode
⚠️ **Mobile app** - Ensure barcode is included when syncing items to local database

---

**Note**: The error message shows `item_master.barcode` which suggests this is a mobile app local database issue. The mobile app should ensure it includes barcode (or uses item_code as fallback) when inserting items into its local `item_master` table.
