# Mobile App: Putaway Scan Validation Changes

**Date**: 2026-01-19  
**Status**: ⚠️ **REQUIRED CHANGES**

---

## Business Rule

**Putaway scan step should ONLY validate - NO automatic creation.**

**Current Flow (WRONG):**
1. User scans Carton ID → Calls `/api/putaway/scan-transfer-carton` → **Auto-creates transfer carton, putaway task, and putaway lines** ❌
2. User scans Location ID → Updates putaway task with location
3. User clicks "Complete" → Calls `/api/putaway/complete` → Updates stock

**Required Flow (CORRECT):**
1. User scans Carton ID → Calls `/api/putaway/scan-transfer-carton` → **ONLY validates carton exists** ✅
2. User scans Location ID → **ONLY validates location exists** ✅
3. **"Complete" button enabled** after both validations succeed ✅
4. User clicks "Complete" → Calls `/api/putaway/complete` → **Creates everything + updates stock** ✅

---

## API Endpoint Changes

### POST /api/putaway/scan-transfer-carton

**NEW Behavior (Validation-Only):**

The endpoint now **ONLY validates** - it does NOT create any database records.

**Request (ASN Putaway - Use box_id):**
```json
{
  "tc_id": null,  // ⚠️ For ASN putaway, use box_id instead
  "box_id": "PAW-ASN365425473-1768829978799",  // ✅ Box ID from sorting process
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-187561"
}
```

**Request (ASN Putaway - Both provided):**
```json
{
  "tc_id": "PAW-ASN365425473-1768828214946",  // Optional: if transfer carton exists
  "box_id": "PAW-ASN365425473-1768829978799",  // ✅ Required: Box ID from sorting
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-187561"
}
```

**Request (Transfer In Putaway - Use tc_id):**
```json
{
  "tc_id": "CTN-TI-0001-20260116-161713-261",  // ✅ Transfer carton from receiving
  "box_id": null,  // ⚠️ Not required for Transfer In
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-187561"
}
```

**Response (Success - Validation Passed):**
```json
{
  "ok": true,
  "message": "Validation successful",
  "validated": {
    "carton_id": "PAW-ASN365425473-1768828214946",
    "box_id": null,
    "location_id": "A1-R02-L1-B2",
    "location": {
      "location_id": "A1-R02-L1-B2",
      "zone": "A1",
      "aisle": null,
      "rack": "Rack 02",
      "level": "L1",
      "bin": "B2"
    }
  },
  "ready_for_completion": true
}
```

**Response (Error - Carton Not Found):**
```json
{
  "ok": false,
  "error": {
    "code": "CARTON_NOT_FOUND",
    "message": "Transfer carton PAW-ASN365425473-1768828214946 not found. Carton must be created during receiving before putaway."
  }
}
```

**Response (Error - Box Not Found - ASN Putaway):**
```json
{
  "ok": false,
  "error": {
    "code": "BOX_NOT_FOUND",
    "message": "Box PAW-ASN365425473-1768829978799 not found in tabSortBox. Box must be created during sorting before ASN putaway."
  }
}
```

**Response (Error - Location Not Found):**
```json
{
  "ok": false,
  "error": {
    "code": "LOCATION_NOT_FOUND",
    "message": "Location ID \"A1-R02-L1-B2\" not found or not available"
  }
}
```

**Response (Error - Validation Error):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "location_id is required"
  }
}
```

---

## Required Mobile App Changes

### 1. ✅ Update Scan Handler to Handle Validation Response

**File:** Putaway scan screen (e.g., `PutawayScanScreen.tsx` or similar)

**Current Code (CHANGE):**
```typescript
// ❌ OLD: Expected creation response
const handleScanCarton = async (cartonId: string) => {
  const response = await apiService.post("/api/putaway/scan-transfer-carton", {
    tc_id: cartonId,  // ❌ WRONG: For ASN putaway, this should be box_id
    user_id: currentUser.id,
  });
  
  // ❌ OLD: Expected putaway_task in response
  if (response.data.data?.putaway_task) {
    setPutawayTask(response.data.data.putaway_task);
    setCartonId(cartonId);
  }
};
```

**⚠️ IMPORTANT: For ASN Putaway, use `box_id` NOT `tc_id`**

The ID `PAW-ASN365425473-1768829978799` is a **box_id** (from sorting), not a `tc_id` (from receiving).

**New Code:**
```typescript
// ✅ NEW: Handle validation response
const [validatedData, setValidatedData] = useState<{
  carton_id: string | null;
  box_id: string | null;
  location_id: string | null;
  location: {
    location_id: string;
    zone: string | null;
    aisle: string | null;
    rack: string;
    level: string | null;
    bin: string;
  };
  putaway_type?: "ASN" | "TRANSFER_IN";  // NEW: Indicates putaway type
} | null>(null);

