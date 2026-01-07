# Fix Duplicate Unload Lines - Implementation ✅

## 🔍 Problem

The `tabInboundUnloadLine` table is showing duplicate entries for the same carton (e.g., CTN-0101 appears twice).

**Root Cause:**
- `INSERT IGNORE` was used, but it only prevents duplicates if there's a unique key constraint
- Without a unique key, `INSERT IGNORE` will insert duplicate rows
- Multiple API calls with the same carton_id create multiple records

---

## ✅ Solution Implemented

### 1. **Updated Backend Code** ✅

**File:** `wms-api/src/modules/cartons/cartonController.js`

**Change:** Replaced `INSERT IGNORE` with proper UPSERT logic:

**Before (WRONG):**
```javascript
INSERT IGNORE INTO tabInboundUnloadLine
(parent_title, unit_type, unit_id, scanned_on, scanned_by)
VALUES (?, 'Carton', ?, ?, ?)
```

**After (CORRECT):**
```javascript
// Check if record exists first
const [existing] = await connection.query(
  `SELECT id FROM tabInboundUnloadLine 
   WHERE parent_title = ? AND unit_type = 'Carton' AND unit_id = ?`,
  [inbound_session, carton_id]
);

if (existing && existing.length > 0) {
  // Update existing record
  UPDATE tabInboundUnloadLine 
  SET scanned_on = ?, scanned_by = ?, updated_at = NOW()
  WHERE parent_title = ? AND unit_type = 'Carton' AND unit_id = ?
} else {
  // Insert new record
  INSERT INTO tabInboundUnloadLine
  (parent_title, unit_type, unit_id, scanned_on, scanned_by)
  VALUES (?, 'Carton', ?, ?, ?)
}
```

**Applied to:**
- ✅ Single carton update (UPDATE path)
- ✅ Single carton update (INSERT path)  
- ✅ Batch carton update (UPDATE path)
- ✅ Batch carton update (INSERT path)

---

### 2. **Database Cleanup Script** ✅

**File:** `FIX_DUPLICATE_UNLOAD_LINES.sql`

This script:
1. Identifies duplicate records
2. Removes duplicates, keeping the most recent one (highest `id`)
3. Verifies duplicates are removed
4. Adds unique key constraint to prevent future duplicates

---

### 3. **Recommended: Add Unique Key Constraint** ✅

**SQL Script:** `wms-api/src/db/add_unload_line_unique_key.sql`

```sql
ALTER TABLE tabInboundUnloadLine
ADD UNIQUE KEY uq_unload_line (parent_title, unit_type, unit_id);
```

**Benefits:**
- Prevents duplicate entries at database level
- Enables `ON DUPLICATE KEY UPDATE` to work correctly
- Better data integrity

---

## 📋 Steps to Fix

### Step 1: Clean Up Existing Duplicates

Run the cleanup script:
```sql
-- See FIX_DUPLICATE_UNLOAD_LINES.sql
```

Or manually:
```sql
-- Delete duplicates, keeping the most recent one
DELETE t1 FROM tabInboundUnloadLine t1
INNER JOIN tabInboundUnloadLine t2 
WHERE 
    t1.id < t2.id 
    AND t1.parent_title = t2.parent_title 
    AND t1.unit_type = t2.unit_type 
    AND t1.unit_id = t2.unit_id;
```

### Step 2: Add Unique Key Constraint (Recommended)

```sql
ALTER TABLE tabInboundUnloadLine
ADD UNIQUE KEY uq_unload_line (parent_title, unit_type, unit_id);
```

### Step 3: Restart Backend Server

Restart the backend server to apply the code changes.

---

## ✅ Result

After applying the fix:

1. ✅ **Existing duplicates removed** - Only one record per (parent_title, unit_type, unit_id)
2. ✅ **New duplicates prevented** - Code checks for existing records before inserting
3. ✅ **Database constraint** - Unique key ensures data integrity at DB level
4. ✅ **Desktop app shows correct data** - No more duplicate rows in Unload Lines table

---

## 🧪 Verification

After applying the fix, verify with:

```sql
-- Should return 0 rows (no duplicates)
SELECT 
    parent_title,
    unit_type,
    unit_id,
    COUNT(*) as count
FROM tabInboundUnloadLine
GROUP BY parent_title, unit_type, unit_id
HAVING COUNT(*) > 1;
```

---

**Status:** ✅ **FIX COMPLETE**  
**Files Modified:** 
- `wms-api/src/modules/cartons/cartonController.js` (4 locations updated)
- `FIX_DUPLICATE_UNLOAD_LINES.sql` (cleanup script created)
- `wms-api/src/db/add_unload_line_unique_key.sql` (constraint script created)

**Next Steps:**
1. Run cleanup SQL script to remove existing duplicates
2. Add unique key constraint (recommended)
3. Restart backend server
4. Verify no duplicates appear in desktop app

