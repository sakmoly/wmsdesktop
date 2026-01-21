# Putaway: box_id vs tc_id Explanation

**Date**: 2026-01-19  
**Question**: Where does `box_id` come from in the API?

---

## Understanding `tc_id` vs `box_id`

### `tc_id` (Transfer Carton ID)
- **Source**: `tabTransferCarton` table
- **Created during**: Receiving process (Transfer In)
- **Used for**: ASN-based putaway
- **Example**: `PAW-ASN365425473-1768831257429`

### `box_id` (Box ID / Sort Box ID)
- **Source**: `tabSortBox` table
- **Created during**: Sorting process
- **Used for**: Sort box putaway (non-ASN putaway)
- **Example**: `BOX-WHMAIN-514364`

**Important**: `tc_id` and `box_id` are **DIFFERENT** identifiers for **DIFFERENT** entities. They are NOT interchangeable.

---

## API Request Flow

### POST /api/putaway/scan-transfer-carton

**Request Body:**
```json
{
  "tc_id": "PAW-ASN365425473-1768831257429",  // Optional: For ASN putaway
  "box_id": "BOX-WHMAIN-514364",               // Optional: For sort box putaway
  "location_id": "A1-R02-L1-B2",               // Required
  "user_id": "USER-001"
}
```

**Rules:**
- ✅ Either `tc_id` OR `box_id` is required (not both)
- ✅ If `tc_id` is provided → Validates against `tabTransferCarton` table
- ✅ If `box_id` is provided → Validates against `tabSortBox` table
- ❌ Cannot provide both `tc_id` and `box_id` at the same time

---

## API Response Structure

### Success Response:
```json
{
  "ok": true,
  "message": "Validation successful",
  "validated": {
    "carton_id": "PAW-ASN365425473-1768831257429",  // From tc_id (if provided)
    "box_id": null,                                  // From box_id (if provided), or null
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

**Key Points:**
1. **`box_id` in response** = **What you sent in the request**
   - If you sent `tc_id` → `box_id` will be `null` in response
   - If you sent `box_id` → `box_id` will be in response
   - The API **does NOT fetch `box_id` from anywhere** - it just echoes back what you sent

2. **`carton_id` in response** = **What you sent in the request**
   - If you sent `tc_id` → `carton_id` will be the `tc_id` value
   - If you sent `box_id` → `carton_id` will be `null` (because `box_id` is different from `tc_id`)

---

## Why You're Seeing CARTON_NOT_FOUND

### Error:
```
ERROR: Transfer carton PAW-ASN365425473-1768831257429 not found. 
Carton must be created during receiving before putaway.
```

### Root Cause:
The carton ID `PAW-ASN365425473-1768831257429` **does not exist** in the `tabTransferCarton` table.

### Why This Happens:
1. **Carton not created during receiving** - The receiving process (Transfer In) must create the transfer carton first
2. **Carton ID format** - The ID `PAW-ASN365425473-1768831257429` suggests it's a putaway carton, but it hasn't been created yet
3. **Workflow order** - Putaway can only happen AFTER receiving is complete

### Solution:
1. ✅ **Complete receiving first** - Go to Transfer In / Receiving screen
2. ✅ **Create transfer carton** - The receiving process should create the carton
3. ✅ **Then do putaway** - After carton is created, putaway can proceed

---

## Where Does `box_id` Come From?

### Answer: **From the Mobile App Request**

The API **does NOT generate or fetch `box_id`**. It comes from:

1. **Mobile App User Input**:
   - User scans a box barcode → Mobile app sends `box_id` in request
   - User scans a carton barcode → Mobile app sends `tc_id` in request

2. **Mobile App State**:
   - If user is doing ASN putaway → Mobile app sends `tc_id`
   - If user is doing sort box putaway → Mobile app sends `box_id`

3. **API Response**:
   - API just echoes back what was sent
   - If you sent `tc_id`, response has `carton_id` = `tc_id` and `box_id` = `null`
   - If you sent `box_id`, response has `box_id` = `box_id` and `carton_id` = `null`

---

## Code Flow

### Backend Validation (scanTransferCarton):

```javascript
// Step 1: Get from request
const { tc_id, box_id, location_id, user_id } = req.body;

