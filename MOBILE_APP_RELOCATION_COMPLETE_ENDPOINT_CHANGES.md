# Mobile App: Relocation Complete Endpoint Changes

**Date**: 2026-01-17  
**Status**: ⚠️ **REQUIRED CHANGES**

---

## Business Rule

**Relocation sessions should NOT be created until user clicks "Complete" button.**

**Current Flow (WRONG):**

1. User clicks "New..." → Calls `/api/relocation/session/start` → Creates session in DB (status: `IN_PROGRESS`) ❌
2. User scans locations → Updates session via `/session/:id/from` and `/session/:id/to`
3. User clicks "Complete" → Calls `/session/:id/commit-full` or `/commit-partial`

**Required Flow (CORRECT):**

1. User clicks "New..." → **NO API call** → Store data in component state ✅
2. User scans locations → **NO API calls** → Update component state ✅
3. User clicks "Complete" → Call `/api/relocation/complete-full` or `/complete-partial` → Creates session + commits atomically ✅

---

## Required Changes

### 1. ❌ Remove Session Start API Call

**File:** Mobile app relocation component (e.g., `RelocationHomeScreen.tsx` or similar)

**Current Code (REMOVE):**

```typescript
// ❌ DON'T DO THIS ANYMORE
const handleStartRelocation = async () => {
  const response = await apiService.post("/api/relocation/session/start", {
    mode: "FULL_CARTON",
    warehouse_id: "WH-MAIN",
    user_id: currentUser.id,
  });

  setSessionId(response.data.session_id);
  setStatus(response.data.status); // This would be 'IN_PROGRESS' ❌
};
```

**New Code:**

```typescript
// ✅ Store data locally instead
const [relocationData, setRelocationData] = useState({
  mode: null,
  warehouse_id: null,
  from_bin: null,
  from_carton: null,
  to_bin: null,
  to_carton: null,
  lines: [], // For partial moves
});

const handleStartRelocation = (mode: string) => {
  // ✅ Just set mode in state, NO API call
  setRelocationData({
    ...relocationData,
    mode: mode,
    warehouse_id: "WH-MAIN", // or get from context
  });
  // Navigate to first scan screen
};
```

---

### 2. ❌ Remove Session Update API Calls

**File:** Relocation scan screens (e.g., `RelocationScanFromBinScreen.tsx`, `RelocationScanFromCartonScreen.tsx`)

**Current Code (REMOVE):**

```typescript
// ❌ DON'T DO THIS ANYMORE
const handleScanFromBin = async (bin: string) => {
  await apiService.put(`/api/relocation/session/${sessionId}/from`, {
    from_bin: bin,
  });
  // Update local state...
};
```

**New Code:**

```typescript
// ✅ Just update local state, NO API call
const handleScanFromBin = (bin: string) => {
  setRelocationData({
    ...relocationData,
    from_bin: bin,
  });
  // Navigate to next screen...
};
```

---

### 3. ✅ Add Complete Relocation API Call

**File:** Relocation execute/complete screen (e.g., `RelocationExecuteScreen.tsx`)

**Current Code (CHANGE):**

```typescript
// ❌ OLD: Uses session_id from previous API call
const handleCompleteRelocation = async () => {
  await apiService.post(`/api/relocation/session/${sessionId}/commit-full`, {
    policy: "BLIND",
  });
};
```

**New Code:**

```typescript
// ✅ NEW: Calls complete endpoint with ALL data
const handleCompleteRelocation = async () => {
  try {
    const response = await apiService.post("/api/relocation/complete-full", {
      mode: relocationData.mode,
      warehouse_id: relocationData.warehouse_id,
      from_bin: relocationData.from_bin,
      from_carton: relocationData.from_carton,
      to_bin: relocationData.to_bin,
      to_carton: relocationData.to_carton, // optional
      policy: "BLIND", // optional
      user_id: currentUser.id,
      device_id: deviceId, // optional
    });

    // Response includes session_id (now created)
    const { session_id, status } = response.data;
    console.log(`✅ Relocation completed: ${session_id} (status: ${status})`);

    // Navigate to success screen
  } catch (error) {
    Alert.alert("Error", `Failed to complete relocation: ${error.message}`);
  }
};
```

---

### 4. ✅ Add Complete Partial Move API Call

**For Partial Moves / Carton-to-Carton:**

**New Code:**

