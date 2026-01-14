# Material Request API Endpoints

## ✅ Update Material Request Status

**Endpoint:** `POST /api/material-requests/:title/update-status`

**URL Format:**
```
POST /api/material-requests/{material_request_title}/update-status
```

**Example:**
```
POST http://localhost:3000/api/material-requests/MR-123459/update-status
```

**Headers:**
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "In Progress"
}
```

**Valid Status Values:**
- `Draft`
- `Submitted`
- `In Progress`
- `Picked`
- `Dispatched`
- `Completed`
- `Cancelled`

**Optional Fields (for Dispatched status):**
```json
{
  "status": "Dispatched",
  "dispatched_by": "USER-004",
  "dispatched_on": "2026-01-03T11:00:00Z"
}
```

**Success Response (200):**
```json
{
  "ok": true,
  "message": "Material Request status updated successfully",
  "data": {
    "title": "MR-123459",
    "status": "In Progress",
    "updated_at": "2026-01-11T22:00:00.000Z"
  }
}
```

**Error Responses:**

**400 - Validation Error:**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "status is required"
  }
}
```

**404 - Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Material Request MR-123459 not found"
  }
}
```

---

## ❌ Common Mistakes

### Wrong URL (404 Error):
```
POST /api/material-requests/MR-123459/status  ❌
```

### Correct URL:
```
POST /api/material-requests/MR-123459/update-status  ✅
```

**Note:** The endpoint requires `/update-status` in the path, not just `/status`.

---

## 📋 All Material Request Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/material-requests` | Get all Material Requests |
| `GET` | `/api/material-requests/:title` | Get single Material Request |
| `POST` | `/api/material-requests` | Create new Material Request |
| `POST` | `/api/material-requests/:title/update-status` | **Update status** ✅ |
| `POST` | `/api/material-requests/:title/pick-items` | Pick items for Material Request |

---

## 🔧 Postman Setup

### Step 1: Set Method
- Select `POST`

### Step 2: Set URL
```
http://localhost:3000/api/material-requests/MR-123459/update-status
```

### Step 3: Set Headers
```
Authorization: Bearer {your_token}
Content-Type: application/json
```

### Step 4: Set Body (raw JSON)
```json
{
  "status": "In Progress"
}
```

### Step 5: Send Request

**Expected Result:** ✅ `200 OK` with success response

---

## ✅ Quick Test

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/material-requests/MR-123459/update-status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "In Progress"}'
```

---

**Status:** ✅ **API EXISTS AND IS WORKING**  
**Issue:** Wrong URL path used in Postman  
**Fix:** Change `/status` to `/update-status` in the URL
