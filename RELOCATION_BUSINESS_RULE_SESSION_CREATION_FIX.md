# Relocation: Business Rule - Session Creation Only on Complete

**Date**: 2026-01-17  
**Status**: ⚠️ **ANALYSIS COMPLETE - IMPLEMENTATION NEEDED**

---

## Business Rule

**Relocation sessions should NOT be created until user clicks "Complete" button.**

### Current Flow (WRONG):
1. ✅ User clicks "New..." → **Creates session in DB** (status: `IN_PROGRESS`) ❌
2. User scans FROM bin → Updates session
3. User scans FROM carton → Updates session
4. User scans TO bin → Updates session
5. User scans TO carton → Updates session
6. User clicks "Complete" → Commits and marks `COMPLETED`

### Required Flow (CORRECT):
1. ✅ User clicks "New..." → **NO session created** (data stored in memory/client-side) ✅
2. User scans FROM bin → Store in memory (no DB insert)
3. User scans FROM carton → Store in memory (no DB insert)
4. User scans TO bin → Store in memory (no DB insert)
5. User scans TO carton → Store in memory (no DB insert)
6. User clicks "Complete" → **NOW create session AND commit in ONE transaction** ✅

---

## Current Implementation Analysis

### Backend API Endpoints:

1. **`POST /api/relocation/session/start`** (Line 27)
   - ❌ **Creates session in DB immediately**
   - ❌ Insert into `tabRelocationSession` with status `IN_PROGRESS`
   - **Called when:** User clicks "New..." button

2. **`PUT /api/relocation/session/:session_id/from`** (Line 175)
   - Updates existing session with FROM location
   - **Requires:** Session to already exist

3. **`PUT /api/relocation/session/:session_id/to`** (Line 390)
   - Updates existing session with TO location
   - **Requires:** Session to already exist

4. **`POST /api/relocation/session/:session_id/commit-full`** (Line 1188)
   - Commits relocation and marks session as `COMPLETED`
   - **Requires:** Session to already exist with status `IN_PROGRESS`

5. **`POST /api/relocation/session/:session_id/commit-partial`** (Line 2455)
   - Commits partial move and marks session as `COMPLETED`
   - **Requires:** Session to already exist with status `IN_PROGRESS`

### Frontend (Desktop) Usage:

**File:** `Windows/RelocationSessionDetailWindow.xaml.cs` (Line 76)
- Calls `RelocationApiService.StartSessionAsync` when window opens
- This creates session immediately ❌

**File:** `Services/RelocationApiService.cs` (Line 33)
- `StartSessionAsync` calls `/api/relocation/session/start`
- Creates session in DB immediately ❌

---

## Solution Options

### Option 1: New "Complete" Endpoint (RECOMMENDED) ✅

**Create new endpoints that accept all data and create session + commit atomically:**

1. **`POST /api/relocation/complete-full`**
   - Accepts: `mode`, `warehouse_id`, `from_bin`, `from_carton`, `to_bin`, `to_carton`, `policy`, etc.
   - **Creates session AND commits in ONE transaction**
   - Session status: `COMPLETED` (never `IN_PROGRESS`)

2. **`POST /api/relocation/complete-partial`**
   - Accepts: `mode`, `warehouse_id`, `from_bin`, `from_carton`, `to_bin`, `to_carton`, `lines`, etc.
   - **Creates session AND commits in ONE transaction**
   - Session status: `COMPLETED` (never `IN_PROGRESS`)

**Pros:**
- ✅ Clean separation: old endpoints for backward compatibility, new endpoints for new workflow
- ✅ Atomic operation: session creation + commit in one transaction
- ✅ No `IN_PROGRESS` sessions created
- ✅ Frontend can store data locally until "Complete" button clicked

