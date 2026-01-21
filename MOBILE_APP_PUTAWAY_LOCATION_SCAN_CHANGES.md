# Mobile App Putaway Location Scan - Required Changes

**Date**: 2026-01-20  
**Status**: 📋 **REQUIRED CHANGES FOR MOBILE APP**

---

## 🎯 Overview

The mobile app needs to be updated to:
1. **Show Location ID in TextBox** before submission
2. **Require Submit Button** before processing
3. **Use New Putaway API** instead of event-based tracking
4. **Fix Box ID Format** (use `CTN-TI-*` instead of `TI-PUT-*`)

---

## 📋 Change 1: Location ID TextBox Display

### Current Behavior ❌
- Location ID is scanned but not shown in UI
- Processing happens immediately on scan

### Required Behavior ✅
- Show Location ID in a **TextBox** immediately after scanning
- TextBox should be **editable** (user can correct if wrong)
- **No processing** until user clicks Submit button

### Implementation

**Screen**: Putaway Detail Screen (Step 12: Scan Location)

**UI Changes**:
```typescript
// Add TextBox for Location ID
<View style={styles.locationInputContainer}>
  <Text style={styles.label}>Location ID:</Text>
  <TextInput
    ref={locationInputRef}
    style={styles.locationInput}
    value={scannedLocationId}
    onChangeText={setScannedLocationId}
    placeholder="Scan or enter Location ID"
    editable={true}
    autoFocus={false}
    onSubmitEditing={() => {
      // Don't auto-submit - just focus next field or show submit button
      submitButtonRef.current?.focus();
    }}
  />
  {scannedLocationId && (
    <Text style={styles.locationPreview}>
      Location: {scannedLocationId}
    </Text>
  )}
</View>

// Add Submit Button (disabled until location is entered)
<Button
  ref={submitButtonRef}
  title="Submit Location"
  onPress={handleSubmitLocation}
  disabled={!scannedLocationId || isSubmitting}
  style={styles.submitButton}
/>
```

**State Management**:
```typescript
const [scannedLocationId, setScannedLocationId] = useState<string>('');
const [isSubmitting, setIsSubmitting] = useState(false);
const locationInputRef = useRef<TextInput>(null);
const submitButtonRef = useRef<Button>(null);

// Handle barcode scan
const handleBarcodeScan = (barcode: string) => {
  // Just populate the TextBox - don't process yet
  setScannedLocationId(barcode);
  // Optionally focus the submit button
  setTimeout(() => submitButtonRef.current?.focus(), 100);
};
```

---

## 📋 Change 2: Submit Button Required

### Current Behavior ❌
- Location is processed immediately on scan
- No confirmation before processing

### Required Behavior ✅
- User must **explicitly click "Submit Location"** button
- Show confirmation dialog before processing
- Only then call the API

### Implementation

**Submit Handler**:
```typescript
const handleSubmitLocation = async () => {
  if (!scannedLocationId || !putawayTaskId) {
    Alert.alert('Error', 'Please scan a location ID');
    return;
  }

  // Show confirmation
  Alert.alert(
    'Confirm Location',
    `Assign Location ID "${scannedLocationId}" to Putaway Task "${putawayTaskId}"?\n\nThis will update all items in this task.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit',
        onPress: async () => {
          await processLocationSubmission();
        },
      },
    ]
  );
};

