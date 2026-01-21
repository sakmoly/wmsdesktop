# Mobile App: Fix "TC Has Been Removed" Message Issue

**Date**: 2026-01-19  
**Issue**: Mobile app shows "This TC has been removed from the Putaway list" after scanning location, but putaway is NOT completed (stock not updated)

---

## Problem

**Current Behavior (WRONG):**
1. User scans Box ID → Validation succeeds
2. User scans Location ID → Validation succeeds
3. **Mobile app shows "Success" dialog with message: "This TC has been removed from the Putaway list"** ❌
4. **Mobile app removes TC from putaway list** ❌
5. User clicks "Continue to Complete" button
6. **But stock, ledger, and audit trail are NOT updated** ❌

**Why This Is Wrong:**
- The TC is removed from the list **BEFORE** putaway is actually completed
- If the "Complete" button fails or is not clicked, the putaway is never completed
- User cannot retry because the TC is already removed from the list
- Stock remains at 0, ledger empty, audit trail empty

---

## Correct Behavior

**Required Behavior (CORRECT):**
1. User scans Box ID → Validation succeeds → **TC remains in list** ✅
2. User scans Location ID → Validation succeeds → **TC remains in list** ✅
3. **"Complete" button enabled** ✅
4. User clicks "Complete" → Calls `/api/putaway/complete` → **Stock updated** ✅
5. **Only after `/api/putaway/complete` returns `ok: true`** → Show success and remove TC ✅

---

## Mobile App Changes Required

### Change 1: Do NOT Remove TC After Scan Location

**Current Code (WRONG):**
```typescript
// After scanning location
const response = await scanLocation(boxId, locationId);
if (response.ok) {
  // ❌ WRONG: Remove TC from list immediately
  removeFromPutawayList(boxId);
  showSuccessDialog("This TC has been removed from the Putaway list");
}
```

**Required Code (CORRECT):**
```typescript
// After scanning location
const response = await scanLocation(boxId, locationId);
if (response.ok) {
  // ✅ CORRECT: Keep TC in list, just enable Complete button
  setLocationScanned(true);
  setCompleteButtonEnabled(true);
  showToast("Location scanned successfully. Click Complete to finish putaway.");
  // DO NOT remove TC from list yet
  // DO NOT show "TC has been removed" message
}
```

---

### Change 2: Remove TC Only After Complete Succeeds

**Required Code:**
```typescript
// When user clicks "Complete" button
async function handleCompletePutaway() {
  setLoading(true);
  try {
    const response = await completePutaway(boxId, locationId);
    
    if (response.ok && response.data?.stock_updated) {
      // ✅ CORRECT: Only now remove TC from list
      removeFromPutawayList(boxId);
      showSuccessDialog(
        `Putaway completed successfully!\n` +
        `Box ${boxId} placed at ${locationId}\n` +
        `Stock updated: ${response.data.items_updated} item(s)`
      );
      navigateBack();
    } else {
      // ❌ Keep TC in list if completion failed
      showError("Putaway completion failed. Please retry.");
      // TC remains in list for retry
    }
  } catch (error) {
    // ❌ Keep TC in list on error
    showError("Network error. Box remains in list. Please retry.");
    // TC remains in list for retry
  } finally {
    setLoading(false);
  }
}
```

---

### Change 3: Update Success Message

**Current Message (WRONG):**
```
"Putaway box PAW-XXX placed at Location ID: A1-R02-L1-B2
This TC has been removed from the Putaway list."
```

**Required Message After Scan (CORRECT):**
```
"Location scanned successfully!
Location: A1-R02-L1-B2
Click 'Complete' to finish putaway."
```

**Required Message After Complete (CORRECT):**
```
"Putaway completed successfully!
Box: PAW-XXX
Location: A1-R02-L1-B2
Stock updated: 2 item(s)
This box has been removed from the Putaway list."
```

---

## API Response Handling

### After Scan Location (POST /api/putaway/scan-transfer-carton)

**Response:**
```json
{
  "ok": true,
  "message": "Validation successful",
  "data": {
    "putaway_task": "PUT-20260119-0002",
    "status": "In Progress",
    "location_id": "A1-R02-L1-B2",
    "ready_for_completion": true
  }
}
```

**Mobile App Action:**
- ✅ Show toast: "Location validated successfully"
- ✅ Enable "Complete" button
- ✅ Keep TC in putaway list
- ❌ DO NOT remove TC from list
- ❌ DO NOT show "TC has been removed" message

---

### After Complete (POST /api/putaway/complete)

**Response (Success):**
```json
{
  "ok": true,
  "stock_updated": true,
  "items_updated": 2,
  "putaway_task": "PUT-20260119-0002",
  "to_location_id": "A1-R02-L1-B2"
}
```

**Mobile App Action:**
- ✅ Show success dialog: "Putaway completed successfully"
- ✅ Remove TC from putaway list
- ✅ Navigate back to putaway list
- ✅ Show message: "This box has been removed from the Putaway list"

**Response (Error):**
```json
{
  "ok": false,
  "error": {
    "code": "DATABASE_ERROR",
    "message": "Failed to complete putaway"
  }
}
```

**Mobile App Action:**
- ❌ Show error dialog
- ❌ Keep TC in putaway list (allow retry)
- ❌ DO NOT remove TC from list

---

## UI Flow

### Step 1: Scan Box ID
- User scans box → Validation succeeds
- **TC remains visible in list** ✅
- Show: "Box validated. Please scan location."

