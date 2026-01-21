# Mobile App Relocation Errors Fix

## Issues Identified

### 1. React Key Duplication Error

**Error:**

```
ERROR  Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. .$SKU-HAT-301-BLU-OS
ERROR  Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version. .$SKU-HAT-301-GRN-OS
```

**Root Cause:**
The mobile app is rendering a list of items (likely in relocation lines or carton contents) where the React `key` prop is set to just the `item_code` (e.g., `SKU-HAT-301-BLU-OS`). When the same item appears multiple times (e.g., in different cartons, different bins, or different lines), React sees duplicate keys and throws this error.

**Fix Required:**

**Location:** Mobile app relocation screen component (likely where items are rendered in a list/FlatList)

**Current Code (WRONG):**

```javascript
// ❌ Using only item_code as key - causes duplicates
{
  items.map((item) => <ItemComponent key={item.item_code} item={item} />);
}
```

**Fixed Code (CORRECT):**

```javascript
// ✅ Use unique combination of identifiers
{
  items.map((item, index) => (
    <ItemComponent
      key={`${item.item_code}-${item.carton_id || "no-carton"}-${
        item.bin_location || "no-bin"
      }-${index}`}
      item={item}
    />
  ));
}

// OR if items have unique IDs:
{
  items.map((item) => (
    <ItemComponent
      key={
        item.id || `${item.item_code}-${item.carton_id}-${item.bin_location}`
      }
      item={item}
    />
  ));
}

// OR for relocation lines specifically:
{
  lines.map((line, index) => (
    <LineComponent
      key={`${line.item_code}-${line.session_id}-${line.line_id || index}`}
      line={line}
    />
  ));
}
```

**Best Practice:**

- Use a combination of fields that make the item unique in that context
- For relocation lines: `item_code + session_id + line_id` (or index if line_id not available)
- For carton contents: `item_code + carton_id + bin_location`
- Always include a fallback (index) if other fields might be null

---

### 2. API Mode Mismatch Error

**Error:**

```
ERROR  ❌ API error (400): {"code":"INVALID_MODE","message":"Session RL-20260116-492204 is not in FULL_CARTON mode"}
```

**Root Cause:**
The mobile app is calling the `commit-full` endpoint (`/api/relocation/session/:session_id/commit-full`) but the session was created in a different mode (likely `PARTIAL_ITEMS` or `CARTON_TO_CARTON`).

**Backend Validation:**

- `commit-full` endpoint **only accepts** sessions with `mode = 'FULL_CARTON'`
- `commit-partial` endpoint **only accepts** sessions with `mode = 'PARTIAL_ITEMS'` or `mode = 'CARTON_TO_CARTON'`

**Fix Required:**

**Location:** Mobile app relocation commit logic

**Current Code (WRONG):**

```javascript
// ❌ Always calling commit-full regardless of session mode
const commitRelocation = async (sessionId) => {
  const response = await fetch(
    `/api/relocation/session/${sessionId}/commit-full`,
    {
      method: "POST",
      // ...
    }
  );
};
```

**Fixed Code (CORRECT):**

```javascript
// ✅ Check session mode and call appropriate endpoint
const commitRelocation = async (sessionId, sessionMode) => {
  let endpoint;
  if (sessionMode === "FULL_CARTON") {
    endpoint = `/api/relocation/session/${sessionId}/commit-full`;
  } else if (
    sessionMode === "PARTIAL_ITEMS" ||
    sessionMode === "CARTON_TO_CARTON"
  ) {
    endpoint = `/api/relocation/session/${sessionId}/commit-partial`;
  } else {
    throw new Error(`Invalid session mode: ${sessionMode}`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    // ...
  });
};

// OR get session mode from session object:
const commitRelocation = async (session) => {
  const endpoint =
    session.mode === "FULL_CARTON"
      ? `/api/relocation/session/${session.session_id}/commit-full`
      : `/api/relocation/session/${session.session_id}/commit-partial`;

  const response = await fetch(endpoint, {
    method: "POST",
    body: JSON.stringify({
      // For commit-full: { policy, to_carton_mode }
      // For commit-partial: { lines } (optional)
    }),
    // ...
  });
};
```

**Alternative:** If session mode is not available in the component, fetch it first:

```javascript
const commitRelocation = async (sessionId) => {
  // First, get session details to check mode
  const sessionResponse = await fetch(`/api/relocation/session/${sessionId}`);
  const session = await sessionResponse.json();

  // Then call appropriate endpoint
  const endpoint =
    session.data.mode === "FULL_CARTON"
      ? `/api/relocation/session/${sessionId}/commit-full`
      : `/api/relocation/session/${sessionId}/commit-partial`;

  const response = await fetch(endpoint, {
    method: "POST",
    // ...
  });
};
```

---

## Backend Improvements

The backend error message has been improved to suggest the correct endpoint:

**Before:**

```json
{
  "code": "INVALID_MODE",
  "message": "Session RL-20260116-492204 is not in FULL_CARTON mode"
}
```

**After:**

```json
{
  "code": "INVALID_MODE",
  "message": "Session RL-20260116-492204 is not in FULL_CARTON mode (current mode: PARTIAL_ITEMS). Use /api/relocation/session/RL-20260116-492204/commit-partial endpoint for PARTIAL_ITEMS mode."
}
```

This helps developers identify the issue and know which endpoint to use.

---

## Testing Checklist

### React Key Fix

- [ ] Open relocation screen with items that have duplicate item codes
- [ ] Verify no React key warnings in console
- [ ] Verify all items render correctly (no duplicates or missing items)
- [ ] Test with items in same carton, different cartons, different bins

### API Mode Fix

- [ ] Create FULL_CARTON session → verify commit-full endpoint is called
- [ ] Create PARTIAL_ITEMS session → verify commit-partial endpoint is called
- [ ] Create CARTON_TO_CARTON session → verify commit-partial endpoint is called
- [ ] Verify error message suggests correct endpoint when wrong one is called

---

## Summary

✅ **Backend:** Error message improved to suggest correct endpoint
❌ **Mobile App:**

1. Fix React key duplication by using unique composite keys
2. Fix commit endpoint selection based on session mode

Both issues are mobile app frontend problems that need to be fixed in the React Native/React codebase.
