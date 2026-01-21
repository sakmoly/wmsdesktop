# Mobile App: ASN Putaway - Use box_id Instead of tc_id

**Date**: 2026-01-19  
**Status**: ⚠️ **CRITICAL CHANGE REQUIRED**

---

## Problem

**Error Message:**
```
ERROR: Transfer carton PAW-ASN365425473-1768829978799 not found. 
Carton must be created during receiving before putaway.
```

**Root Cause:**
- Mobile app is sending `tc_id` (transfer carton ID) for ASN putaway
- But for ASN putaway, you should send `box_id` (sort box ID) instead
- The ID `PAW-ASN365425473-1768829978799` is a **box_id** from sorting, not a `tc_id` from receiving

---

## Solution

### For ASN Putaway: Use `box_id` (NOT `tc_id`)

**Why?**
- ASN items are sorted into boxes during the sorting process
- These boxes are stored in `tabSortBox` table
- For putaway, you need to scan the **box ID** (not transfer carton ID)
- Transfer cartons (`tc_id`) are only created when boxes are packed for dispatch

**Workflow:**
1. **Receiving** → Items received (creates inbound records)
2. **Sorting** → Items sorted into boxes → **Box IDs created** (`tabSortBox`)
3. **Putaway** → Scan **box ID** (from sorting) → Put items away
4. **Packing** → Boxes packed into transfer cartons → **Transfer carton IDs created** (`tabTransferCarton`)

---

## Mobile App Changes Required

### ❌ OLD (WRONG):
```typescript
// User scans: "PAW-ASN365425473-1768829978799"
const handleScan = async (scannedId: string) => {
  const response = await apiService.post("/api/putaway/scan-transfer-carton", {
    tc_id: scannedId,  // ❌ WRONG: This is a box_id, not tc_id
    location_id: locationId,
    user_id: currentUser.id,
  });
};
```

### ✅ NEW (CORRECT):
```typescript
// User scans: "PAW-ASN365425473-1768829978799" (this is a box_id from sorting)
const handleScanBox = async (boxId: string) => {
  const response = await apiService.post("/api/putaway/scan-transfer-carton", {
    box_id: boxId,     // ✅ CORRECT: Send as box_id for ASN putaway
    tc_id: null,       // Don't send tc_id for ASN putaway
    location_id: locationId,
    user_id: currentUser.id,
  });
};
```

---

## How to Determine: ASN Putaway vs Transfer In Putaway

### Option 1: Check the ID Format
- **ASN Putaway**: ID starts with `PAW-ASN` or contains `ASN` → Use `box_id`
- **Transfer In Putaway**: ID starts with `CTN-TI-` or `TI-` → Use `tc_id`

### Option 2: Check Context/Screen
- **If user is on "ASN Putaway" screen** → Use `box_id`
- **If user is on "Transfer In Putaway" screen** → Use `tc_id`

### Option 3: Check API Response
- After validation, check `validated.putaway_type`:
  - `"ASN"` → You should have used `box_id`
  - `"TRANSFER_IN"` → You should have used `tc_id`

---

## Updated API Request Examples

### ASN Putaway (Use box_id):
```json
{
  "box_id": "PAW-ASN365425473-1768829978799",  // ✅ Box ID from sorting
  "tc_id": null,                                 // ❌ Don't send tc_id
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-187561"
}
```

### ASN Putaway (Both provided - if you have both):
```json
{
  "box_id": "PAW-ASN365425473-1768829978799",  // ✅ Required: Box ID
  "tc_id": "TC-1766952896460",                  // Optional: If transfer carton exists
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-187561"
}
```

### Transfer In Putaway (Use tc_id):
```json
{
  "tc_id": "CTN-TI-0001-20260116-161713-261",  // ✅ Transfer carton from receiving
  "box_id": null,                               // ⚠️ Not required for Transfer In
  "location_id": "A1-R02-L1-B2",
  "user_id": "USER-187561"
}
```

---

## API Response

### Success Response (ASN Putaway with box_id):
```json
{
  "ok": true,
  "message": "Validation successful",
  "validated": {
    "carton_id": null,                           // null because you sent box_id
    "box_id": "PAW-ASN365425473-1768829978799",  // ✅ Your box_id
    "location_id": "A1-R02-L1-B2",
    "location": {
      "location_id": "A1-R02-L1-B2",
      "zone": "A1",
      "rack": "Rack 02",
      "level": "L1",
      "bin": "B2"
    },
    "putaway_type": "ASN"  // ✅ Indicates ASN putaway
  },
  "ready_for_completion": true
}
```

---

## Error Handling

### CARTON_NOT_FOUND Error:
**If you see this error:**
```
ERROR: Transfer carton PAW-ASN365425473-1768829978799 not found.
```

