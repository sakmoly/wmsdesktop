# Fix: UNIQUE constraint failed: box_cache.box_id

## Problem

The mobile app is trying to insert a box into the local `box_cache` table, but the `box_id` already exists, causing a unique constraint violation.

**Error Message:**
```
UNIQUE constraint failed: box_cache.box_id
```

**Box ID:** `PAW-ASN12223-1707122240030`

## Root Cause

The mobile app's local SQLite database has a `box_cache` table that caches box information for offline use. When packing a box, the app tries to insert the box into this cache, but:

1. **The box already exists** in the cache (from a previous operation)
2. **The app is using `INSERT` instead of `INSERT OR REPLACE`** or not checking for existence first
3. **Race condition** - Multiple operations trying to insert the same box simultaneously

## Solution

### Option 1: Use INSERT OR REPLACE (Recommended)

In the mobile app code, change the insert statement to use `INSERT OR REPLACE`:

**Before:**
```sql
INSERT INTO box_cache (box_id, ...) VALUES (?, ...)
```

**After:**
```sql
INSERT OR REPLACE INTO box_cache (box_id, ...) VALUES (?, ...)
```

### Option 2: Check Before Insert

Check if the box exists before inserting:

```sql
-- Check if box exists
SELECT COUNT(*) FROM box_cache WHERE box_id = ?

-- If count = 0, insert
INSERT INTO box_cache (box_id, ...) VALUES (?, ...)

-- If count > 0, update
UPDATE box_cache SET ... WHERE box_id = ?
```

### Option 3: Use UPSERT (SQLite 3.24+)

If using SQLite 3.24 or later:

```sql
INSERT INTO box_cache (box_id, ...) 
VALUES (?, ...)
ON CONFLICT(box_id) DO UPDATE SET
  -- update fields here
  updated_at = CURRENT_TIMESTAMP
```

## Quick Fix: Clear the Cache

If you need an immediate workaround, you can clear the box cache:

### On Android (React Native / Expo)

1. **Clear app data:**
   - Settings → Apps → [Your App] → Storage → Clear Data
   - Or uninstall and reinstall the app

2. **Clear cache programmatically:**
   ```javascript
   // In your database service
   await db.executeSql('DELETE FROM box_cache WHERE box_id = ?', [boxId]);
   // Or clear all
   await db.executeSql('DELETE FROM box_cache');
   ```

### On iOS

1. **Delete and reinstall the app**
2. **Or clear cache programmatically** (same as Android)

## Where to Fix in Mobile App Code

Look for the packing/box creation code in the mobile app. The error occurs when:

1. **Scanning a box barcode** for packing
2. **Creating a new box** entry
3. **Syncing box data** from the backend

### Common Locations:

- `services/BoxService.js` or `BoxService.ts`
- `services/PackingService.js` or `PackingService.ts`
- `database/boxCache.js` or `boxCache.ts`
- Any file that handles box creation/insertion

### Example Fix:

```javascript
// Before (causes error)
async function cacheBox(boxData) {
  await db.executeSql(
    'INSERT INTO box_cache (box_id, asn_no, store, status, created_at) VALUES (?, ?, ?, ?, ?)',
    [boxData.box_id, boxData.asn_no, boxData.store, boxData.status, new Date()]
  );
}

// After (fixed)
async function cacheBox(boxData) {
  await db.executeSql(
    'INSERT OR REPLACE INTO box_cache (box_id, asn_no, store, status, updated_at) VALUES (?, ?, ?, ?, ?)',
    [boxData.box_id, boxData.asn_no, boxData.store, boxData.status, new Date()]
  );
}
```

## Prevention

To prevent this issue in the future:

1. **Always use `INSERT OR REPLACE`** for cache tables
2. **Add error handling** to catch and handle unique constraint errors gracefully
3. **Check for existence** before inserting if you need to preserve old data
4. **Use transactions** to ensure atomic operations

### Example with Error Handling:

```javascript
async function cacheBox(boxData) {
  try {
    await db.executeSql(
      'INSERT OR REPLACE INTO box_cache (box_id, asn_no, store, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      [boxData.box_id, boxData.asn_no, boxData.store, boxData.status, new Date()]
    );
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      // Box already exists, update it instead
      await db.executeSql(
        'UPDATE box_cache SET asn_no = ?, store = ?, status = ?, updated_at = ? WHERE box_id = ?',
        [boxData.asn_no, boxData.store, boxData.status, new Date(), boxData.box_id]
      );
    } else {
      throw error;
    }
  }
}
```

## Verify the Fix

After applying the fix:

1. **Clear the app cache** (or reinstall)
2. **Try packing the box again** (`PAW-ASN12223-1707122240030`)
3. **The error should no longer occur**

## Related Issues

- If boxes are being created multiple times, check for duplicate API calls
- If the cache is out of sync, implement a cache refresh mechanism
- If boxes are not being found, check the cache query logic

## Notes

- This is a **mobile app issue**, not a backend API issue
- The backend API doesn't have a `box_cache` table - this is mobile-only
- The fix needs to be applied in the mobile app codebase
- The box ID format `PAW-ASN12223-1707122240030` suggests this is a putaway box (PAW prefix)

