# Event Insertion Fix Summary

## ✅ Backend Fix Applied

### Problem
The API was using `INSERT IGNORE` which silently ignored duplicate `offline_uuid` values. The code was incrementing `insertedCount` even when no row was actually inserted, making it appear that events were being saved when they weren't.

### Fix
Updated `wms-api/src/modules/events/eventController.js` to check `affectedRows` after each `INSERT IGNORE` statement:

**Before:**
```javascript
await connection.execute(`INSERT IGNORE INTO tabWmsScanEvent ...`, [...]);
insertedCount++;  // ❌ Always incremented, even if ignored
```

**After:**
```javascript
const [result] = await connection.execute(`INSERT IGNORE INTO tabWmsScanEvent ...`, [...]);
if (result.affectedRows > 0) {
  insertedCount++;  // ✅ Only incremented if row was inserted
  console.log(`✅ Inserted event: ...`);
} else {
  // ✅ Now properly reports duplicate
  errors.push({
    offline_uuid,
    error: `Event with offline_uuid ${offline_uuid} already exists (duplicate)`
  });
}
```

### Files Changed
- `wms-api/src/modules/events/eventController.js` (4 locations fixed)

---

## 📱 Mobile App Action Required

### Issue: Duplicate `offline_uuid`

The mobile app must generate **unique** `offline_uuid` for each event. If the same `offline_uuid` is sent twice, the second attempt will be ignored.

### Solution: Generate Unique UUID

**Option 1: Use UUID Library (Recommended)**
```javascript
import { v4 as uuidv4 } from 'uuid';

const event = {
  offline_uuid: uuidv4(),  // ✅ Guaranteed unique
  event_type: 'PACK_ITEM_TO_TC',
  // ... other fields
};
```

**Option 2: Generate with Timestamp + Random**
```javascript
function generateOfflineUuid() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
}

const event = {
  offline_uuid: generateOfflineUuid(),  // ✅ Very likely unique
  // ... other fields
};
```

**Option 3: Use Device ID + Timestamp + Random**
```javascript
const event = {
  offline_uuid: `${deviceId}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
  // ... other fields
};
```

---

## 🔍 How to Verify Fix

### 1. Check API Response

**Before Fix:**
```json
{
  "ok": true,
  "inserted_count": 1,  // ❌ Misleading - no row was inserted
  "total_count": 1
}
```

**After Fix:**
```json
{
  "ok": true,
  "inserted_count": 0,  // ✅ Correct - no row was inserted
  "total_count": 1,
  "errors": [
    {
      "offline_uuid": "duplicate-uuid-123",
      "error": "Event with offline_uuid duplicate-uuid-123 already exists (duplicate). Please generate a unique offline_uuid."
    }
  ]
}
```

### 2. Check Server Logs

**Before Fix:**
- No warning for duplicates
- `✅ Inserted event: ...` logged even when ignored

**After Fix:**
- `⚠️  Event ignored (duplicate offline_uuid): ...` logged when duplicate detected
- `✅ Inserted event: ...` only logged when actually inserted

### 3. Run Diagnostic Script

```sql
-- Run SCRIPTS/DiagnoseEventInsertion.sql
-- Check for duplicate offline_uuid attempts
```

---

## 📋 Checklist

- [x] Backend fix applied (check `affectedRows`)
- [ ] Mobile app generates unique `offline_uuid` for each event
- [ ] Mobile app checks API response for `errors` array
- [ ] Test event insertion and verify events appear in database
- [ ] Check server logs for duplicate warnings

---

## 🎯 Expected Behavior

**After Fix:**
1. Mobile app sends event with unique `offline_uuid`
2. API inserts event successfully
3. Response shows `inserted_count: 1`
4. Event appears in `tabWmsScanEvent` table

**If Duplicate:**
1. Mobile app sends event with duplicate `offline_uuid`
2. API detects duplicate (no row inserted)
3. Response shows `inserted_count: 0` and error in `errors` array
4. Server logs warning: `⚠️  Event ignored (duplicate offline_uuid): ...`

---

**Status:** ✅ **BACKEND FIX APPLIED**  
**Mobile App Action:** 🔧 **REQUIRED** (Generate unique `offline_uuid`)  
**Date:** 2026-01-13