// Step 2: Validate tc_id (if provided)
if (tc_id) {
  const [tcRows] = await connection.execute(
    `SELECT tc_id, status FROM tabTransferCarton WHERE tc_id = ? LIMIT 1`,
    [tc_id]
  );
  
  if (tcRows.length === 0) {
    // ❌ CARTON_NOT_FOUND error
    return res.status(400).json({
      error: { code: "CARTON_NOT_FOUND", message: "..." }
    });
  }
}

// Step 3: Validate box_id (if provided instead of tc_id)
if (box_id && !tc_id) {
  const [boxRows] = await connection.execute(
    `SELECT box_id, status FROM tabSortBox WHERE box_id = ? LIMIT 1`,
    [box_id]
  );
  
  if (boxRows.length === 0) {
    // ❌ BOX_NOT_FOUND error
    return res.status(400).json({
      error: { code: "BOX_NOT_FOUND", message: "..." }
    });
  }
}

// Step 4: Return response (echo back what was sent)
return res.status(200).json({
  ok: true,
  validated: {
    carton_id: tc_id || null,      // What you sent
    box_id: box_id || null,        // What you sent
    location_id: location_id,      // What you sent
    location: locationInfo         // Fetched from tabLocation
  }
});
```

**Key Point**: The API **validates** that `tc_id` exists in `tabTransferCarton` or `box_id` exists in `tabSortBox`, but it **does NOT fetch or generate** these IDs. They must come from the mobile app request.

---

## Mobile App Implementation

### For ASN Putaway (using `tc_id`):

```typescript
// User scans carton barcode: "PAW-ASN365425473-1768831257429"
const handleScanCarton = async (scannedId: string) => {
  const response = await apiService.post("/api/putaway/scan-transfer-carton", {
    tc_id: scannedId,        // ✅ Send tc_id
    box_id: null,             // ❌ Don't send box_id for ASN putaway
    location_id: locationId,
    user_id: currentUser.id,
  });
  
  // Response will have:
  // validated.carton_id = "PAW-ASN365425473-1768831257429"
  // validated.box_id = null
};
```

### For Sort Box Putaway (using `box_id`):

```typescript
// User scans box barcode: "BOX-WHMAIN-514364"
const handleScanBox = async (scannedId: string) => {
  const response = await apiService.post("/api/putaway/scan-transfer-carton", {
    tc_id: null,             // ❌ Don't send tc_id for sort box putaway
    box_id: scannedId,       // ✅ Send box_id
    location_id: locationId,
    user_id: currentUser.id,
  });
  
  // Response will have:
  // validated.carton_id = null
  // validated.box_id = "BOX-WHMAIN-514364"
};
```

---

## Summary

1. **`box_id` comes from the mobile app request** - The API doesn't generate it
2. **`tc_id` comes from the mobile app request** - The API doesn't generate it
3. **API validates existence** - Checks if `tc_id` exists in `tabTransferCarton` or `box_id` exists in `tabSortBox`
4. **API echoes back** - Response contains what you sent, not what it fetched
5. **CARTON_NOT_FOUND is expected** - If carton doesn't exist, complete receiving first

---

## Troubleshooting

### Q: Why is `box_id` always `null` in the response?
**A**: Because you're sending `tc_id` in the request. If you want `box_id` in the response, send `box_id` in the request instead.

### Q: Can I get both `tc_id` and `box_id` in the response?
**A**: No. You can only send one or the other. They represent different entities (transfer carton vs sort box).

### Q: How do I know which one to use?
**A**: 
- **ASN Putaway** → Use `tc_id` (carton created during receiving)
- **Sort Box Putaway** → Use `box_id` (box created during sorting)

### Q: The carton exists but I still get CARTON_NOT_FOUND?
**A**: Check:
1. Is it in `tabTransferCarton` table? (not `tabSortBox`)
2. Is the `tc_id` exactly matching? (case-sensitive, no extra spaces)
3. Was receiving completed? (carton must be created during receiving)

---

**Status**: ✅ **Documentation Complete**
