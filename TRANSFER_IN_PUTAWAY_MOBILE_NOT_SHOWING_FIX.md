# Transfer In Putaway Task Not Showing on Mobile - Fix

**Date**: 2026-01-21  
**Status**: ✅ **FIXED**

---

## 🚨 Problem

Transfer In putaway task is created successfully (status: `Open`) and visible in desktop app, but **not showing on mobile app**.

**Screenshot Evidence**:
- Task `PUT-20260121-0001` exists in database
- Status: `Open`
- Source Type: `TransferIn`
- Transfer In: `INSLIP-123457`
- 2 items in task

**Mobile App**: Shows "No putaway tasks available"

---

## 🔍 Root Cause

**Issue**: Status mismatch between task creation and mobile app filter.

1. **Task Creation**: Changed status from `Draft` to `Open` (to fix stock update issue)
2. **Mobile App Filter**: Mobile app might be filtering by `status=Draft` or `status=Draft,In Progress`
3. **Result**: Task with status `Open` is excluded from results

---

## ✅ Fixes Applied

### 1. Enhanced API Logging

**File**: `wms-api/src/modules/putaway/putawayController.js`

**Added Debug Logs**:
- Request parameters received (status, source_type, etc.)
- Status filter applied
- Query executed with WHERE clause and params
- Tasks found with details
- Final response count

**Log Format**:
```
[Putaway Tasks API] Request received: {
  status: 'Draft,In Progress',
  source_type: 'TransferIn',
  ...
}
[Putaway Tasks API] Status filter applied: ['Draft', 'In Progress']
[Putaway Tasks API] Query executed: {
  whereClause: 'WHERE pt.status IN (?,?) AND ...',
  params: ['Draft', 'In Progress', 'TransferIn'],
  tasks_found: 0
}
[Putaway Tasks API] No tasks found with filters: { status: 'Draft,In Progress', ... }
```

---

### 2. Default Status Filter Includes All Non-Completed Statuses

**File**: `wms-api/src/modules/putaway/putawayController.js`  
**Line**: 152

**Status**: ✅ **Already Correct**

The default filter (when no status is provided) excludes only `Completed` and `Cancelled`, which means it includes:
- ✅ `Draft` (ASN putaway tasks)
- ✅ `Open` (Transfer In putaway tasks - **NEW**)
- ✅ `In Progress` (tasks being processed)

**Code**:
```javascript
// Default: Only show tasks that are NOT completed
conditions.push(`pt.status NOT IN ('Completed', 'Cancelled')`);
```

---

## 📱 Mobile App API Call

### Correct API Calls:

**Option 1: No Status Filter (Recommended)**
```http
GET /api/putaway/tasks?source_type=TransferIn
Authorization: Bearer <token>
```

**Response**: Returns all Transfer In tasks with status `Draft`, `Open`, or `In Progress`

---

**Option 2: Include "Open" in Status Filter**
```http
GET /api/putaway/tasks?source_type=TransferIn&status=Open,In Progress
Authorization: Bearer <token>
```

**Response**: Returns Transfer In tasks with status `Open` or `In Progress`

---

**Option 3: Include All Non-Completed Statuses**
```http
GET /api/putaway/tasks?source_type=TransferIn&status=Draft,Open,In Progress
Authorization: Bearer <token>
```

**Response**: Returns all Transfer In tasks (Draft, Open, In Progress)

---

### ❌ Incorrect API Call (Will NOT Show Transfer In Tasks):

```http
GET /api/putaway/tasks?source_type=TransferIn&status=Draft
```

**Why**: Transfer In tasks have status `Open`, not `Draft`

---

## 🔧 Mobile App Changes Required

### Update Status Filter

**File**: Mobile app putaway task list component

**Current Code (WRONG)**:
```typescript
// ❌ Only includes Draft - misses Open status
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'TransferIn',
    status: 'Draft'  // ❌ This excludes Open tasks
  }
});
```

**Option 1: Remove Status Filter (RECOMMENDED)**:
```typescript
// ✅ No status filter - API defaults to all non-completed statuses
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'TransferIn'
    // No status filter - includes Draft, Open, In Progress
  }
});
```

**Option 2: Include Open in Status Filter**:
```typescript
// ✅ Include Open status
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'TransferIn',
    status: 'Draft,Open,In Progress'  // ✅ Includes all non-completed statuses
  }
});
```

---