const [isReadyForCompletion, setIsReadyForCompletion] = useState(false);

// ✅ For ASN Putaway: Use box_id (from sorting process)
const handleScanBox = async (boxId: string) => {
  try {
    const response = await apiService.post("/api/putaway/scan-transfer-carton", {
      box_id: boxId,  // ✅ Send box_id for ASN putaway
      tc_id: null,    // Don't send tc_id for ASN putaway (unless you have it)
      user_id: currentUser.id,
    });
    
    if (response.data.ok && response.data.validated) {
      // ✅ Store validated data
      setValidatedData({
        carton_id: response.data.validated.carton_id,
        box_id: response.data.validated.box_id,
        location_id: response.data.validated.location_id,
        location: response.data.validated.location,
        putaway_type: response.data.validated.putaway_type,  // "ASN" or "TRANSFER_IN"
      });
      
      // ✅ Check if ready for completion (both box/carton and location validated)
      if (response.data.ready_for_completion && response.data.validated.location_id) {
        setIsReadyForCompletion(true);
      }
      
      // Show success message
      Alert.alert("Success", "Box validated successfully");
    }
  } catch (error: any) {
    // Handle validation errors
    if (error.response?.data?.error?.code === "BOX_NOT_FOUND") {
      Alert.alert("Error", error.response.data.error.message);
    } else if (error.response?.data?.error?.code === "CARTON_NOT_FOUND") {
      Alert.alert("Error", "For ASN putaway, please scan the box ID (from sorting), not the transfer carton ID.");
    } else {
      Alert.alert("Error", "Failed to validate box");
    }
  }
};

