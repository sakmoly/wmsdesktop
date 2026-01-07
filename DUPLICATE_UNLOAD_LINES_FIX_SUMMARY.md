# Duplicate Unload Lines Fix - Complete Summary

## ✅ Problem Identified

The `tabInboundUnloadLine` table was showing duplicate entries for the same carton (e.g., same `parent_title`, `unit_type`, and `unit_id` appearing multiple times).

**Example from database:**
- `parent_title`: "SESSION-ASN0002-DEVICE001-USER172188"
- `unit_type`: "Carton"
- `unit_id`: "CTN-0101"
- **Multiple records with same combination**

## 🔍 Root Causes

1. **Desktop App (`InboundSessionSyncService.cs`)**: 
   - Used plain `INSERT` without deduplication
   - If API response contained duplicate unload lines, they were all inserted
   - Even though it deleted first, duplicates in the API response would create duplicates

2. **No Unique Key Constraint**:
   - Database lacked a unique key on `(parent_title, unit_type, unit_id)`
   - Without this constraint, `INSERT ... ON DUPLICATE KEY UPDATE` cannot work properly
   - Database-level protection was missing

3. **Backend API**: 
   - Already had UPSERT logic implemented (check if exists, then update or insert)
   - Backend code is correct, but duplicates could still occur if multiple API calls happened simultaneously

## ✅ Solution Implemented

### 1. **Fixed Desktop App Code** ✅

**File:** `Services/InboundSessionSyncService.cs`

**Changes:**
- **Added deduplication** of API response before inserting
- **Changed to UPSERT** using `INSERT ... ON DUPLICATE KEY UPDATE`
- **Deduplicates in memory** to handle duplicates from API response

**Code Logic:**
```csharp
// Step 1: Deduplicate API response
var deduplicatedUnloadLines = apiSession.UnloadLines
    .GroupBy(line => new { line.UnitType, line.UnitId })
    .Select(group => group.First())
    .ToList();

// Step 2: Delete existing (for freshness)
DELETE FROM tabInboundUnloadLine WHERE parent_title = @parent_title

// Step 3: Insert deduplicated lines with UPSERT
INSERT INTO tabInboundUnloadLine (...) VALUES (...)
ON DUPLICATE KEY UPDATE
    scanned_on = VALUES(scanned_on),
    scanned_by = VALUES(scanned_by),
    updated_at = CURRENT_TIMESTAMP
```

**Benefits:**
- ✅ Prevents duplicates from API response
- ✅ UPSERT logic works if unique key exists
- ✅ Still works without unique key (deduplication handles it)
- ✅ Database-level protection once unique key is added

---

### 2. **Database Cleanup Script** ✅

**File:** `FIX_DUPLICATE_UNLOAD_LINES_COMPLETE.sql`

**What it does:**
1. **Views current duplicates** (for reference)
2. **Deletes duplicates** - keeps only the most recent one (highest `id`)
3. **Verifies duplicates are removed**
4. **Checks if unique key exists**
5. **Adds unique key constraint** `uq_unload_line (parent_title, unit_type, unit_id)`
6. **Verifies unique key was added**

**Usage:**
```sql
-- Run this script in your MySQL database
SOURCE FIX_DUPLICATE_UNLOAD_LINES_COMPLETE.sql;
```

---

### 3. **Backend Already Correct** ✅

**File:** `wms-api/src/modules/cartons/cartonController.js`

**Status:** ✅ Already has UPSERT logic implemented:
- Checks if record exists
- Updates if exists, inserts if not
- Works correctly

**No changes needed** - backend code is correct.

---

## 📋 Next Steps

### Step 1: Clean Up Existing Duplicates

Run the SQL script to remove existing duplicates and add the unique key:

```sql
-- Option 1: Run the complete script
SOURCE FIX_DUPLICATE_UNLOAD_LINES_COMPLETE.sql;

-- Option 2: Run individual steps (if script fails)
-- Step 1: Delete duplicates
DELETE t1 FROM tabInboundUnloadLine t1
INNER JOIN tabInboundUnloadLine t2 
WHERE t1.id < t2.id 
  AND t1.parent_title = t2.parent_title 
  AND t1.unit_type = t2.unit_type 
  AND t1.unit_id = t2.unit_id;

-- Step 2: Add unique key
ALTER TABLE tabInboundUnloadLine
ADD UNIQUE KEY uq_unload_line (parent_title, unit_type, unit_id);
```

### Step 2: Rebuild and Test Desktop App

1. **Close the running application** (if running)
2. **Rebuild** the desktop application
3. **Run the application** and test the sync

### Step 3: Verify No More Duplicates

1. **Sync sessions** from API
2. **Check database**:
   ```sql
   SELECT parent_title, unit_type, unit_id, COUNT(*) as count
   FROM tabInboundUnloadLine
   GROUP BY parent_title, unit_type, unit_id
   HAVING COUNT(*) > 1;
   ```
3. **Should return 0 rows** (no duplicates)

---

## 🛡️ Protection Layers

After implementing the fix, duplicates are prevented at **multiple levels**:

1. **Desktop App Level**:
   - ✅ Deduplication of API response before inserting
   - ✅ UPSERT logic with `ON DUPLICATE KEY UPDATE`

2. **Database Level**:
   - ✅ Unique key constraint `uq_unload_line (parent_title, unit_type, unit_id)`
   - ✅ Database rejects duplicate inserts

3. **Backend API Level**:
   - ✅ UPSERT logic (check exists, then update or insert)
   - ✅ Prevents duplicates from mobile app calls

---

## ✅ Verification

After applying the fix, verify:

1. **No duplicates in database**:
   ```sql
   SELECT parent_title, unit_type, unit_id, COUNT(*) as count
   FROM tabInboundUnloadLine
   GROUP BY parent_title, unit_type, unit_id
   HAVING COUNT(*) > 1;
   -- Should return 0 rows
   ```

2. **Unique key exists**:
   ```sql
   SELECT CONSTRAINT_NAME, COLUMN_NAME
   FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
   WHERE TABLE_NAME = 'tabInboundUnloadLine' 
     AND CONSTRAINT_NAME = 'uq_unload_line';
   -- Should return 3 rows (parent_title, unit_type, unit_id)
   ```

3. **Desktop app syncs correctly**:
   - Sync sessions from API
   - Check desktop app displays correct unload lines
   - No duplicates shown in UI

---

## 📝 Files Modified

1. ✅ `Services/InboundSessionSyncService.cs` - Added deduplication and UPSERT
2. ✅ `FIX_DUPLICATE_UNLOAD_LINES_COMPLETE.sql` - Complete cleanup and constraint script

---

## 🎯 Expected Result

- ✅ No duplicate unload lines in database
- ✅ Desktop app shows correct unload lines
- ✅ Future syncs will not create duplicates
- ✅ Database-level protection against duplicates
- ✅ All three layers (desktop, database, backend) prevent duplicates

---

## ⚠️ Important Notes

1. **Run the SQL script first** to clean up existing duplicates before adding the unique key
2. **Close the desktop application** before rebuilding
3. **Test the sync** after applying the fix
4. **The unique key constraint is recommended** for database-level protection

---

**Status:** ✅ **Fix Complete - Ready for Testing**