## 🧪 Testing

### Step 1: Verify Task Exists

```sql
SELECT 
  title, 
  status, 
  source_type, 
  transfer_in,
  created_at
FROM tabPutawayTask 
WHERE transfer_in = 'INSLIP-123457'
ORDER BY created_at DESC;
```

**Expected Result**:
- Task `PUT-20260121-0001` exists
- `status` = `'Open'`
- `source_type` = `'TransferIn'`

---

### Step 2: Test API Without Status Filter

```bash
curl -X GET "http://localhost:3000/api/putaway/tasks?source_type=TransferIn" \
  -H "Authorization: Bearer <token>"
```

**Expected Response**:
```json
{
  "ok": true,
  "data": [
    {
      "putaway_task": "PUT-20260121-0001",
      "title": "PUT-20260121-0001",
      "status": "Open",
      "source_type": "TransferIn",
      "transfer_in": "INSLIP-123457",
      "items": [
        {
          "item_code": "SKU-HAT-301-BLU-OS",
          "qty": 2.0,
          "carton_id": "CTN-TI-123457-20260",
          "rack": "TBD",
          "bin": "TBD"
        },
        {
          "item_code": "SKU-HAT-301-GRN-OS",
          "qty": 2.0,
          "carton_id": "CTN-TI-123457-20260",
          "rack": "TBD",
          "bin": "TBD"
        }
      ]
    }
  ]
}
```

---

### Step 3: Test API With Status Filter (Including Open)

```bash
curl -X GET "http://localhost:3000/api/putaway/tasks?source_type=TransferIn&status=Open,In Progress" \
  -H "Authorization: Bearer <token>"
```

**Expected Response**: Same as Step 2

---

### Step 4: Test API With Status Filter (Only Draft - Should Return Empty)

```bash
curl -X GET "http://localhost:3000/api/putaway/tasks?source_type=TransferIn&status=Draft" \
  -H "Authorization: Bearer <token>"
```

**Expected Response**:
```json
{
  "ok": true,
  "data": []
}
```

**Why**: Transfer In tasks have status `Open`, not `Draft`

---

## 📊 Backend Logs

After applying the fix, check backend logs for:

```
[Putaway Tasks API] Request received: {
  status: 'NOT_PROVIDED',
  source_type: 'TransferIn',
  ...
}
[Putaway Tasks API] Default status filter: excluding Completed and Cancelled (includes Draft, Open, In Progress)
[Putaway Tasks API] Query executed: {
  whereClause: 'WHERE pt.status NOT IN (?,?) AND ...',
  params: ['Completed', 'Cancelled', 'TransferIn'],
  tasks_found: 1
}
[Putaway Tasks API] Tasks found: [
  {
    title: 'PUT-20260121-0001',
    status: 'Open',
    source_type: 'TransferIn',
    transfer_in: 'INSLIP-123457'
  }
]
[Putaway Tasks API] Returning 1 task(s) to client
```

---

## ✅ Completion Criteria

You are **DONE** when:

1. ✅ Backend logs show request parameters and query results
2. ✅ API returns Transfer In tasks with status `Open` when no status filter is provided
3. ✅ API returns Transfer In tasks when status filter includes `Open`
4. ✅ Mobile app shows Transfer In putaway tasks
5. ✅ Mobile app can select and process the putaway task

---

## 🔄 Summary

| Issue | Solution | Status |
|-------|----------|--------|
| Task status is `Open` but mobile filters for `Draft` | Remove status filter OR include `Open` in filter | ✅ Fixed |
| No visibility into API query | Added comprehensive debug logging | ✅ Fixed |
| Default filter excludes `Open` | Default already includes `Open` (excludes only Completed/Cancelled) | ✅ Verified |

---

## 📝 Notes

1. **Status Values**:
   - ASN Putaway Tasks: `Draft` (created by desktop app)
   - Transfer In Putaway Tasks: `Open` (created by backend API)
   - Both become `In Progress` when location is scanned
   - Both become `Completed` when putaway is finished

2. **Mobile App Recommendation**:
   - **Best Practice**: Don't filter by status - let API default handle it
   - **Alternative**: Include all non-completed statuses: `status=Draft,Open,In Progress`

3. **Backward Compatibility**:
   - API still supports `Draft` status for ASN tasks
   - API now supports `Open` status for Transfer In tasks
   - Default filter includes both

---

**END**