// ✅ For Transfer In Putaway: Use tc_id (from receiving process)
const handleScanCarton = async (cartonId: string) => {
  try {
    const response = await apiService.post("/api/putaway/scan-transfer-carton", {
      tc_id: cartonId,  // ✅ Send tc_id for Transfer In putaway
      box_id: null,     // Not required for Transfer In
      user_id: currentUser.id,
    });
    
    if (response.data.ok && response.data.validated) {
      setValidatedData({
        carton_id: response.data.validated.carton_id,
        box_id: response.data.validated.box_id,
        location_id: response.data.validated.location_id,
        location: response.data.validated.location,
        putaway_type: response.data.validated.putaway_type,
      });
      
      if (response.data.ready_for_completion && response.data.validated.location_id) {
        setIsReadyForCompletion(true);
      }
      
      Alert.alert("Success", "Carton validated successfully");
    }
  } catch (error: any) {
    if (error.response?.data?.error?.code === "CARTON_NOT_FOUND") {
      Alert.alert("Error", error.response.data.error.message);
    } else {
      Alert.alert("Error", "Failed to validate carton");
    }
  }
};
```

---

### 2. ✅ Update Location Scan Handler

**File:** Putaway location scan screen

**Current Code (CHANGE):**
```typescript
// ❌ OLD: Expected location assignment in response
const handleScanLocation = async (locationId: string) => {
  const response = await apiService.post("/api/putaway/scan-transfer-carton", {
    tc_id: validatedData?.carton_id,
    location_id: locationId,
    user_id: currentUser.id,
  });
  
  // ❌ OLD: Expected putaway_task update
  if (response.data.data?.putaway_task) {
    setLocationId(locationId);
    setLocationAssigned(true);
  }
};
```

**New Code:**
```typescript
// ✅ NEW: Validate location (requires carton to be validated first)
const handleScanLocation = async (locationId: string) => {
  if (!validatedData?.carton_id && !validatedData?.box_id) {
    Alert.alert("Error", "Please scan carton/box first");
    return;
  }
  
  try {
    const response = await apiService.post("/api/putaway/scan-transfer-carton", {
      tc_id: validatedData.carton_id,
      box_id: validatedData.box_id,
      location_id: locationId,
      user_id: currentUser.id,
    });
    
    if (response.data.ok && response.data.validated) {
      // ✅ Update validated data with location
      setValidatedData({
        ...validatedData,
        location_id: response.data.validated.location_id,
        location: response.data.validated.location,
      });
      
      // ✅ Enable Complete button
      if (response.data.ready_for_completion) {
        setIsReadyForCompletion(true);
      }
      
      Alert.alert("Success", "Location validated successfully");
    }
  } catch (error: any) {
    if (error.response?.data?.error?.code === "LOCATION_NOT_FOUND") {
      Alert.alert("Error", error.response.data.error.message);
    } else {
      Alert.alert("Error", "Failed to validate location");
    }
  }
};
```

---

### 3. ✅ Update Complete Button Handler

**File:** Putaway complete screen

**Current Code (CHANGE):**
```typescript
// ❌ OLD: May have expected putaway_task from scan step
const handleComplete = async () => {
  const response = await apiService.post("/api/putaway/complete", {
    putaway_task: putawayTask, // ❌ May not exist if scan didn't create it
    performed_by: currentUser.id,
  });
};
```

**New Code:**
```typescript
// ✅ NEW: Complete endpoint creates everything
const handleComplete = async () => {
  if (!isReadyForCompletion) {
    Alert.alert("Error", "Please validate carton and location first");
    return;
  }
  
  if (!validatedData?.carton_id && !validatedData?.box_id) {
    Alert.alert("Error", "Carton/box not validated");
    return;
  }
  
  if (!validatedData?.location_id) {
    Alert.alert("Error", "Location not validated");
    return;
  }
  
  try {
    // ✅ Send validated data to complete endpoint
    // The endpoint will create putaway task, lines, and update stock
    const response = await apiService.post("/api/putaway/complete", {
      tc_id: validatedData.carton_id,
      box_id: validatedData.box_id,
      location_id: validatedData.location_id,
      performed_by: currentUser.id,
      // Optional: Send items if you have them from carton details
      // items: cartonItems.map(item => ({
      //   item_code: item.item_code,
      //   qty: item.qty,
      //   carton_id: validatedData.carton_id,
      //   location_id: validatedData.location_id,
      // })),
    });
    
    if (response.data.ok) {
      Alert.alert("Success", "Putaway completed successfully");
      // Navigate back or reset state
      resetPutawayState();
    }
  } catch (error: any) {
    Alert.alert("Error", error.response?.data?.error?.message || "Failed to complete putaway");
  }
};
```

---

### 4. ✅ Update UI to Show Validation State

**File:** Putaway screen component

**New Code:**
```typescript
// ✅ Show validation status in UI
<View>
  {/* Carton Validation Status */}
  {validatedData?.carton_id ? (
    <View style={styles.validatedItem}>
      <Text>✅ Carton: {validatedData.carton_id}</Text>
    </View>
  ) : (
    <View style={styles.pendingItem}>
      <Text>⏳ Scan Carton ID</Text>
    </View>
  )}
  
  {/* Location Validation Status */}
  {validatedData?.location_id ? (
    <View style={styles.validatedItem}>
      <Text>✅ Location: {validatedData.location_id}</Text>
      <Text>   Rack: {validatedData.location.rack}</Text>
      <Text>   Bin: {validatedData.location.bin}</Text>
    </View>
  ) : (
    <View style={styles.pendingItem}>
      <Text>⏳ Scan Location ID</Text>
    </View>
  )}
  
  {/* Complete Button - Only enabled when ready */}
  <Button
    title="Complete Putaway"
    onPress={handleComplete}
    disabled={!isReadyForCompletion}
    style={[
      styles.completeButton,
      !isReadyForCompletion && styles.completeButtonDisabled
    ]}
  />
</View>
```

---

## Complete Workflow Example

### Step 1: User Scans Carton ID

**Mobile App Action:**
```typescript
// User scans: "PAW-ASN365425473-1768828214946"
handleScanCarton("PAW-ASN365425473-1768828214946");
```

**API Call:**
```http
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "PAW-ASN365425473-1768828214946",
  "user_id": "USER-187561"
}
```

**Response:**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "location_id is required"
  }
}
```

**Mobile App Action:**
- Show error: "Please scan location ID"
- Keep carton ID in state
- Wait for location scan

---

### Step 2: User Scans Location ID

**Mobile App Action:**
```typescript
// User scans: "A1-R02-L1-B2"
handleScanLocation("A1-R02-L1-B2");
```

