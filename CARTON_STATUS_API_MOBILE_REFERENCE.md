# Carton Status Update API - Mobile Reference

## Quick Start

**Endpoint:** `POST /api/cartons/update-status`

**Purpose:** Update carton status to "Unloaded" when user clicks "Next" in Unload screen

---

## Request Format

### Single Carton Update

```json
{
  "asn_no": "ASN-0002",
  "inbound_session": "SESSION-1721881234567",
  "carton_id": "CTN-0101",
  "status": "Unloaded",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

### Batch Carton Update (Multiple Cartons)

```json
{
  "asn_no": "ASN-0002",
  "inbound_session": "SESSION-1721881234567",
  "cartons": [
    {
      "carton_id": "CTN-0101",
      "status": "Unloaded"
    },
    {
      "carton_id": "CTN-0102",
      "status": "Unloaded"
    }
  ],
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

---

## Response Format

### Success (200 OK) - Single

```json
{
  "success": true,
  "message": "Carton status updated successfully",
  "updated_count": 1
}
```

### Success (200 OK) - Batch

```json
{
  "success": true,
  "message": "Carton statuses updated successfully",
  "updated_count": 2,
  "cartons": [
    {
      "carton_id": "CTN-0101",
      "status": "Unloaded",
      "updated": true
    },
    {
      "carton_id": "CTN-0102",
      "status": "Unloaded",
      "updated": true
    }
  ]
}
```

### Error (400 Bad Request)

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Missing required field: asn_no"
}
```

### Error (404 Not Found)

```json
{
  "code": "NOT_FOUND",
  "message": "Carton CTN-0101 not found for ASN ASN-0002 and session SESSION-1721881234567"
}
```

---

## Required Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `asn_no` | string | ✅ Yes | ASN number (e.g., "ASN-0002") |
| `inbound_session` | string | ✅ Yes | Inbound session identifier |
| `status` | string | ✅ Yes | Status value: "Unloaded" |
| `carton_id` | string | ⚠️ Single | Required for single update |
| `cartons` | array | ⚠️ Batch | Required for batch update |

**Note:** Use either `carton_id` (single) OR `cartons` array (batch), not both.

---

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | string | User ID who performed the action |
| `device_id` | string | Device identifier |

---

## Mobile App Code Example

### JavaScript/TypeScript

```javascript
// Update carton status (single)
async function updateCartonStatus(cartonData) {
  const response = await fetch('https://your-api.com/api/cartons/update-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      asn_no: cartonData.asn_no,
      inbound_session: cartonData.inbound_session,
      carton_id: cartonData.carton_id,
      status: 'Unloaded',
      user_id: cartonData.user_id,
      device_id: cartonData.device_id
    })
  });
  
  return await response.json();
}

// Update multiple cartons (batch)
async function updateCartonStatuses(cartonsData) {
  const response = await fetch('https://your-api.com/api/cartons/update-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      asn_no: cartonsData.asn_no,
      inbound_session: cartonsData.inbound_session,
      cartons: cartonsData.cartons.map(c => ({
        carton_id: c.carton_id,
        status: 'Unloaded'
      })),
      user_id: cartonsData.user_id,
      device_id: cartonsData.device_id
    })
  });
  
  return await response.json();
}
```

### Usage Example

```javascript
// When user clicks "Next" in Unload screen

// Single carton
await updateCartonStatus({
  asn_no: "ASN-0002",
  inbound_session: "SESSION-1721881234567",
  carton_id: "CTN-0101",
  user_id: "USER-172188",
  device_id: "DEVICE-001"
});

// Multiple cartons (recommended for batch updates)
await updateCartonStatuses({
  asn_no: "ASN-0002",
  inbound_session: "SESSION-1721881234567",
  cartons: [
    { carton_id: "CTN-0101" },
    { carton_id: "CTN-0102" },
    { carton_id: "CTN-0103" }
  ],
  user_id: "USER-172188",
  device_id: "DEVICE-001"
});
```

---

## Status Values

Valid status values:
- `"Pending"` - Carton not yet unloaded
- `"Unloaded"` - Carton has been unloaded from truck
- `"In Receiving"` - Carton is currently being received/sorted
- `"Received"` - Carton has been fully received and sorted
- `"Verified"` - Carton has been verified/checked
- `"Closed"` - Final status

---

## Key Points

✅ **Use batch update** when updating multiple cartons (more efficient)  
✅ **Required fields**: `asn_no`, `inbound_session`, `status`, and either `carton_id` or `cartons` array  
✅ **Status**: Use `"Unloaded"` when user clicks "Next" in Unload screen  
✅ **Idempotent**: Safe to call multiple times  
✅ **Transaction**: Batch updates are atomic (all succeed or all fail)  

---

## Testing

### Test Single Update
```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-1721881234567",
    "carton_id": "CTN-0101",
    "status": "Unloaded"
  }'
```

### Test Batch Update
```bash
curl -X POST http://localhost:3000/api/cartons/update-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "asn_no": "ASN-0002",
    "inbound_session": "SESSION-1721881234567",
    "cartons": [
      {"carton_id": "CTN-0101", "status": "Unloaded"},
      {"carton_id": "CTN-0102", "status": "Unloaded"}
    ]
  }'
```

