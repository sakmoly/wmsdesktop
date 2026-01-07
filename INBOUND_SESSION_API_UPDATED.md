# Inbound Session API - Updated for Duplicate Prevention

## Overview

The API endpoints prevent duplicate sessions by using the `inbound_session` as the primary key. When a session with the same `inbound_session` already exists, it will be updated instead of creating a duplicate.

---

## API Endpoints

### 1. POST /api/inbound/update

**Purpose:** Update or create inbound session (prevents duplicates)

**Endpoint:** `POST /api/inbound/update`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
```

**Request Body:**
```json
{
  "inbound_session": "SESSION-1234567890",
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 3,
  "total_cartons": 4,
  "transfer_order": "TO-00012",
  "dock": "DOCK-01",
  "user_id": "USER-123",
  "device_id": "DEVICE-001"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inbound_session` | string | ✅ Yes | Unique session identifier (primary key) - prevents duplicates |
| `asn_no` | string | ✅ Yes | Advance Shipping Notice number |
| `status` | string | ⚠️ Optional | Session status: 'Active', 'Completed', 'Cancelled', 'Draft' |
| `completed_cartons` | integer | ⚠️ Optional | Number of cartons completed (≥ 0) |
| `total_cartons` | integer | ⚠️ Optional | Total number of cartons expected (≥ 0) |
| `transfer_order` | string | ⚠️ Optional | Transfer order number |
| `dock` | string | ⚠️ Optional | Dock identifier |
| `user_id` | string | ⚠️ Optional | User who started/updated the session |
| `device_id` | string | ⚠️ Optional | Device identifier |

**Success Response (200 OK):**
```json
{
  "ok": true,
  "message": "Session updated successfully",
  "action": "updated"
}
```

**Created Response (201 Created) - Only if session was newly created:**
```json
{
  "ok": true,
  "message": "Session created successfully",
  "action": "created"
}
```

**Error Responses:**

**400 Bad Request - Validation Error:**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": {
    "inbound_session": "inbound_session is required",
    "asn_no": "asn_no is required"
  }
}
```

**401 Unauthorized:**
```json
{
  "error": "AUTH_REQUIRED",
  "message": "Authentication token required"
}
```

**500 Internal Server Error:**
```json
{
  "error": "INTERNAL_ERROR",
  "message": "Failed to update session"
}
```

**Duplicate Prevention:**
- ✅ If `inbound_session` already exists → **Updates** existing session
- ✅ If `inbound_session` doesn't exist → **Creates** new session
- ✅ No duplicate sessions will be created

---

### 2. POST /api/inbound/complete

**Purpose:** Mark session as completed

**Endpoint:** `POST /api/inbound/complete`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
```

**Request Body:**
```json
{
  "inbound_session": "SESSION-1234567890",
  "asn_no": "ASN-0001",
  "user_id": "USER-123",
  "device_id": "DEVICE-001"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inbound_session` | string | ✅ Yes | Session identifier to complete |
| `asn_no` | string | ✅ Yes | Advance Shipping Notice number |
| `user_id` | string | ⚠️ Optional | User who completed the session |
| `device_id` | string | ⚠️ Optional | Device identifier |

**Success Response (200 OK):**
```json
{
  "ok": true,
  "message": "Session completed successfully"
}
```

**Error Response (404 Not Found):**
```json
{
  "error": "NOT_FOUND",
  "message": "Session not found"
}
```

---

### 3. POST /api/inbound/start (if exists)

**Purpose:** Start a new inbound session

**Endpoint:** `POST /api/inbound/start`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_TOKEN
```

**Request Body:**
```json
{
  "asn_no": "ASN-0001",
  "transfer_order": "TO-00012",
  "dock": "DOCK-01",
  "user_id": "USER-123",
  "device_id": "DEVICE-001"
}
```

**Success Response (200 OK):**
```json
{
  "inbound_session": "SESSION-1234567890"
}
```

**Note:** This endpoint generates a new unique `inbound_session`. If you need to prevent duplicates, use `/api/inbound/update` instead.

---

## Mobile App Implementation Guide

### Preventing Duplicates When Syncing

**Option 1: Use `/api/inbound/update` (Recommended)**

The `/api/inbound/update` endpoint automatically prevents duplicates by using `inbound_session` as the unique identifier:

```javascript
// Mobile app code example
async function syncInboundSession(sessionData) {
  try {
    const response = await fetch('https://your-api.com/api/inbound/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        inbound_session: sessionData.inbound_session, // Must be unique
        asn_no: sessionData.asn_no,
        status: sessionData.status || 'Active',
        completed_cartons: sessionData.completed_cartons || 0,
        total_cartons: sessionData.total_cartons || 0,
        transfer_order: sessionData.transfer_order,
        dock: sessionData.dock,
        user_id: sessionData.user_id,
        device_id: sessionData.device_id
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`Session ${result.action}:`, result.message);
      return result;
    } else {
      throw new Error(result.message || 'Failed to sync session');
    }
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
}
```

**Option 2: Check Before Create**

If you want to explicitly check for duplicates before syncing:

```javascript
async function syncInboundSessionSafely(sessionData) {
  // First, check if session exists
  const checkResponse = await fetch(`https://your-api.com/api/inbound/${sessionData.inbound_session}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  });

  if (checkResponse.ok) {
    // Session exists - use update endpoint
    return await syncInboundSession(sessionData);
  } else {
    // Session doesn't exist - create new via update endpoint (it handles both)
    return await syncInboundSession(sessionData);
  }
}
```

---

## Complete Request/Response Examples

### Example 1: Create New Session (via update)

**Request:**
```json
POST /api/inbound/update
{
  "inbound_session": "SESSION-1703347200000",
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 0,
  "total_cartons": 10,
  "transfer_order": "TO-00012",
  "dock": "DOCK-01",
  "user_id": "USER-123",
  "device_id": "DEVICE-001"
}
```

**Response (201 Created):**
```json
{
  "ok": true,
  "message": "Session created successfully",
  "action": "created"
}
```

### Example 2: Update Existing Session (Prevents Duplicate)

**Request:**
```json
POST /api/inbound/update
{
  "inbound_session": "SESSION-1703347200000",
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 5,
  "total_cartons": 10,
  "transfer_order": "TO-00012",
  "dock": "DOCK-01",
  "user_id": "USER-123",
  "device_id": "DEVICE-001"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "Session updated successfully",
  "action": "updated"
}
```

### Example 3: Complete Session

**Request:**
```json
POST /api/inbound/complete
{
  "inbound_session": "SESSION-1703347200000",
  "asn_no": "ASN-0001",
  "user_id": "USER-123",
  "device_id": "DEVICE-001"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "Session completed successfully"
}
```

---

## Key Points for Duplicate Prevention

1. ✅ **`inbound_session` is the Primary Key** - Each session must have a unique `inbound_session` value
2. ✅ **Upsert Behavior** - Using `/api/inbound/update` will update if exists, create if not
3. ✅ **Idempotent** - You can call the same endpoint multiple times with the same `inbound_session` safely
4. ✅ **No Manual Checking Needed** - The API handles duplicate prevention automatically

---

## Testing with cURL

### Test Update (Creates or Updates)
```bash
curl -X POST http://localhost:3000/api/inbound/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "inbound_session": "SESSION-TEST-001",
    "asn_no": "ASN-0001",
    "status": "Active",
    "completed_cartons": 3,
    "total_cartons": 10
  }'
```

### Test Complete
```bash
curl -X POST http://localhost:3000/api/inbound/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "inbound_session": "SESSION-TEST-001",
    "asn_no": "ASN-0001"
  }'
```

---

## Summary

- ✅ Use `POST /api/inbound/update` to sync sessions - it prevents duplicates automatically
- ✅ Use the same `inbound_session` value each time you sync the same session
- ✅ The API will update existing sessions or create new ones as needed
- ✅ No need to check for duplicates manually - the API handles it

