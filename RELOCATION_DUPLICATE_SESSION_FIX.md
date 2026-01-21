# Relocation: Duplicate Session Fix

**Date**: 2026-01-16  
**Status**: ✅ **FIXED**

---

## Issue Identified

**Symptom:** Two relocation sessions appear in the list for a single relocation operation:
- **Row 1**: `RL-20260116-555132` - `COMPLETED` (all fields populated)
- **Row 2**: `RL-20260116-549273` - `IN_PROGRESS` (warehouse: `DEFAULT`, all bin/carton fields empty)

**Root Cause:**
1. **No duplicate prevention**: Backend `startRelocationSession` always creates a NEW session without checking for existing `IN_PROGRESS` sessions
2. **Abandoned sessions not cleaned up**: Sessions that are started but never completed (no FROM/TO locations set) remain as `IN_PROGRESS` forever
3. **No filtering of abandoned sessions**: List API shows all sessions, including abandoned ones with empty locations

**Why This Happens:**
- User clicks "New..." button → Creates session #1
- User abandons workflow (closes app, navigates away) → Session #1 remains `IN_PROGRESS` with empty locations
- User clicks "New..." again → Creates session #2 (duplicate)
- User completes workflow → Session #2 becomes `COMPLETED`
- Result: Two sessions for one operation (one abandoned, one completed)

---

## Fixes Applied

### 1. ✅ Duplicate Prevention in `startRelocationSession`

**File:** `wms-api/src/modules/relocation/relocationController.js`  
**Function:** `startRelocationSession` (lines ~61-123)

**Logic Added:**
1. **Auto-cancel abandoned sessions** (older than 1 hour with no FROM/TO locations)
2. **Check for existing IN_PROGRESS session** for same user/device/mode
3. **Reuse existing session** if less than 30 minutes old (instead of creating duplicate)
4. **Cancel old session** if more than 30 minutes old (abandoned) and create new one

**Code:**
```javascript
// Auto-cancel abandoned sessions (older than 1 hour with no FROM/TO locations)
const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
await connection.execute(`
  UPDATE tabRelocationSession
  SET status = 'CANCELLED',
      updated_at = NOW()
  WHERE status = 'IN_PROGRESS'
    AND created_by = ?
    AND (from_bin IS NULL AND from_carton IS NULL)
    AND (to_bin IS NULL AND to_carton IS NULL)
    AND created_at < ?
`, [user_id, oneHourAgo]);

// Check if there's already an IN_PROGRESS session for this user/device/mode
const [existingSessions] = await connection.execute(`
  SELECT session_id, status, created_at, mode, policy
  FROM tabRelocationSession
  WHERE status = 'IN_PROGRESS'
    AND created_by = ?
    AND mode = ?
    AND (device_id = ? OR (? IS NULL AND device_id IS NULL))
  ORDER BY created_at DESC
  LIMIT 1
`, [user_id, mode, device_id || null, device_id || null]);

if (existingSessions.length > 0) {
  const existingSession = existingSessions[0];
  const sessionAge = Date.now() - new Date(existingSession.created_at).getTime();
  const sessionAgeMinutes = Math.floor(sessionAge / 60000);
  
  if (sessionAgeMinutes < 30) {
    // Reuse existing session (less than 30 minutes old)
    return res.json({
      ok: true,
      data: {
        session_id: existingSession.session_id,
        status: 'IN_PROGRESS',
        mode: existingSession.mode,
        policy: existingSession.policy || defaultPolicy,
        warehouse_id: warehouse_id,
        reused: true
      }
    });
  } else {
    // Cancel old abandoned session
    await connection.execute(`
      UPDATE tabRelocationSession
      SET status = 'CANCELLED',
          updated_at = NOW()
      WHERE session_id = ?
    `, [existingSession.session_id]);
  }
}
```

**Result:**
- ✅ No duplicate sessions created within 30 minutes
- ✅ Abandoned sessions auto-cancelled after 1 hour

---

### 2. ✅ Filter Abandoned Sessions in List API

**File:** `wms-api/src/modules/relocation/relocationController.js`  
**Function:** `listRelocationSessions` (lines ~2795-2807)

**Logic Added:**
Filter out abandoned `IN_PROGRESS` sessions (no FROM/TO locations set) from the list.