**API Call:**
```http
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "PAW-ASN365425473-1768828214946",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-187561"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Validation successful",
  "validated": {
    "carton_id": "PAW-ASN365425473-1768828214946",
    "box_id": null,
    "location_id": "A1-R02-L1-B2",
    "location": {
      "location_id": "A1-R02-L1-B2",
      "zone": "A1",
      "rack": "Rack 02",
      "level": "L1",
      "bin": "B2"
    }
  },
  "ready_for_completion": true
}
```

**Mobile App Action:**
- ✅ Show success: "Validation successful"
- ✅ Store validated data
- ✅ Enable "Complete" button
- ✅ Display location details (rack, bin, zone)

---

### Step 3: User Clicks "Complete" Button

**Mobile App Action:**
```typescript
handleComplete();
```

**API Call:**
```http
POST /api/putaway/complete
{
  "tc_id": "PAW-ASN365425473-1768828214946",
  "location_id": "A1-R02-L1-B2",
  "performed_by": "USER-187561"
}
```

**Backend Processing:**
1. ✅ Creates putaway task (if not exists)
2. ✅ Creates putaway lines for all items in carton
3. ✅ Updates stock ledger
4. ✅ Updates carton stock
5. ✅ Creates stock transaction history
6. ✅ Updates item stock quantities
7. ✅ Marks task as "Completed"

**Response:**
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20260119-0002",
    "status": "Completed",
    "items_processed": 1,
    "stock_updated": true
  }
}
```

**Mobile App Action:**
- ✅ Show success message
- ✅ Navigate back to putaway list
- ✅ Refresh putaway tasks list

---

## State Management

### Recommended State Structure:

```typescript
interface PutawayValidationState {
  // Validated data
  validatedData: {
    carton_id: string | null;
    box_id: string | null;
    location_id: string | null;
    location: {
      location_id: string;
      zone: string | null;
      aisle: string | null;
      rack: string;
      level: string | null;
      bin: string;
    };
  } | null;
  
  // UI state
  isReadyForCompletion: boolean;
  isScanningCarton: boolean;
  isScanningLocation: boolean;
  isCompleting: boolean;
  
  // Error state
  validationError: string | null;
}

