# Mobile App API Quick Reference - Inbound Session Sync

## ✅ Duplicate Prevention: Use `/api/inbound/update`

The API automatically prevents duplicates by using `inbound_session` as the unique identifier.

---

## Request Format

### POST /api/inbound/update

**URL:** `POST https://your-api.com/api/inbound/update`

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer YOUR_TOKEN"
}
```

**Request Body (Required Fields):**
```json
{
  "inbound_session": "SESSION-1234567890",
  "asn_no": "ASN-0001"
}
```

**Request Body (All Fields):**
```json
{
  "inbound_session": "SESSION-1234567890",
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 3,
  "total_cartons": 10,
  "transfer_order": "TO-00012",
  "dock": "DOCK-01",
  "user_id": "USER-123",
  "device_id": "DEVICE-001"
}
```

---

## Response Format

### Success - Session Updated (200 OK)
```json
{
  "ok": true,
  "message": "Session updated successfully",
  "action": "updated"
}
```

### Success - Session Created (201 Created)
```json
{
  "ok": true,
  "message": "Session created successfully",
  "action": "created"
}
```

### Error - Validation Failed (400 Bad Request)
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": {
    "inbound_session": "inbound_session is required"
  }
}
```

---

## How Duplicate Prevention Works

1. **Use the same `inbound_session` value** for the same session each time you sync
2. **API checks if session exists** using `inbound_session` as primary key
3. **If exists** → Updates existing session
4. **If not exists** → Creates new session
5. **No duplicates** → Each `inbound_session` value is unique

---

## Mobile App Implementation

### Simple Sync Function

```javascript
// Sync inbound session (prevents duplicates automatically)
async function syncSession(sessionData) {
  const response = await fetch('https://your-api.com/api/inbound/update', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      inbound_session: sessionData.inbound_session, // Must be unique per session
      asn_no: sessionData.asn_no,                   // Required
      status: sessionData.status || 'Active',        // Optional
      completed_cartons: sessionData.completed_cartons || 0,
      total_cartons: sessionData.total_cartons || 0,
      transfer_order: sessionData.transfer_order,
      dock: sessionData.dock,
      user_id: sessionData.user_id,
      device_id: sessionData.device_id
    })
  });
  
  const result = await response.json();
  return result;
}
```

### Usage Example

```javascript
// Sync session data
const sessionData = {
  inbound_session: "SESSION-1703347200000", // Use same value each sync
  asn_no: "ASN-0001",
  status: "Active",
  completed_cartons: 5,
  total_cartons: 10
};

// First call - creates new session
const result1 = await syncSession(sessionData);
// Returns: { ok: true, message: "Session created successfully", action: "created" }

// Second call with same inbound_session - updates existing session (no duplicate)
const result2 = await syncSession(sessionData);
// Returns: { ok: true, message: "Session updated successfully", action: "updated" }
```

---

## Field Reference

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `inbound_session` | string | ✅ Yes | **Unique identifier - prevents duplicates** |
| `asn_no` | string | ✅ Yes | Advance Shipping Notice number |
| `status` | string | ⚠️ Optional | Values: "Active", "Completed", "Cancelled", "Draft" |
| `completed_cartons` | integer | ⚠️ Optional | Must be ≥ 0 |
| `total_cartons` | integer | ⚠️ Optional | Must be ≥ 0 |
| `transfer_order` | string | ⚠️ Optional | Transfer order number |
| `dock` | string | ⚠️ Optional | Dock identifier |
| `user_id` | string | ⚠️ Optional | User identifier |
| `device_id` | string | ⚠️ Optional | Device identifier |

---

## Key Points

✅ **No Duplicates** - Same `inbound_session` = Update, not create  
✅ **Idempotent** - Safe to call multiple times  
✅ **Automatic** - No need to check for duplicates manually  
✅ **Simple** - Just use `/api/inbound/update` for all sync operations  

---

## Complete Session API

### Complete Session Endpoint

**POST /api/inbound/complete**

**Request:**
```json
{
  "inbound_session": "SESSION-1234567890",
  "asn_no": "ASN-0001",
  "user_id": "USER-123",
  "device_id": "DEVICE-001"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Session completed successfully"
}
```