```typescript
const handleCompletePartialRelocation = async () => {
  try {
    const response = await apiService.post("/api/relocation/complete-partial", {
      mode: relocationData.mode, // 'PARTIAL_ITEMS' or 'CARTON_TO_CARTON'
      warehouse_id: relocationData.warehouse_id,
      from_bin: relocationData.from_bin,
      from_carton: relocationData.from_carton,
      to_bin: relocationData.to_bin,
      to_carton: relocationData.to_carton,
      lines: relocationData.lines, // Array of { item_code, qty }
      user_id: currentUser.id,
      device_id: deviceId, // optional
    });

    const { session_id, status } = response.data;
    console.log(`✅ Partial relocation completed: ${session_id}`);

    // Navigate to success screen
  } catch (error) {
    Alert.alert("Error", `Failed to complete relocation: ${error.message}`);
  }
};
```

---

## API Endpoint Changes

### Old Endpoints (STILL WORK - for backward compatibility):

- `POST /api/relocation/session/start` - ❌ Don't use anymore (creates IN_PROGRESS session)
- `PUT /api/relocation/session/:id/from` - ❌ Don't use anymore (requires session to exist)
- `PUT /api/relocation/session/:id/to` - ❌ Don't use anymore (requires session to exist)
- `POST /api/relocation/session/:id/commit-full` - ❌ Don't use anymore (requires session to exist)
- `POST /api/relocation/session/:id/commit-partial` - ❌ Don't use anymore (requires session to exist)

### New Endpoints (USE THESE):

- `POST /api/relocation/complete-full` - ✅ Use for full carton moves
- `POST /api/relocation/complete-partial` - ✅ Use for partial moves

---

## Request/Response Examples

### Complete Full Carton Move

**Endpoint:** `POST /api/relocation/complete-full`

**Request:**

```json
{
  "mode": "FULL_CARTON",
  "warehouse_id": "WH-MAIN",
  "from_bin": "A1-R02-L1-B2",
  "from_carton": "CTN-TI-0001-20260116-161713-261",
  "to_bin": "A1-R01-L4-B1",
  "to_carton": "CTN-555445", // optional (defaults to from_carton)
  "policy": "BLIND", // optional (defaults based on mode)
  "user_id": "USER-001",
  "device_id": "DEVICE-001" // optional
}
```

**Response (Success):**

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
    "to_carton": "CTN-555445",
    "policy": "BLIND",
    "operation_type": "CARTON_RELOCATION"
  }
}
```

**Response (Error):**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "from_carton must be set before committing"
  }
}
```

---

### Complete Partial Move

**Endpoint:** `POST /api/relocation/complete-partial`

**Request:**

```json
{
  "mode": "CARTON_TO_CARTON",
  "warehouse_id": "WH-MAIN",
  "from_bin": "A1-R02-L1-B2",
  "from_carton": "CTN-TI-0001-20260116-161713-261",
  "to_bin": "A1-R01-L4-B1",
  "to_carton": "CTN-555445",
  "lines": [
    { "item_code": "SKU-HAT-301-GRN-OS", "qty": 2 },
    { "item_code": "SKU-HAT-301-BLU-OS", "qty": 2 }
  ],
  "user_id": "USER-001",
  "device_id": "DEVICE-001" // optional
}
```

**Response (Success):**

```json
{
  "ok": true,
  "message": "Partial relocation completed successfully",
  "data": {
    "session_id": "RL-20260117-123457",
    "status": "COMPLETED",
    "from_bin": "A1-R02-L1-B2",
    "from_carton": "CTN-TI-0001-20260116-161713-261",
    "to_bin": "A1-R01-L4-B1",
    "to_carton": "CTN-555445",
    "items_moved": 2
  }
}
```

---

## Component State Management

### Recommended State Structure:

```typescript
interface RelocationData {
  mode: "FULL_CARTON" | "PARTIAL_ITEMS" | "CARTON_TO_CARTON" | null;
  warehouse_id: string | null;
  from_bin: string | null;
  from_carton: string | null;
  to_bin: string | null;
  to_carton: string | null;
  lines: Array<{ item_code: string; qty: number }>; // For partial moves
  policy?: "BLIND" | "VERIFIED"; // optional
}

// In your component:
const [relocationData, setRelocationData] = useState<RelocationData>({
  mode: null,
  warehouse_id: null,
  from_bin: null,
  from_carton: null,
  to_bin: null,
  to_carton: null,
  lines: [],
});
```

---

## Migration Steps

### Step 1: Update State Management

1. Remove `sessionId` state (no longer needed until "Complete")
2. Add `relocationData` state to store all scanned data
3. Update all scan handlers to update `relocationData` instead of calling API

