# Event Insertion Fix - tabWmsScanEvent Not Updating

## 🐛 Issue

Mobile app is sending events correctly, but `tabWmsScanEvent` table is not being updated.

---

## 🔍 Root Causes

### 1. **Duplicate `offline_uuid` (Most Common)**

The API uses `INSERT IGNORE`, which **silently ignores** duplicate `offline_uuid`:

```javascript
await connection.execute(`
  INSERT IGNORE INTO tabWmsScanEvent 
  ...
`, [...]);
```

**Problem:**
- If `offline_uuid` already exists, the insert is ignored
- No error is returned
- `insertedCount` is incremented, but no row is inserted
- Response shows `inserted_count: 1` even though nothing was inserted

**Check:**
```sql
-- Run this to check for duplicate attempts
SELECT offline_uuid, COUNT(*) as count
FROM tabWmsScanEvent
GROUP BY offline_uuid
HAVING COUNT(*) > 1;
```

---

### 2. **Validation Failures**

Events are rejected if:
- Transfer Carton is Sealed/Dispatched
- Carton doesn't exist in `tabCartonStock` (carton-level mode)
- Required fields are missing

**These should appear in the `errors` array in the response.**

---

## ✅ Solutions

### Solution 1: Fix `INSERT IGNORE` Behavior

**Current Code (Line 400):**
```javascript
await connection.execute(`
  INSERT IGNORE INTO tabWmsScanEvent 
  ...
`, [...]);
insertedCount++;  // ← Always incremented, even if ignored
```

**Problem:** `INSERT IGNORE` doesn't throw an error, so we can't detect if the insert was actually ignored.

**Fix:** Check `affectedRows` to see if the insert actually happened:

```javascript
const [result] = await connection.execute(`
  INSERT IGNORE INTO tabWmsScanEvent 
  ...
`, [...]);

if (result.affectedRows > 0) {
  insertedCount++;
  console.log(`✅ Inserted event: ${event_type} (${offline_uuid.substring(0, 8)}...)`);
} else {
  // Insert was ignored (duplicate offline_uuid)
  console.warn(`⚠️  Event ignored (duplicate offline_uuid): ${offline_uuid}`);
  errors.push({
    offline_uuid,
    error: `Event with offline_uuid ${offline_uuid} already exists (duplicate)`
  });
}
```

---

### Solution 2: Mobile App - Generate Unique `offline_uuid`

**Current (May Cause Duplicates):**
```javascript
const offline_uuid = `event-${Date.now()}`;  // ❌ Not unique if called multiple times quickly
```

**Fixed (Guaranteed Unique):**
```javascript
// Option 1: Use UUID library
import { v4 as uuidv4 } from 'uuid';
const offline_uuid = uuidv4();

// Option 2: Generate with more randomness
const offline_uuid = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;

// Option 3: Use device ID + timestamp + random
const offline_uuid = `${deviceId}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
```

---

### Solution 3: Check API Response

**Mobile App Should Check Response:**

```javascript
const response = await fetch('/api/events/batch', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ events: [event] })
});

const data = await response.json();

// Check if events were actually inserted
if (data.inserted_count === 0 && data.errors && data.errors.length > 0) {
  console.error('❌ No events were inserted. Errors:', data.errors);
  data.errors.forEach(err => {
    console.error(`  - ${err.offline_uuid}: ${err.error}`);
  });
} else if (data.inserted_count === 0) {
  console.warn('⚠️  No events were inserted, but no errors reported. Possible duplicate offline_uuid.');
} else {
  console.log(`✅ Inserted ${data.inserted_count} event(s)`);
}
```

---

## 🔧 Backend Fix Required

Update `wms-api/src/modules/events/eventController.js` to check `affectedRows`:

**File:** `wms-api/src/modules/events/eventController.js`  
**Line:** ~400

**Change:**
```javascript
// BEFORE:
await connection.execute(`
  INSERT IGNORE INTO tabWmsScanEvent 
  ...
`, [...]);
insertedCount++;

// AFTER:
const [result] = await connection.execute(`
  INSERT IGNORE INTO tabWmsScanEvent 
  ...
`, [...]);

if (result.affectedRows > 0) {
  insertedCount++;
  console.log(`✅ Inserted event: ${event_type} (${offline_uuid.substring(0, 8)}...)`);
} else {
  // Insert was ignored (duplicate offline_uuid)
  console.warn(`⚠️  Event ignored (duplicate offline_uuid): ${offline_uuid}`);
  errors.push({
    offline_uuid,
    error: `Event with offline_uuid ${offline_uuid} already exists (duplicate)`
  });
}
```

**Apply this fix to ALL `INSERT IGNORE` statements in the function:**
- Line ~255 (PACK_BOX_TO_TC without items)
- Line ~290 (PACK_BOX_TO_TC without box contents)
- Line ~363 (PACK_BOX_TO_TC item-level events)
- Line ~400 (Normal event insertion)

---

## 📋 Diagnostic Steps

### Step 1: Run Diagnostic Script

```sql
-- Run SCRIPTS/DiagnoseEventInsertion.sql
-- This will show:
-- - Recent events
-- - Duplicate offline_uuid attempts
-- - Table structure
-- - Missing required fields
```

### Step 2: Check Server Logs

Look for these messages:
- `✅ Inserted event: ...` → Event was inserted
- `⚠️  Event ignored (duplicate offline_uuid): ...` → Duplicate detected (after fix)
- `⚠️  Rejecting ... event: ...` → Validation failure

### Step 3: Check API Response

```json
{
  "ok": true,
  "inserted_count": 0,  // ← Should be > 0 if events were inserted
  "total_count": 1,
  "errors": [            // ← Check this array
    {
      "offline_uuid": "...",
      "error": "..."     // ← Error message explains why
    }
  ]
}
```

---

## 🎯 Expected Behavior After Fix

**Before Fix:**
- `inserted_count: 1` but no row in database (duplicate `offline_uuid`)

**After Fix:**
- `inserted_count: 0` and error in `errors` array: "Event with offline_uuid ... already exists (duplicate)"

---

**Status:** 🔧 **BACKEND FIX REQUIRED**  
**Date:** 2026-01-13