### Step 2: Scan Location ID
- User scans location → Validation succeeds
- **TC remains visible in list** ✅
- **"Complete" button enabled** ✅
- Show toast: "Location validated. Click Complete to finish."
- ❌ DO NOT show "TC has been removed" message
- ❌ DO NOT remove TC from list

### Step 3: Click Complete
- User clicks "Complete" button
- Call `/api/putaway/complete`
- Show loading spinner

### Step 4A: Complete Succeeds
- Response: `ok: true, stock_updated: true`
- **Remove TC from list** ✅
- Show success: "Putaway completed! Stock updated. This box has been removed from the list."
- Navigate back

### Step 4B: Complete Fails
- Response: `ok: false` or error
- **Keep TC in list** ✅
- Show error: "Putaway failed. Box remains in list. Please retry."
- Allow user to click "Complete" again

---

## Code Example

### Complete Implementation

```typescript
// PutawayScreen.tsx

interface PutawayState {
  selectedBoxId: string | null;
  scannedLocationId: string | null;
  isLocationScanned: boolean;
  isCompleting: boolean;
  putawayList: PutawayBox[];
}

function PutawayScreen() {
  const [state, setState] = useState<PutawayState>({
    selectedBoxId: null,
    scannedLocationId: null,
    isLocationScanned: false,
    isCompleting: false,
    putawayList: []
  });

  // Step 1: Scan Box ID
  async function handleScanBox(boxId: string) {
    const response = await validateBox(boxId);
    if (response.ok) {
      setState(prev => ({
        ...prev,
        selectedBoxId: boxId
      }));
      showToast("Box validated. Please scan location.");
      // ✅ Keep box in list
    }
  }

  // Step 2: Scan Location ID
  async function handleScanLocation(locationId: string) {
    if (!state.selectedBoxId) {
      showError("Please scan box first");
      return;
    }

    const response = await scanLocation(state.selectedBoxId, locationId);
    if (response.ok) {
      setState(prev => ({
        ...prev,
        scannedLocationId: locationId,
        isLocationScanned: true
      }));
      showToast("Location validated. Click Complete to finish putaway.");
      // ✅ Keep box in list
      // ❌ DO NOT remove box from list
      // ❌ DO NOT show "TC has been removed" message
    }
  }

  // Step 3: Complete Putaway
  async function handleComplete() {
    if (!state.selectedBoxId || !state.scannedLocationId) {
      showError("Please scan box and location first");
      return;
    }

    setState(prev => ({ ...prev, isCompleting: true }));

    try {
      const response = await completePutaway({
        box_id: state.selectedBoxId,
        location_id: state.scannedLocationId
      });

      if (response.ok && response.stock_updated) {
        // ✅ CORRECT: Only now remove box from list
        setState(prev => ({
          ...prev,
          putawayList: prev.putawayList.filter(
            box => box.box_id !== state.selectedBoxId
          ),
          selectedBoxId: null,
          scannedLocationId: null,
          isLocationScanned: false
        }));

        showSuccessDialog(
          `Putaway completed successfully!\n` +
          `Box: ${state.selectedBoxId}\n` +
          `Location: ${state.scannedLocationId}\n` +
          `Stock updated: ${response.items_updated} item(s)\n\n` +
          `This box has been removed from the Putaway list.`
        );

        navigateBack();
      } else {
        // ❌ Keep box in list if completion failed
        showError(
          "Putaway completion failed. Box remains in list. Please retry."
        );
      }
    } catch (error) {
      // ❌ Keep box in list on error
      showError(
        "Network error. Box remains in list. Please retry."
      );
    } finally {
      setState(prev => ({ ...prev, isCompleting: false }));
    }
  }

  return (
    <View>
      {/* Putaway List */}
      {state.putawayList.map(box => (
        <PutawayBoxItem
          key={box.box_id}
          box={box}
          onScanBox={() => handleScanBox(box.box_id)}
        />
      ))}

      {/* Location Scanner */}
      {state.selectedBoxId && (
        <LocationScanner
          onScan={handleScanLocation}
          disabled={state.isCompleting}
        />
      )}

      {/* Complete Button */}
      {state.isLocationScanned && (
        <Button
          title="Complete Putaway"
          onPress={handleComplete}
          disabled={state.isCompleting}
          loading={state.isCompleting}
        />
      )}
    </View>
  );
}
```

---

## Testing Checklist

- [ ] Scan box ID → Box remains in list
- [ ] Scan location ID → Box remains in list, Complete button enabled
- [ ] **DO NOT show "TC has been removed" message after scan**
- [ ] Click Complete → Stock updated
- [ ] **Only after Complete succeeds → Remove box from list**
- [ ] **Only after Complete succeeds → Show "box has been removed" message**
- [ ] If Complete fails → Box remains in list, can retry
- [ ] If network error → Box remains in list, can retry

---

## Summary

**The Issue:**
- Mobile app removes TC from list **too early** (after scan, not after complete)
- This prevents retry if completion fails
- Stock is never updated because complete endpoint is never called

**The Fix:**
1. ✅ **Do NOT remove TC from list after scan location**
2. ✅ **Do NOT show "TC has been removed" message after scan**
3. ✅ **Only remove TC after `/api/putaway/complete` returns `ok: true`**
4. ✅ **Only show success/removal message after complete succeeds**
5. ✅ **Keep TC in list if complete fails (allow retry)**

---

**Status**: ⚠️ **MOBILE APP UPDATE REQUIRED**

The backend is correct. The mobile app needs to be updated to:
- Keep TC in list until completion succeeds
- Only show removal message after completion
- Allow retry if completion fails