// In your component:
const [putawayState, setPutawayState] = useState<PutawayValidationState>({
  validatedData: null,
  isReadyForCompletion: false,
  isScanningCarton: false,
  isScanningLocation: false,
  isCompleting: false,
  validationError: null,
});
```

---

## Error Handling

### Validation Errors:

1. **CARTON_NOT_FOUND**
   - **Message**: "Transfer carton {tc_id} not found. Carton must be created during receiving before putaway."
   - **Action**: Show error, allow user to scan again or go back

2. **BOX_NOT_FOUND**
   - **Message**: "Box {box_id} not found. Box must be created before putaway."
   - **Action**: Show error, allow user to scan again

3. **LOCATION_NOT_FOUND**
   - **Message**: "Location ID \"{location_id}\" not found or not available"
   - **Action**: Show error, allow user to scan location again

4. **VALIDATION_ERROR**
   - **Message**: "location_id is required" or "Either tc_id (carton_id) or box_id is required"
   - **Action**: Show error, guide user to scan required field

5. **DATABASE_ERROR**
   - **Message**: "Failed to validate transfer carton for putaway"
   - **Action**: Show error, allow retry

---

## Migration Checklist

- [ ] Update `handleScanCarton` to handle validation response (not creation response)
- [ ] Update `handleScanLocation` to validate location (requires carton validated first)
- [ ] Add `validatedData` state to store validation results
- [ ] Add `isReadyForCompletion` state to control Complete button
- [ ] Update Complete button to be disabled until `isReadyForCompletion === true`
- [ ] Update `handleComplete` to send validated data to `/api/putaway/complete`
- [ ] Update UI to show validation status (✅ Carton validated, ✅ Location validated)
- [ ] Handle all error codes (CARTON_NOT_FOUND, LOCATION_NOT_FOUND, VALIDATION_ERROR)
- [ ] Remove any code that expects `putaway_task` from scan response
- [ ] Test workflow: Scan Carton → Scan Location → Complete
- [ ] Test error scenarios: Invalid carton, invalid location, missing fields

---

## Benefits

1. ✅ **No Auto-Creation**: Nothing created until user clicks "Complete"
2. ✅ **Clear Validation**: User knows exactly what was validated
3. ✅ **Better UX**: Complete button only enabled when ready
4. ✅ **Atomic Operations**: All creation happens in one transaction on Complete
5. ✅ **Error Prevention**: Validation errors caught before completion
6. ✅ **Offline Support**: Can validate multiple items before completing (if storing locally)

---

## Backward Compatibility

**Old behavior (auto-creation) is REMOVED** - mobile app MUST be updated to handle validation-only response.

**Breaking Changes:**
- ❌ `scan-transfer-carton` no longer returns `putaway_task` in response
- ❌ `scan-transfer-carton` no longer creates any database records
- ✅ `complete` endpoint still works the same way (creates everything)

---

**Status:** ⚠️ **REQUIRED CHANGES FOR MOBILE APP**

All mobile app putaway screens need to be updated to:
1. ❌ Remove expectation of `putaway_task` from scan response
2. ✅ Handle validation-only response from `scan-transfer-carton`
3. ✅ Enable Complete button only when `ready_for_completion === true`
4. ✅ Send validated data to `complete` endpoint
5. ✅ Handle duplicate entry errors gracefully (idempotency)

---

## Important: Duplicate Entry Error Handling

### Problem:
If the mobile app calls `/api/putaway/complete` multiple times (e.g., due to retry logic or user double-clicking), you may see:
```
ERROR: Duplicate entry 'PAW-ASN365425473-1768828214946' for key 'PRIMARY'
```

### Solution:
The backend now handles duplicate entry errors gracefully. If a putaway task is already completed, the endpoint returns success (idempotent behavior).

**Mobile App Should:**
1. ✅ **Disable Complete button after first successful call** - Prevent multiple submissions
2. ✅ **Handle 409 Conflict response** - If duplicate entry error occurs, check task status
3. ✅ **Show appropriate message** - "Putaway already completed" instead of error
4. ✅ **Don't retry on duplicate entry** - Treat as success, not error

**Example Error Handling:**
```typescript
const handleComplete = async () => {
  try {
    // Disable button immediately to prevent double-click
    setIsCompleting(true);
    
    const response = await apiService.post("/api/putaway/complete", {
      tc_id: validatedData.carton_id,
      box_id: validatedData.box_id,
      location_id: validatedData.location_id,
      performed_by: currentUser.id,
    });
    
    if (response.data.ok) {
      Alert.alert("Success", "Putaway completed successfully");
      resetPutawayState();
    }
  } catch (error: any) {
    // Handle duplicate entry (idempotency)
    if (error.response?.status === 409 || 
        error.response?.data?.error?.code === "DUPLICATE_ENTRY") {
      // Check if task is already completed
      Alert.alert("Info", "Putaway may have already been completed. Please check the task status.");
      // Optionally: Refresh task status to confirm
      await refreshPutawayTaskStatus();
    } else {
      Alert.alert("Error", error.response?.data?.error?.message || "Failed to complete putaway");
    }
  } finally {
    setIsCompleting(false);
  }
};
```

---

## CARTON_NOT_FOUND Error Handling

### Problem:
If a carton hasn't been created during receiving, the scan endpoint returns:
```
ERROR: Transfer carton PAW-ASN365425473-1768829978799 not found. 
Carton must be created during receiving before putaway.
```

### Solution:
**This is EXPECTED behavior** - the carton must exist before putaway can proceed.

**Mobile App Should:**
1. ✅ **Show clear error message** - "Carton not found. Please complete receiving first."
2. ✅ **Allow user to go back** - Don't block the UI
3. ✅ **Don't retry automatically** - User needs to complete receiving first
4. ✅ **Guide user** - "Please complete receiving for this ASN before putaway"

**Example Error Handling:**
```typescript
const handleScanCarton = async (cartonId: string) => {
  try {
    const response = await apiService.post("/api/putaway/scan-transfer-carton", {
      tc_id: cartonId,
      user_id: currentUser.id,
    });
    
    if (response.data.ok && response.data.validated) {
      setValidatedData(response.data.validated);
      Alert.alert("Success", "Carton validated successfully");
    }
  } catch (error: any) {
    if (error.response?.data?.error?.code === "CARTON_NOT_FOUND") {
      Alert.alert(
        "Carton Not Found",
        "This carton hasn't been created yet. Please complete receiving for this ASN before putaway.",
        [
          { text: "Go to Receiving", onPress: () => navigateToReceiving() },
          { text: "OK", style: "cancel" }
        ]
      );
    } else {
      Alert.alert("Error", error.response?.data?.error?.message || "Failed to validate carton");
    }
  }
};
```
