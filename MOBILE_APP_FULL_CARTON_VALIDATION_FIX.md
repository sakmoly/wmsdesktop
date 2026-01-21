# Mobile App FULL_CARTON Mode Validation Fix

## Issue

The mobile app is showing an error dialog when users try to scan a **new carton ID** in FULL_CARTON mode:

**Error Message:**
- "Invalid Carton ID"
- "FULL_CARTON mode is for moving a carton from one bin to another."
- "The destination carton ID must be the same as the source carton ID."
- "If you want to move items to a different carton, please use 'Carton → Carton' mode instead."

**User's Request:**
- Users want to scan a **new carton ID** in FULL_CARTON mode
- The system should accept and update the carton ID, not validate it
- This allows carton merge operations even in FULL_CARTON mode

## Backend Status: ✅ READY

The backend has been **updated and is ready** to accept any carton ID in FULL_CARTON mode:

### 1. `setRelocationTo` API (`/api/relocation/session/:session_id/to`)

**File:** `wms-api/src/modules/relocation/relocationController.js` (lines ~399-412)

**Current Behavior:**
- ✅ Accepts any `to_carton` value (null, same as `from_carton`, or different)
- ✅ Does NOT auto-fill with `from_carton` when `to_carton` is null
- ✅ Allows users to explicitly scan/enter the carton they want
- ✅ Logs when a new carton is accepted: `"Accepting to_carton (CTN-555445) for FULL_CARTON mode"`

**Code:**
```javascript
// For FULL_CARTON mode, accept whatever carton is provided (or null if not provided)
// If to_carton is null/empty, it means user wants to keep the same carton (will be handled in commit)
// If to_carton is provided (even if different from from_carton), accept it as a new carton merge
// DO NOT auto-fill with from_carton here - let the user explicitly scan/enter the carton they want
if (session.mode === 'FULL_CARTON') {
  // Accept the provided to_carton as-is (can be null, same as from_carton, or different)
  // The commit logic will handle determining the actual behavior
  actualToCarton = to_carton || null;
  if (actualToCarton) {
    console.log(`📦 [setRelocationTo] Accepting to_carton (${actualToCarton}) for FULL_CARTON mode`);
  } else {
    console.log(`📦 [setRelocationTo] to_carton not provided for FULL_CARTON mode - will use from_carton during commit`);
  }
}
```

### 2. `commitFullCartonMove` API (`/api/relocation/session/:session_id/commit-full`)

**File:** `wms-api/src/modules/relocation/relocationController.js` (lines ~1048-1065)

**Current Behavior:**
- ✅ Allows scanning a new carton in FULL_CARTON mode
- ✅ If `to_carton` is different from `from_carton`, treats it as a carton merge/transfer
- ✅ Handles both same-carton moves and carton merge operations

**Code:**
```javascript
// For FULL_CARTON mode, allow scanning a new carton
// If to_carton is different from from_carton, it will be treated as a carton merge/transfer
// This allows users to move items to a new carton even in FULL_CARTON mode
const actualPolicy = policy || session.session_policy || 'BLIND';

// Determine the actual TO carton to use
// Priority: 1) to_carton from session (if scanned), 2) to_carton_mode setting, 3) from_carton (keep same)
let actualToCarton = session.to_carton;
if (!actualToCarton) {
  if (to_carton_mode === 'NEW_CARTON') {
    actualToCarton = null; // Will create new carton or use existing logic
  } else {
    actualToCarton = session.from_carton; // Keep same carton (default for FULL_CARTON)
  }
}

// Check if this is a CARTON_MERGE operation (to_carton is set and different from from_carton)
// This can happen in FULL_CARTON mode if user scans a new carton
const isCartonMerge = actualToCarton && actualToCarton !== session.from_carton;
```

## Mobile App Fix Required

The mobile app needs to be updated to **remove the client-side validation** that prevents scanning a new carton ID in FULL_CARTON mode.

### Current Mobile App Behavior (WRONG):
1. User scans a new carton ID (e.g., `CTN-555445`)
2. Mobile app validates: `if (to_carton !== from_carton && mode === 'FULL_CARTON')`
3. Mobile app shows error: "Invalid Carton ID - destination must be same as source"
4. Request is **never sent** to backend

### Required Mobile App Behavior (CORRECT):
1. User scans a new carton ID (e.g., `CTN-555445`)
2. Mobile app **accepts** the carton ID (no validation)
3. Mobile app sends request to backend: `PUT /api/relocation/session/:session_id/to` with `to_carton: "CTN-555445"`
4. Backend accepts and stores the carton ID
5. User can proceed to commit the relocation

### Mobile App Code Changes Needed:

**Location:** Mobile app relocation screen (Scan TO Carton ID)

**Remove or Update:**
```javascript
// ❌ REMOVE THIS VALIDATION:
if (mode === 'FULL_CARTON' && toCarton !== fromCarton) {
  showError('Invalid Carton ID', 
    'FULL_CARTON mode is for moving a carton from one bin to another. ' +
    'The destination carton ID must be the same as the source carton ID. ' +
    'If you want to move items to a different carton, please use \'Carton → Carton\' mode instead.');
  return;
}

// ✅ REPLACE WITH (or just remove validation entirely):
// Allow any carton ID - backend will handle it
// If to_carton is different from from_carton, backend will treat it as a carton merge
```

**Alternative:** If you want to keep some validation but allow new cartons:
```javascript
// ✅ OPTIONAL: Only validate that carton ID is not empty (if required)
if (mode === 'FULL_CARTON' && requireToCarton && !toCarton) {
  showError('Required Field', 'Please scan or enter a carton ID');
  return;
}

// ✅ Allow different carton IDs - backend handles carton merge
// No validation needed for to_carton !== from_carton
```

## Testing

### Test Case 1: Same Carton (Default Behavior)
1. Start FULL_CARTON relocation session
2. Set FROM: `bin=A1-R01-L1-B1, carton=CTN-001`
3. Set TO: `bin=A1-R02-L1-B2, carton=null` (or same as FROM)
4. **Expected:** Backend uses `from_carton` as `to_carton` during commit
5. **Result:** Carton moves to new bin, same carton ID

### Test Case 2: New Carton (Carton Merge)
1. Start FULL_CARTON relocation session
2. Set FROM: `bin=A1-R01-L1-B1, carton=CTN-001`
3. Set TO: `bin=A1-R02-L1-B2, carton=CTN-002` (different carton)
4. **Expected:** Backend accepts `CTN-002` and performs carton merge
5. **Result:** Items from `CTN-001` are moved to `CTN-002` at new bin location

### Test Case 3: Mobile App Validation Removed
1. Open mobile app relocation screen
2. Scan FROM carton: `CTN-001`
3. Scan TO carton: `CTN-002` (different carton)
4. **Expected:** No error dialog, request sent to backend
5. **Result:** Backend accepts and processes the relocation

## Summary

✅ **Backend is ready** - Accepts any carton ID in FULL_CARTON mode
❌ **Mobile app needs update** - Remove client-side validation that rejects different carton IDs
📝 **Action Required:** Update mobile app to remove the validation check

The backend will handle:
- Same carton moves (default behavior)
- Carton merge operations (when `to_carton` differs from `from_carton`)
- Proper stock ledger and transaction history updates

No backend changes needed - mobile app validation is the blocker.