**Cons:**
- ⚠️ Requires frontend changes (don't call `/session/start`, call `/complete-full` or `/complete-partial`)
- ⚠️ Need to keep old endpoints for backward compatibility (if mobile app uses them)

---

### Option 2: Modify Commit Endpoints to Create Session if Missing

**Modify `commit-full` and `commit-partial` to:**
- Accept session data in request body (not just session_id)
- If session doesn't exist, create it and commit in one transaction
- If session exists, use existing logic

**Pros:**
- ✅ Minimal API changes (modify existing endpoints)
- ✅ Backward compatible (can still use session_id if session exists)

**Cons:**
- ⚠️ More complex logic (create if missing, update if exists)
- ⚠️ Confusing API (endpoint name suggests it only commits, but can also create)

---

### Option 3: Client-Side Session Management (NOT RECOMMENDED)

**Frontend stores session data locally, only calls commit endpoints:**
- Frontend generates session_id locally
- Frontend stores all data in memory/state
- When "Complete" clicked, call commit endpoint with all data

**Cons:**
- ❌ Commit endpoints expect session to exist
- ❌ Would require major refactoring of commit endpoints
- ❌ Not following standard API patterns

---

## Recommended Implementation: Option 1 ✅

### Step 1: Create New "Complete" Endpoints

**New Endpoint:** `POST /api/relocation/complete-full`

**Request Body:**
```json
{
  "mode": "FULL_CARTON",
  "warehouse_id": "WH-MAIN",
  "from_bin": "A1-R02-L1-B2",
  "from_carton": "CTN-TI-0001-20260116-161713-261",
  "to_bin": "A1-R01-L4-B1",
  "to_carton": "CTN-555445",  // optional (defaults to from_carton)
  "policy": "BLIND",  // optional
  "user_id": "USER-001",
  "device_id": "DEVICE-001"  // optional
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Relocation completed successfully",
  "data": {
    "session_id": "RL-20260117-123456",
    "status": "COMPLETED",
    "from_bin": "A1-R02-L1-B2",
    "from_carton": "CTN-TI-0001-20260116-161713-261",
    "to_bin": "A1-R01-L4-B1",
    "to_carton": "CTN-555445"
  }
}
```

**Implementation Logic:**
```javascript
// 1. Generate session_id
// 2. Validate all required fields (from_bin, from_carton, to_bin, etc.)
// 3. BEGIN TRANSACTION
// 4. INSERT session with status = 'COMPLETED' (not IN_PROGRESS)
// 5. Execute all commit logic (stock updates, transaction history)
// 6. COMMIT transaction
// If any step fails → ROLLBACK → No session created
```

### Step 2: Frontend Changes

**Desktop App (`RelocationSessionDetailWindow.xaml.cs`):**
- ❌ Remove call to `StartSessionAsync` on window open
- ✅ Store relocation data in ViewModel (no API call)
- ✅ When "Complete" clicked → Call new `CompleteFullAsync` or `CompletePartialAsync`

**Mobile App:**
- ❌ Remove call to `/api/relocation/session/start` when user clicks "New..."
- ✅ Store relocation data in state/context (no API call)
- ✅ When "Complete" clicked → Call new `/api/relocation/complete-full` or `/complete-partial`

---

## Implementation Details

### Backend: New Complete Endpoint

**File:** `wms-api/src/modules/relocation/relocationController.js`

**New Function:** `completeFullCartonRelocation` (similar to `commitFullCartonMove` but creates session too)

**Key Differences:**
- ✅ Accepts all relocation data in request body (not session_id)
- ✅ Creates session with status = `COMPLETED` directly (skips `IN_PROGRESS`)
- ✅ Executes commit logic in same transaction
- ✅ If commit fails → Session never created (rollback)

### Frontend: Remove Session Start Call

**Desktop:**
- `RelocationSessionDetailWindow.xaml.cs`: Don't call `StartSessionAsync` in constructor
- Store mode/warehouse in ViewModel locally
- When Complete → Call `CompleteFullRelocationAsync` (new method)

**Mobile:**
- Don't call `/api/relocation/session/start` when user clicks "New..."
- Store all scanned data in component state
- When Complete → Call `/api/relocation/complete-full` or `/complete-partial`

---

## Migration Strategy

### Option A: Dual Support (Recommended for Transition)

**Keep old endpoints for backward compatibility:**
- Keep `POST /api/relocation/session/start` (for mobile app that hasn't updated)
- Keep `PUT /api/relocation/session/:id/from` (for old workflow)
- Keep `POST /api/relocation/session/:id/commit-full` (for old workflow)

**Add new endpoints:**
- Add `POST /api/relocation/complete-full` (for new workflow)
- Add `POST /api/relocation/complete-partial` (for new workflow)

**Frontend:**
- Desktop app: Use new endpoints
- Mobile app: Can migrate gradually (use new endpoints when updated)

### Option B: Breaking Change

**Remove old endpoints:**
- Remove `POST /api/relocation/session/start`
- Remove `PUT /api/relocation/session/:id/from`
- Remove `PUT /api/relocation/session/:id/to`

**Only keep:**
- `POST /api/relocation/complete-full`
- `POST /api/relocation/complete-partial`

**Frontend:**
- Both desktop and mobile must update simultaneously

---

## Testing Checklist

### Backend:
- [ ] New `complete-full` endpoint creates session with status = `COMPLETED`
- [ ] Session never created with status = `IN_PROGRESS`
- [ ] All commit logic executes correctly
- [ ] If commit fails, session not created (rollback)
- [ ] Transaction history created correctly
- [ ] Stock ledger updated correctly

### Frontend:
- [ ] Desktop: No call to `StartSessionAsync` when clicking "New..."
- [ ] Desktop: Data stored locally until "Complete" clicked
- [ ] Desktop: "Complete" button calls new `CompleteFullAsync` endpoint
- [ ] Mobile: No call to `/session/start` when clicking "New..."
- [ ] Mobile: Data stored in state until "Complete" clicked
- [ ] Mobile: "Complete" button calls new `/complete-full` endpoint

---

## Summary

**Current Issue:**
- ❌ Session created when user clicks "New..." (status: `IN_PROGRESS`)
- ❌ Session appears in list before completion
- ❌ Violates business rule: "Relocation should not be inserted until click complete"

**Required Fix:**
- ✅ Session created ONLY when user clicks "Complete"
- ✅ Session created with status = `COMPLETED` (never `IN_PROGRESS`)
- ✅ All data (FROM/TO locations) provided in one request
- ✅ Atomic operation: Session creation + commit in one transaction

**Recommended Solution:**
- ✅ Create new `/api/relocation/complete-full` and `/complete-partial` endpoints
- ✅ Frontend stores data locally until "Complete" clicked
- ✅ New endpoints create session and commit atomically

---

**Status:** ⚠️ **ANALYSIS COMPLETE - READY FOR IMPLEMENTATION**

Next Steps:
1. Create new `completeFullCartonRelocation` function in backend
2. Create new `completePartialRelocation` function in backend
3. Register new routes in `relocationRoutes.js`
4. Update desktop app to use new endpoints
5. Update mobile app to use new endpoints (optional, can migrate later)
