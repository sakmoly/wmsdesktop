# How to Call Session API - Simple Step-by-Step Guide

## 🎯 Simple Answer

**To sync a session and prevent duplicates, use ONE endpoint:**

```
POST /api/inbound/update
```

That's it! This endpoint handles everything:
- ✅ Creates new sessions
- ✅ Updates existing sessions  
- ✅ Prevents duplicates automatically

---

## 📋 Step-by-Step Instructions

### Step 1: Prepare Your Data

You need at minimum:
- `inbound_session` - A unique identifier for your session (e.g., "SESSION-1703347200000")
- `asn_no` - Your ASN number (e.g., "ASN-0001")

### Step 2: Make the API Call

**URL:** 
```
POST https://your-api-server.com/api/inbound/update
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer YOUR_AUTH_TOKEN
```

**Body:**
```json
{
  "inbound_session": "SESSION-1703347200000",
  "asn_no": "ASN-0001"
}
```

### Step 3: Check the Response

**If successful (200 OK):**
```json
{
  "ok": true,
  "message": "Session updated successfully",
  "action": "updated"
}
```
OR
```json
{
  "ok": true,
  "message": "Session created successfully",
  "action": "created"
}
```

---

## 🔄 When to Call the API

### Scenario 1: Starting a New Session

**First time syncing this session:**
```json
POST /api/inbound/update
{
  "inbound_session": "SESSION-NEW-001",
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 0,
  "total_cartons": 10
}
```

**Result:** Creates new session (action: "created")

---

### Scenario 2: Updating an Existing Session

**Syncing the same session again (use SAME inbound_session value):**
```json
POST /api/inbound/update
{
  "inbound_session": "SESSION-NEW-001",  // ← Same value as before
  "asn_no": "ASN-0001",
  "status": "Active",
  "completed_cartons": 5,  // ← Updated value
  "total_cartons": 10
}
```

**Result:** Updates existing session (action: "updated") - **NO DUPLICATE CREATED**

---

### Scenario 3: Completing a Session

**When session is finished:**
```json
POST /api/inbound/complete
{
  "inbound_session": "SESSION-NEW-001",
  "asn_no": "ASN-0001"
}
```

**Result:** Marks session as completed

---

## 💻 Code Examples

### JavaScript/TypeScript

```javascript
// Function to sync session
async function syncInboundSession(sessionData) {
  const apiUrl = 'https://your-api-server.com/api/inbound/update';
  const authToken = 'YOUR_TOKEN_HERE'; // Get from your auth system
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        inbound_session: sessionData.inbound_session,
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
      console.error('Error:', result.message);
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Network error:', error);
    throw error;
  }
}

// Usage
const mySession = {
  inbound_session: "SESSION-1703347200000",
  asn_no: "ASN-0001",
  status: "Active",
  completed_cartons: 3,
  total_cartons: 10
};

// Call it
await syncInboundSession(mySession);
```

---

### cURL Example

```bash
curl -X POST https://your-api-server.com/api/inbound/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "inbound_session": "SESSION-1703347200000",
    "asn_no": "ASN-0001",
    "status": "Active",
    "completed_cartons": 3,
    "total_cartons": 10
  }'
```

---

### Python Example

```python
import requests

def sync_inbound_session(session_data, auth_token):
    url = "https://your-api-server.com/api/inbound/update"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    }
    
    response = requests.post(url, json=session_data, headers=headers)
    return response.json()

# Usage
session_data = {
    "inbound_session": "SESSION-1703347200000",
    "asn_no": "ASN-0001",
    "status": "Active",
    "completed_cartons": 3,
    "total_cartons": 10
}

result = sync_inbound_session(session_data, "YOUR_TOKEN")
print(result)
```

---

## ❓ FAQ

### Q: Do I need to check if session exists before calling?

**A: NO!** The API handles this automatically. Just call `/api/inbound/update` - it will create if new, update if exists.

### Q: Will it create duplicates?

**A: NO!** As long as you use the **same `inbound_session` value** for the same session, it will update the existing record, not create a duplicate.

### Q: What if I call it multiple times with the same data?

**A: Safe!** It's idempotent - calling multiple times with the same `inbound_session` will just update the same record.

### Q: What's the minimum data I need to send?

**A:** Only these two fields are required:
```json
{
  "inbound_session": "SESSION-123",
  "asn_no": "ASN-0001"
}
```

All other fields are optional.

### Q: How do I know if it created or updated?

**A:** Check the `action` field in the response:
- `"action": "created"` - New session was created
- `"action": "updated"` - Existing session was updated

---

## 📊 Complete Request Examples

### Minimal Request (Only Required Fields)
```json
POST /api/inbound/update
{
  "inbound_session": "SESSION-001",
  "asn_no": "ASN-0001"
}
```

### Full Request (All Fields)
```json
POST /api/inbound/update
{
  "inbound_session": "SESSION-001",
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

---

## 🎯 Summary

1. **Use:** `POST /api/inbound/update`
2. **Required:** `inbound_session` and `asn_no`
3. **Always use the same `inbound_session`** for the same session
4. **No need to check for duplicates** - API handles it
5. **Call it whenever** you need to sync session data

That's it! Simple and straightforward. 🚀