**Solution:**
- ✅ **Change `tc_id` to `box_id`** in your request
- The ID `PAW-ASN365425473-1768829978799` is a box ID, not a transfer carton ID
- For ASN putaway, always use `box_id` (from sorting process)

**Updated Code:**
```typescript
// ❌ OLD: Causing CARTON_NOT_FOUND error
const response = await apiService.post("/api/putaway/scan-transfer-carton", {
  tc_id: "PAW-ASN365425473-1768829978799",  // ❌ Wrong field
  location_id: locationId,
});

// ✅ NEW: Use box_id instead
const response = await apiService.post("/api/putaway/scan-transfer-carton", {
  box_id: "PAW-ASN365425473-1768829978799",  // ✅ Correct field
  location_id: locationId,
});
```

---

## Complete Mobile App Implementation

### Step 1: Determine Putaway Type

```typescript
// Check if this is ASN or Transfer In putaway
const isAsnPutaway = () => {
  // Option 1: Check current screen/route
  if (currentRoute === 'ASN_PUTAWAY') return true;
  if (currentRoute === 'TRANSFER_IN_PUTAWAY') return false;
  
  // Option 2: Check scanned ID format
  const scannedId = getScannedId();
  if (scannedId.includes('ASN') || scannedId.startsWith('PAW-ASN')) {
    return true;  // ASN putaway - use box_id
  }
  if (scannedId.startsWith('CTN-TI-') || scannedId.startsWith('TI-')) {
    return false;  // Transfer In - use tc_id
  }
  
  // Default: Assume ASN if uncertain
  return true;
};
```

### Step 2: Handle Scan Based on Type

```typescript
const handleScan = async (scannedId: string) => {
  const asnPutaway = isAsnPutaway();
  
  try {
    const requestBody: any = {
      location_id: locationId,
      user_id: currentUser.id,
    };
    
    if (asnPutaway) {
      // ASN Putaway: Use box_id
      requestBody.box_id = scannedId;
      requestBody.tc_id = null;
    } else {
      // Transfer In Putaway: Use tc_id
      requestBody.tc_id = scannedId;
      requestBody.box_id = null;
    }
    
    const response = await apiService.post(
      "/api/putaway/scan-transfer-carton",
      requestBody
    );
    
    if (response.data.ok && response.data.validated) {
      setValidatedData(response.data.validated);
      
      // Check putaway_type in response to confirm
      if (response.data.validated.putaway_type === "ASN" && !asnPutaway) {
        Alert.alert("Warning", "Detected ASN putaway. Using box_id instead of tc_id.");
      }
      
      if (response.data.ready_for_completion) {
        setIsReadyForCompletion(true);
      }
      
      Alert.alert("Success", "Validation successful");
    }
  } catch (error: any) {
    if (error.response?.data?.error?.code === "CARTON_NOT_FOUND") {
      // If CARTON_NOT_FOUND, suggest using box_id instead
      Alert.alert(
        "Error",
        "Transfer carton not found. For ASN putaway, please scan the box ID (from sorting process) instead.",
        [
          {
            text: "Use Box ID",
            onPress: () => handleScanAsBox(scannedId),  // Retry with box_id
          },
          { text: "OK", style: "cancel" },
        ]
      );
    } else if (error.response?.data?.error?.code === "BOX_NOT_FOUND") {
      Alert.alert("Error", error.response.data.error.message);
    } else {
      Alert.alert("Error", "Failed to validate");
    }
  }
};

// Helper: Retry with box_id
const handleScanAsBox = async (boxId: string) => {
  const response = await apiService.post("/api/putaway/scan-transfer-carton", {
    box_id: boxId,  // ✅ Use box_id
    tc_id: null,
    location_id: locationId,
    user_id: currentUser.id,
  });
  // ... handle response
};
```

---

## Summary

### Key Changes:
1. ✅ **For ASN Putaway**: Use `box_id` (from `tabSortBox`) - NOT `tc_id`
2. ✅ **For Transfer In Putaway**: Use `tc_id` (from `tabTransferCarton`)
3. ✅ **Check `putaway_type` in response** to confirm the type
4. ✅ **Handle CARTON_NOT_FOUND error** by suggesting to use `box_id` instead

### Why This Error Occurs:
- Mobile app is sending `tc_id` for ASN putaway
- But ASN putaway requires `box_id` (from sorting process)
- The ID `PAW-ASN365425473-1768829978799` is a box ID, not a transfer carton ID

### Fix:
- Change request from `tc_id` to `box_id` for ASN putaway
- The backend will validate `box_id` from `tabSortBox` table

---

**Status**: ⚠️ **MOBILE APP MUST BE UPDATED**

The mobile app needs to:
1. ✅ Use `box_id` instead of `tc_id` for ASN putaway
2. ✅ Use `tc_id` for Transfer In putaway
3. ✅ Handle CARTON_NOT_FOUND by suggesting to use `box_id`