### Step 2: Remove Session Start Call

1. Find where user clicks "New..." button
2. Remove `POST /api/relocation/session/start` API call
3. Just set `mode` in `relocationData` state
4. Navigate to first scan screen

### Step 3: Remove Session Update Calls

1. Find all `PUT /api/relocation/session/:id/from` calls
2. Remove API call, just update `relocationData.from_bin` / `from_carton`
3. Find all `PUT /api/relocation/session/:id/to` calls
4. Remove API call, just update `relocationData.to_bin` / `to_carton`

### Step 4: Update Complete Handler

1. Find where "Complete" button is clicked
2. Change from `POST /api/relocation/session/:id/commit-full` to `POST /api/relocation/complete-full`
3. Change request body to include ALL `relocationData` fields
4. Update response handling (session_id is now in response)

---

## Code Examples

### Example: Full Component Refactor

**Before:**

```typescript
// ❌ OLD APPROACH
const [sessionId, setSessionId] = useState<string | null>(null);

const handleStart = async () => {
  const res = await api.post("/api/relocation/session/start", {
    mode,
    warehouse_id,
    user_id,
  });
  setSessionId(res.data.session_id);
};

const handleScanFromBin = async (bin: string) => {
  await api.put(`/api/relocation/session/${sessionId}/from`, { from_bin: bin });
};

const handleComplete = async () => {
  await api.post(`/api/relocation/session/${sessionId}/commit-full`, {
    policy,
  });
};
```

**After:**

```typescript
// ✅ NEW APPROACH
const [relocationData, setRelocationData] = useState({
  mode: null,
  warehouse_id: null,
  from_bin: null,
  from_carton: null,
  to_bin: null,
  to_carton: null,
});

const handleStart = (mode: string) => {
  // NO API call - just set mode
  setRelocationData({ ...relocationData, mode, warehouse_id: "WH-MAIN" });
};

const handleScanFromBin = (bin: string) => {
  // NO API call - just update state
  setRelocationData({ ...relocationData, from_bin: bin });
};

const handleComplete = async () => {
  // NEW: Call complete endpoint with ALL data
  const res = await api.post("/api/relocation/complete-full", {
    ...relocationData,
    user_id: currentUser.id,
  });
  // res.data.session_id is now created
};
```

---

## Benefits

1. ✅ **No IN_PROGRESS sessions**: Session only created when user completes
2. ✅ **Cleaner state**: All data stored locally until complete
3. ✅ **Atomic operation**: Session creation + commit in one transaction
4. ✅ **Better UX**: No network calls during scanning (faster, works offline)
5. ✅ **Simpler code**: No need to track session_id across screens

---

## Validation Notes

### Frontend Validation (Still Recommended):

- ✅ Validate required fields before calling complete endpoint
- ✅ Show validation errors to user before API call
- ✅ Disable "Complete" button until all required fields are set

### Backend Validation (Still Enforced):

- ✅ Backend still validates all fields
- ✅ Backend still validates carton/bin location match (if both provided)
- ✅ If validation fails, session is NOT created (transaction rolls back)

---

## Backward Compatibility

**Old endpoints still work** (for gradual migration):

- Mobile apps can migrate one by one
- Old workflow: Use `/session/start` + `/session/:id/from` + `/session/:id/to` + `/session/:id/commit-full`
- New workflow: Use `/complete-full` or `/complete-partial`

**Desktop app should migrate immediately** to use new endpoints.

---

## Testing Checklist

- [ ] Remove `/api/relocation/session/start` call when user clicks "New..."
- [ ] Remove `/api/relocation/session/:id/from` call when scanning FROM location
- [ ] Remove `/api/relocation/session/:id/to` call when scanning TO location
- [ ] Store all scanned data in component state
- [ ] Call `/api/relocation/complete-full` when user clicks "Complete" (full carton)
- [ ] Call `/api/relocation/complete-partial` when user clicks "Complete" (partial)
- [ ] Verify session is created with status `COMPLETED` (not `IN_PROGRESS`)
- [ ] Verify session_id is returned in response
- [ ] Handle validation errors (carton not found, bin mismatch, etc.)
- [ ] Test offline scenarios (store data locally, sync when complete)

---

**Status:** ⚠️ **REQUIRED CHANGES FOR MOBILE APP**

All mobile app relocation screens need to be updated to:

1. ❌ Remove session start API call
2. ❌ Remove session update API calls
3. ✅ Store data locally in component state
4. ✅ Call new complete endpoints when user clicks "Complete"