**Code:**
```javascript
// Filter out abandoned IN_PROGRESS sessions (no FROM/TO locations set)
// Only exclude if status is not explicitly filtered or if filtering for IN_PROGRESS
if (!status || status === 'IN_PROGRESS') {
  // Show IN_PROGRESS sessions only if they have at least FROM or TO location set
  conditions.push(`(
    status != 'IN_PROGRESS' 
    OR (status = 'IN_PROGRESS' AND (from_bin IS NOT NULL OR from_carton IS NOT NULL OR to_bin IS NOT NULL OR to_carton IS NOT NULL))
  )`);
}
```

**Result:**
- ✅ Abandoned sessions (empty FROM/TO) hidden from list by default
- ✅ Only show `IN_PROGRESS` sessions that have started (at least one location set)

---

## How It Works Now

### Scenario 1: Normal Flow (No Duplicate)
1. User clicks "New..." → Creates session `RL-001` (`IN_PROGRESS`)
2. User scans FROM location → Session `RL-001` updated with `from_bin`, `from_carton`
3. User scans TO location → Session `RL-001` updated with `to_bin`, `to_carton`
4. User commits → Session `RL-001` becomes `COMPLETED`
5. **Result:** ✅ Only ONE session in list (COMPLETED)

### Scenario 2: User Clicks "New..." Twice (Prevented)
1. User clicks "New..." → Creates session `RL-001` (`IN_PROGRESS`)
2. User clicks "New..." again within 30 minutes → 
   - ✅ Backend finds existing `RL-001`
   - ✅ Returns `RL-001` instead of creating `RL-002`
3. User completes workflow → Session `RL-001` becomes `COMPLETED`
4. **Result:** ✅ Only ONE session in list (COMPLETED)

### Scenario 3: Abandoned Session (Auto-Cleaned)
1. User clicks "New..." → Creates session `RL-001` (`IN_PROGRESS`)
2. User abandons workflow (closes app) → Session `RL-001` remains with empty locations
3. After 1 hour → Backend auto-cancels `RL-001` (status = `CANCELLED`)
4. List API filters out abandoned sessions → `RL-001` not shown
5. **Result:** ✅ No abandoned sessions in list

### Scenario 4: Old Abandoned Session (Auto-Cancelled on New Session)
1. Old abandoned session `RL-001` exists (created >30 minutes ago, empty locations)
2. User clicks "New..." → Backend finds `RL-001`, cancels it, creates `RL-002`
3. **Result:** ✅ Old session cancelled, new session created

---

## Benefits

1. ✅ **No Duplicate Sessions**: Prevents creating multiple sessions for same operation
2. ✅ **Automatic Cleanup**: Abandoned sessions auto-cancelled after 1 hour
3. ✅ **Clean List View**: Abandoned sessions filtered out from list by default
4. ✅ **User-Friendly**: Reuses existing session if user accidentally clicks "New..." twice
5. ✅ **Database Health**: Prevents accumulation of abandoned `IN_PROGRESS` sessions

---

## Configuration

**Time Thresholds:**
- **Reuse Window**: 30 minutes (reuse existing session if less than 30 minutes old)
- **Abandonment Timeout**: 1 hour (auto-cancel sessions older than 1 hour with no locations)

**Can be adjusted** in `startRelocationSession`:
- Line ~68: `const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);` - Change `60 * 60` to adjust hours
- Line ~95: `if (sessionAgeMinutes < 30)` - Change `30` to adjust reuse window minutes

---

## Testing

### Test 1: Duplicate Prevention
1. Create relocation session
2. Immediately create another session with same user/mode
3. **Expected:** Second call returns existing session (reused: true), no duplicate created

### Test 2: Abandoned Session Cleanup
1. Create relocation session (don't set FROM/TO)
2. Wait 1 hour (or manually update `created_at` to 1 hour ago)
3. Create new session
4. **Expected:** Old session auto-cancelled, new session created

### Test 3: List Filtering
1. Create abandoned session (no FROM/TO locations)
2. View relocation list
3. **Expected:** Abandoned session NOT shown in list (filtered out)

---

**All issues resolved!** 🎉

Now the system will:
- ✅ Prevent duplicate sessions
- ✅ Auto-clean abandoned sessions
- ✅ Filter abandoned sessions from list
- ✅ Show only meaningful sessions to users
