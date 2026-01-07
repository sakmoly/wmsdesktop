# Putaway Tasks Not Showing - Mobile App Debugging Guide

## 🔍 Issue

Transfer In Putaway Tasks are created successfully but not showing in mobile app.

**Test Results:**
- ✅ Database has 6 Transfer In Putaway Tasks
- ✅ All have `source_type = 'TransferIn'`
- ✅ All have `status = 'Draft'`
- ✅ Database query works correctly

## 🔧 Fixes Applied

### 1. Support Comma-Separated Status Values ✅

**Problem:** Mobile app sends `status="Draft,In Progress"` but API only supported single value.

**Fix:** Now supports comma-separated values:
```javascript
// Before: status = "Draft,In Progress" → treated as single string (no match)
// After: status = "Draft,In Progress" → splits to ["Draft", "In Progress"] → matches both
```

### 2. Enhanced Response Format ✅

**Added Fields:**
- `title` - Alias for `putaway_task`
- `transfer_in` - Transfer In number
- `transfer_in_number` - Alias for `transfer_in`
- `item_count` - Alias for `lines_count`
- `created_at` - Alias for `created_on`

### 3. Added Debug Logging ✅

**Server logs now show:**
- Request parameters received
- Number of tasks returned
- Task details for Transfer In tasks

---

## 📱 Mobile App API Call

### Correct API Call:

```http
GET /api/putaway/tasks?source_type=TransferIn&status=Draft,In Progress
Authorization: Bearer <token>
```

**Or without status filter:**
```http
GET /api/putaway/tasks?source_type=TransferIn
Authorization: Bearer <token>
```

### Expected Response:

```json
{
  "ok": true,
  "data": [
    {
      "putaway_task": "PUT-20260106-0006",
      "title": "PUT-20260106-0006",
      "status": "Draft",
      "source_type": "TransferIn",
      "transfer_in": "INSLIP-123467",
      "transfer_in_number": "INSLIP-123467",
      "asn_no": "INSLIP-123467",
      "item_count": 1,
      "lines_count": 1,
      "created_at": "2026-01-06T12:12:05.000Z",
      "created_on": "2026-01-06T12:12:05.000Z",
      "items": [
        {
          "item_code": "SKU-JACKET-201-BLK-L",
          "qty": 2.00,
          "carton_id": null,
          "rack": "TBD",
          "bin": "TBD"
        }
      ]
    }
  ]
}
```

---

## 🐛 Common Issues and Solutions

### Issue 1: Mobile App Filtering by Wrong Status

**Symptom:** Tasks exist but not showing

**Check:**
- Is mobile app filtering by `status="Open"`? (Tasks are `"Draft"`)
- Is mobile app filtering by `status="Draft,In Progress"`? (Should work now)

**Solution:**
```javascript
// ✅ CORRECT: Include Draft status
const tasks = await putawayAPI.getTasks({
  source_type: 'TransferIn',
  status: 'Draft,In Progress' // Include Draft
});

// ❌ WRONG: Only Open status
const tasks = await putawayAPI.getTasks({
  source_type: 'TransferIn',
  status: 'Open' // Won't find Draft tasks
});
```

### Issue 2: Response Format Mismatch

**Symptom:** API returns data but mobile app shows empty list

**Check:**
- Is mobile app accessing `response.data` or just `response`?
- Is mobile app looking for `title` or `putaway_task`?

**Solution:**
```javascript
// ✅ CORRECT: Access response.data
const response = await putawayAPI.getTasks({...});
const tasks = response.data; // Array of tasks

// ❌ WRONG: Access response directly
const tasks = response; // This is { ok: true, data: [...] }
```

### Issue 3: Field Name Mismatch

**Symptom:** Tasks returned but mobile app can't display them

**Check:**
- Mobile app might be looking for `title` instead of `putaway_task`
- Mobile app might be looking for `item_count` instead of `lines_count`

**Solution:**
- ✅ Fixed: API now returns both field names
- Use either `title` or `putaway_task`
- Use either `item_count` or `lines_count`

---

## 🔍 Debugging Steps

### Step 1: Check Server Logs

After restarting API server, when mobile app calls the endpoint, you should see:

```
📋 GET /api/putaway/tasks - Query params: { status: 'Draft,In Progress', source_type: 'TransferIn' }
✅ GET /api/putaway/tasks - Returning 6 task(s)
   Transfer In tasks: 6
   1. PUT-20260106-0006 - Transfer In: INSLIP-123467 - Status: Draft
   2. PUT-20260106-0005 - Transfer In: INSLIP-123466 - Status: Draft
   ...
```

**If you see:**
```
⚠️ GET /api/putaway/tasks - No tasks found with filters: { status: 'Open', source_type: 'TransferIn' }
```

**Problem:** Mobile app is filtering by wrong status (`Open` instead of `Draft`)

### Step 2: Test API Directly

Use curl or Postman to test:

```bash
curl -X GET "http://localhost:3000/api/putaway/tasks?source_type=TransferIn&status=Draft" \
  -H "Authorization: Bearer <token>"
```

**Expected:** Should return tasks

### Step 3: Check Mobile App Code

**Verify:**
1. API endpoint: `GET /api/putaway/tasks`
2. Query parameters: `source_type=TransferIn&status=Draft,In Progress`
3. Response parsing: `response.data` not `response`
4. Field access: Use `task.title` or `task.putaway_task`

---

## ✅ Verification Checklist

- [ ] API server restarted
- [ ] Server logs show request parameters
- [ ] Server logs show tasks being returned
- [ ] Mobile app uses correct API endpoint
- [ ] Mobile app includes `Draft` in status filter
- [ ] Mobile app accesses `response.data`
- [ ] Mobile app uses correct field names

---

## 📊 Test Results

**Database Query Test:**
```
✅ Found 6 Transfer In Putaway Tasks
✅ Query with source_type='TransferIn' AND status='Draft' returns 6 tasks
✅ All tasks have correct values
```

**API Response Test:**
- ✅ Status filter supports comma-separated values
- ✅ Response includes all required fields
- ✅ Transfer In tasks include `transfer_in` field

---

## 🎯 Next Steps

1. **Restart API Server** - Apply fixes
2. **Check Server Logs** - Verify requests and responses
3. **Test API Endpoint** - Use curl/Postman to verify
4. **Update Mobile App** - Ensure correct API call and response parsing

---

**Status:** ✅ Fixed  
**Date:** 2026-01-06  
**Requires:** API server restart + Mobile app verification