const processLocationSubmission = async () => {
  setIsSubmitting(true);
  try {
    // Call new API endpoint (see Change 3)
    const response = await apiService.post('/api/putaway/scan-transfer-carton', {
      putaway_task: putawayTaskId,
      location_id: scannedLocationId.trim(),
      user_id: currentUser.id,
    });

    if (response.data.ok) {
      Alert.alert(
        'Success',
        `Location ID "${scannedLocationId}" assigned to all items in putaway task.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate back or refresh list
              navigation.goBack();
            },
          },
        ]
      );
    } else {
      Alert.alert('Error', response.data.error?.message || 'Failed to update location');
    }
  } catch (error: any) {
    Alert.alert('Error', error.response?.data?.error?.message || error.message);
  } finally {
    setIsSubmitting(false);
  }
};
```

---

## 📋 Change 3: Use New Putaway API (Not Event-Based)

### Current Behavior ❌
- Uses event-based tracking (`PUTAWAY_TO_RACK` events)
- Shows message: "Backend putaway API not available. Using event-based tracking."

### Required Behavior ✅
- Use **direct API call**: `POST /api/putaway/scan-transfer-carton`
- Remove event-based tracking for location updates
- Show proper success/error messages

### Implementation

**API Call**:
```typescript
// OLD WAY (Event-Based) - REMOVE THIS ❌
const sendPutawayEvent = async (locationId: string) => {
  await apiService.post('/api/events', {
    event_type: 'PUTAWAY_TO_RACK',
    location_id: locationId,
    // ... other fields
  });
};

// NEW WAY (Direct API) - USE THIS ✅
const updatePutawayLocation = async (
  putawayTaskId: string,
  locationId: string,
  userId: string
) => {
  const response = await apiService.post('/api/putaway/scan-transfer-carton', {
    putaway_task: putawayTaskId,
    location_id: locationId,
    user_id: userId,
  });

  return response.data;
};
```

**API Endpoint**: `POST /api/putaway/scan-transfer-carton`

**Request Body**:
```json
{
  "putaway_task": "PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-001"
}
```

**Success Response**:
```json
{
  "ok": true,
  "message": "Location ID 'A1-R02-L1-B2' assigned to all items in putaway task PUT-20260120-0001",
  "data": {
    "putaway_task": "PUT-20260120-0001",
    "location_id": "A1-R02-L1-B2",
    "rack": "A1-R02-L1",
    "bin": "B2",
    "items_count": 2,
    "items": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "carton_id": "CTN-TI-123457-20260120-205044-502",
        "qty": 2.0,
        "rack": "A1-R02-L1",
        "bin": "B2",
        "location_id": "A1-R02-L1-B2"
      }
    ]
  }
}
```

**Error Response**:
```json
{
  "ok": false,
  "error": {
    "code": "LOCATION_NOT_FOUND",
    "message": "Location ID \"A1-R02-L1-B2\" not found or not available"
  }
}
```

---

## 📋 Change 4: Fix Box ID Format

### Current Behavior ❌
- Shows `TI-PUT-20260120-0001` (putaway task title)
- Should show `CTN-TI-123457-20260120-205044-502` (carton ID)

### Required Behavior ✅
- Use **carton ID** as box ID (format: `CTN-TI-{transfer_in}-{date}-{time}-{random}`)
- Get box ID from validation API response
- Display correct box ID in UI

### Implementation

**Get Box ID from Validation**:
```typescript
// When validating carton for Transfer In Putaway
const validateCarton = async (transferInTitle: string, cartonId: string) => {
  const response = await apiService.post(
    `/api/transfer-in/${transferInTitle}/validate-carton`,
    {
      carton_id: cartonId, // For Transfer In, carton_id = box_id
    }
  );

  if (response.data.ok) {
    const { box_id, putaway_task, ready_for_putaway } = response.data.validated;
    
    // Store box_id (this is the carton_id for Transfer In)
    setBoxId(box_id);
    setPutawayTaskId(putaway_task);
    setReadyForPutaway(ready_for_putaway);
    
    return response.data;
  }
  
  throw new Error(response.data.error?.message || 'Validation failed');
};
```

**Display Box ID in UI**:
```typescript
// Show correct box ID (not putaway task title)
<Text style={styles.boxIdLabel}>Box ID:</Text>
<Text style={styles.boxIdValue}>
  {boxId || 'Not available'} {/* e.g., CTN-TI-123457-20260120-205044-502 */}
</Text>

// Don't show putaway task title as box ID
// ❌ WRONG: {putawayTaskId} (e.g., TI-PUT-20260120-0001)
// ✅ CORRECT: {boxId} (e.g., CTN-TI-123457-20260120-205044-502)
```

**When Scanning for Putaway**:
```typescript
// For Transfer In Putaway, use box_id (carton_id) when calling scan API
const scanForPutaway = async (boxId: string, locationId: string) => {
  // For Transfer In: box_id = carton_id (CTN-TI-*)
  const response = await apiService.post('/api/putaway/scan-transfer-carton', {
    box_id: boxId, // Use box_id (CTN-TI-*), NOT putaway_task (TI-PUT-*)
    location_id: locationId,
    user_id: currentUser.id,
  });
  
  return response.data;
};
```

---

## 📋 Change 5: Update Putaway List Display

### Current Behavior ❌
- Shows putaway task title (`TI-PUT-20260120-0001`) in list
- Should show box ID (`CTN-TI-123457-20260120-205044-502`)

### Required Behavior ✅
- Show **box_id** (carton ID) in putaway list
- Show putaway task title separately (for reference)

### Implementation

**Putaway List Item**:
```typescript
<View style={styles.putawayListItem}>
  <Text style={styles.boxId}>
    Box: {item.box_id} {/* CTN-TI-123457-20260120-205044-502 */}
  </Text>
  <Text style={styles.taskId}>
    Task: {item.putaway_task} {/* PUT-20260120-0001 */}
  </Text>
  <Text style={styles.locationId}>
    Location: {item.location_id || 'TBD'}
  </Text>
</View>
```

**Fetch Putaway List**:
```typescript
const fetchPutawayList = async () => {
  const response = await apiService.get('/api/putaway/tasks');
  
  // Transform response to show box_id
  const items = response.data.tasks.map((task: any) => ({
    putaway_task: task.title,
    box_id: task.box_id || task.carton_id, // Use box_id if available
    location_id: task.location_id,
    status: task.status,
  }));
  
  setPutawayList(items);
};
```

---

## 📋 Change 6: Remove Event-Based Tracking Message

### Current Behavior ❌
- Shows: "Note: Backend putaway API not available. Using event-based tracking."

### Required Behavior ✅
- Remove this message
- Show proper success message from API response

### Implementation

**Success Message**:
```typescript
// OLD - Remove this ❌
Alert.alert(
  'Success',
  'Putaway box placed at Location ID: ...\n\nNote: Backend putaway API not available. Using event-based tracking.'
);

// NEW - Use this ✅
Alert.alert(
  'Success',
  response.data.message || `Location ID "${locationId}" assigned to all items in putaway task.`,
  [
    {
      text: 'OK',
      onPress: () => {
        // Remove item from list or refresh
        removeFromPutawayList(boxId);
        navigation.goBack();
      },
    },
  ]
);
```

---

## 📋 Summary of All Changes

### 1. ✅ Location ID TextBox
- Add TextBox to display scanned location
- Make it editable
- Don't process on scan

### 2. ✅ Submit Button
- Add "Submit Location" button
- Require explicit click before processing
- Show confirmation dialog

### 3. ✅ Use New API
- Replace event-based tracking with `POST /api/putaway/scan-transfer-carton`
- Remove `PUTAWAY_TO_RACK` event sending for location updates

### 4. ✅ Fix Box ID Format
- Use `CTN-TI-*` (carton ID) instead of `TI-PUT-*` (putaway task title)
- Get box_id from validation API response

### 5. ✅ Update Putaway List
- Show box_id (carton ID) in list
- Show putaway task title separately

### 6. ✅ Remove Event Message
- Remove "Backend putaway API not available" message
- Show proper API success message

---

## 🧪 Testing Checklist

- [ ] Location ID appears in TextBox after scanning
- [ ] TextBox is editable (can correct location)
- [ ] Submit button is disabled until location is entered
- [ ] Confirmation dialog appears before processing
- [ ] API call uses `POST /api/putaway/scan-transfer-carton`
- [ ] Box ID shows as `CTN-TI-*` format (not `TI-PUT-*`)
- [ ] Putaway list shows box_id (carton ID)
- [ ] Success message comes from API response
- [ ] No event-based tracking message shown
- [ ] Error messages are displayed correctly

---

## 📝 API Reference

### Validate Carton (Transfer In)
**Endpoint**: `POST /api/transfer-in/:title/validate-carton`  
**Request**:
```json
{
  "carton_id": "CTN-TI-123457-20260120-205044-502"
}
```
**Response**:
```json
{
  "ok": true,
  "validated": {
    "carton_id": "CTN-TI-123457-20260120-205044-502",
    "box_id": "CTN-TI-123457-20260120-205044-502",
    "putaway_task": "PUT-20260120-0001",
    "ready_for_putaway": true
  }
}
```

### Update Putaway Location
**Endpoint**: `POST /api/putaway/scan-transfer-carton`  
**Request**:
```json
{
  "putaway_task": "PUT-20260120-0001",
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-001"
}
```
**Response**:
```json
{
  "ok": true,
  "message": "Location ID 'A1-R02-L1-B2' assigned to all items",
  "data": {
    "putaway_task": "PUT-20260120-0001",
    "location_id": "A1-R02-L1-B2",
    "items_count": 2
  }
}
```

---

**END**
