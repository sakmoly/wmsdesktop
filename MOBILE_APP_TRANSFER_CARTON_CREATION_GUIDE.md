# Mobile App: Transfer Carton Creation Guide for Material Requests

## Overview

When packing Material Request items, the mobile app must **explicitly create** the transfer carton via API before packing items. Simply generating a TC ID is not enough.

---

## Workflow

```
1. User picks items → Update picked_qty
2. User wants to pack → Generate TC ID (e.g., TC-MR-0001-{timestamp})
3. ✅ Call POST /api/transfer-cartons/create (REQUIRED)
4. Pack items to TC via POST /api/events/batch
5. Seal TC via POST /api/transfer-cartons/seal
```

---

## Step 1: Create Transfer Carton

### API Endpoint

```
POST /api/transfer-cartons/create
```

### Request Headers

```
Authorization: Bearer {token}
Content-Type: application/json
```

### Request Body

```json
{
  "tc_id": "TC-MR-0001-1767516827262",
  "asn_no": null,
  "to_no": "MR-0001",
  "store": "STORE-001",
  "user_id": "USER-004",
  "material_request": "MR-0001"
}
```

### Field Requirements

| Field              | Required    | Value                             | Notes                                         |
| ------------------ | ----------- | --------------------------------- | --------------------------------------------- |
| `tc_id`            | ✅ Yes      | `"TC-MR-{MR_NUMBER}-{timestamp}"` | Generated TC ID                               |
| `asn_no`           | ✅ Yes      | `null`                            | **MUST be null for Material Requests**        |
| `to_no`            | ✅ Yes      | `"MR-0001"`                       | **MUST be Material Request number, NOT null** |
| `store`            | ✅ Yes      | `"STORE-001"`                     | Destination showroom/store code               |
| `user_id`          | ✅ Yes      | `"USER-004"`                      | User creating the transfer carton             |
| `material_request` | ❌ Optional | `"MR-0001"`                       | For reference only                            |

### Response (Success)

```json
{
  "ok": true,
  "message": "Transfer carton created successfully",
  "data": {
    "tc_id": "TC-MR-0001-1767516827262",
    "status": "Created"
  }
}
```

### Response (Error - Validation)

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "transfer_order (to_no) must be a valid Material Request number (format: MR-XXXX) for Material Request transfer cartons"
  }
}
```

### Common Errors

1. **`to_no` is null or missing**

   - ❌ Wrong: `"to_no": null`
   - ✅ Correct: `"to_no": "MR-0001"`

2. **`asn_no` is not null**

   - ❌ Wrong: `"asn_no": "ASN-0001"`
   - ✅ Correct: `"asn_no": null`

3. **`to_no` format incorrect**
   - ❌ Wrong: `"to_no": "MR0001"` (missing hyphen)
   - ✅ Correct: `"to_no": "MR-0001"`

---

## Step 2: Pack Items to Transfer Carton

### API Endpoint

```
POST /api/events/batch
```

### Request Body

```json
{
  "events": [
    {
      "event_type": "PACK_BOX_TO_TC",
      "event_time": "2026-01-03T10:45:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-004",
      "item_code": "SKU-HAT-301-RED-OS",
      "qty": 20.0,
      "store": "STORE-001",
      "tc_id": "TC-MR-0001-1767516827262",
      "transfer_order": "MR-0001",
      "material_request": "MR-0001"
    }
  ]
}
```

### Important Fields

- `tc_id`: Must match the TC ID created in Step 1
- `transfer_order`: Material Request number (e.g., `"MR-0001"`)
- `material_request`: Material Request number (optional but recommended)

---

## Step 3: Seal Transfer Carton

### API Endpoint

```
POST /api/transfer-cartons/seal
```

### Request Body

```json
{
  "tc_id": "TC-MR-0001-1767516827262",
  "sealed_by": "USER-004"
}
```

### Response

```json
{
  "ok": true,
  "message": "Transfer carton sealed successfully",
  "data": {
    "tc_id": "TC-MR-0001-1767516827262",
    "status": "Sealed"
  }
}
```

---

## Code Example (JavaScript/TypeScript)

```javascript
// Step 1: Create Transfer Carton
async function createMaterialRequestTransferCarton(mrNumber, store, userId) {
  const tcId = `TC-MR-${mrNumber}-${Date.now()}`;

  const response = await fetch("http://api-url/api/transfer-cartons/create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tc_id: tcId,
      asn_no: null, // MUST be null
      to_no: mrNumber, // e.g., "MR-0001"
      store: store,
      user_id: userId,
      material_request: mrNumber,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return tcId;
}

// Step 2: Pack Item to Transfer Carton
async function packItemToTransferCarton(tcId, itemCode, qty, mrNumber, userId) {
  const response = await fetch("http://api-url/api/events/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      events: [
        {
          event_type: "PACK_BOX_TO_TC",
          event_time: new Date().toISOString(),
          device_id: deviceId,
          user_id: userId,
          item_code: itemCode,
          qty: qty,
          store: store,
          tc_id: tcId,
          transfer_order: mrNumber,
          material_request: mrNumber,
        },
      ],
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error("Failed to pack item");
  }
}

// Step 3: Seal Transfer Carton
async function sealTransferCarton(tcId, userId) {
  const response = await fetch("http://api-url/api/transfer-cartons/seal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tc_id: tcId,
      sealed_by: userId,
    }),
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error("Failed to seal transfer carton");
  }
}

// Complete Workflow
async function packMaterialRequestItem(mrNumber, itemCode, qty, store, userId) {
  try {
    // 1. Create Transfer Carton
    const tcId = await createMaterialRequestTransferCarton(
      mrNumber,
      store,
      userId
    );
    console.log("Transfer Carton created:", tcId);

    // 2. Pack Item
    await packItemToTransferCarton(tcId, itemCode, qty, mrNumber, userId);
    console.log("Item packed to Transfer Carton");

    // 3. Seal Transfer Carton
    await sealTransferCarton(tcId, userId);
    console.log("Transfer Carton sealed");

    return tcId;
  } catch (error) {
    console.error("Error in packing workflow:", error);
    throw error;
  }
}
```

---

## Verification

After creating the transfer carton, verify it appears in the desktop app:

1. Open Desktop App → Transfer Cartons
2. Look for TC ID: `TC-MR-0001-1767516827262`
3. Check that `Transfer Order` column shows: `MR-0001`
4. Check that `ASN` column shows: `null` or empty

---

## Troubleshooting

### Transfer Carton Not Appearing in Desktop App

1. **Check API Response**: Verify the create API returned `ok: true`
2. **Check Database**: Query `tabTransferCarton` table directly
3. **Check Logs**: Look for errors in API server logs
4. **Verify Fields**: Ensure `to_no` is Material Request number (not null)

### Validation Error: "to_no must be a valid Material Request number"

- ❌ `"to_no": null` → ✅ `"to_no": "MR-0001"`
- ❌ `"to_no": "MR0001"` → ✅ `"to_no": "MR-0001"` (must have hyphen)

### Validation Error: "asn_no must be null for Material Request transfer cartons"

- ❌ `"asn_no": "ASN-0001"` → ✅ `"asn_no": null`
- ❌ `"asn_no": ""` → ✅ `"asn_no": null`

---

## Summary

✅ **DO:**

- Call `POST /api/transfer-cartons/create` before packing items
- Include `to_no: "MR-0001"` (Material Request number)
- Include `asn_no: null`
- Include `tc_id`, `store`, and `user_id`

❌ **DON'T:**

- Skip the create API call
- Set `to_no` to `null`
- Set `asn_no` to a value (must be `null`)
- Create transfer carton after packing items
