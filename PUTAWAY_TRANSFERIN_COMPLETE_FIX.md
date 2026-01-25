# Transfer In Putaway Tasks Not Showing - Complete Fix Guide

## Goal

Fix Transfer In putaway tasks not showing on Mobile app. Ensure:
- **All tab** shows **ASN + TransferIn**
- **ASN tab** shows only **ASN**
- **Transfer In tab** shows only **TransferIn**
- **Completed** tasks are excluded by default
- Mobile/desktop always show the same tasks as API

---

## Step 1: Verify Backend API (✅ Already Working)

Based on logs, the backend API is **already working correctly**:

### Test Results:
```bash
# Test 1: Get all tasks (ASN + TransferIn)
GET /api/putaway/tasks?status=Draft,Open,In Progress
✅ Returns: 1 TransferIn task (PUT-20260123-0002)

# Test 2: Get only TransferIn
GET /api/putaway/tasks?source_type=TransferIn&status=Draft,Open,In Progress
✅ Returns: 1 TransferIn task (PUT-20260123-0002)

# Test 3: Get only ASN
GET /api/putaway/tasks?source_type=ASN&status=Draft,Open,In Progress
✅ Returns: ASN tasks
```

### Backend API Status: ✅ **WORKING**

The API correctly:
- Supports comma-separated status values
- Supports comma-separated source_type values
- Returns Transfer In tasks with status "Open"
- Excludes Completed tasks by default
- Returns proper response format with all required fields

---

## Step 2: Mobile App API Calls (Required Changes)

### 2.1 "All" Tab - Show ASN + TransferIn

**Current (WRONG):**
```typescript
// ❌ Only shows ASN tasks
const response = await api.get('/api/putaway/tasks', {
  params: {
    status: 'Draft,In Progress'  // Missing "Open" - excludes TransferIn
  }
});
```

**Fixed (CORRECT):**
```typescript
// ✅ Option 1: No source_type filter (RECOMMENDED)
const response = await api.get('/api/putaway/tasks', {
  params: {
    status: 'Draft,Open,In Progress'  // Includes Open for TransferIn
    // No source_type = returns all types
  }
});

// ✅ Option 2: Explicitly include both types
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'ASN,TransferIn',
    status: 'Draft,Open,In Progress'
  }
});

// ✅ Option 3: No status filter (API defaults to exclude Completed)
const response = await api.get('/api/putaway/tasks', {
  params: {
    // No filters = returns all non-completed tasks (ASN + TransferIn)
  }
});
```

**API Endpoint:**
```
GET /api/putaway/tasks?status=Draft,Open,In Progress
```

---

### 2.2 "ASN" Tab - Show Only ASN

**Correct Implementation:**
```typescript
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'ASN',
    status: 'Draft,Open,In Progress'  // ASN tasks can be Draft or Open
  }
});
```

**API Endpoint:**
```
GET /api/putaway/tasks?source_type=ASN&status=Draft,Open,In Progress
```

---

### 2.3 "Transfer In" Tab - Show Only TransferIn

**Current (WRONG):**
```typescript
// ❌ Only includes Draft - misses Open status
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'TransferIn',
    status: 'Draft'  // TransferIn tasks have status "Open", not "Draft"
  }
});
```

**Fixed (CORRECT):**
```typescript
// ✅ Option 1: Include Open status (REQUIRED)
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'TransferIn',
    status: 'Open,In Progress'  // TransferIn tasks have status "Open"
  }
});

// ✅ Option 2: No status filter (API defaults to exclude Completed)
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'TransferIn'
    // No status = includes Draft, Open, In Progress (excludes Completed)
  }
});

// ✅ Option 3: Include all non-completed statuses
const response = await api.get('/api/putaway/tasks', {
  params: {
    source_type: 'TransferIn',
    status: 'Draft,Open,In Progress'  // Safe - includes all possibilities
  }
});
```

**API Endpoint:**
```
GET /api/putaway/tasks?source_type=TransferIn&status=Open,In Progress
```

---

## Step 3: Response Format Handling

### 3.1 Check Response Structure

**API Response Format:**
```json
{
  "ok": true,
  "data": [
    {
      "putaway_task": "PUT-20260123-0002",
      "title": "PUT-20260123-0002",
      "status": "Open",
      "source_type": "TransferIn",
      "transfer_in": "INSLIP-12344",
      "transfer_in_number": "INSLIP-12344",
      "asn_no": null,
      "item_count": 2,
      "lines_count": 2,
      "created_at": "2026-01-23T20:37:38.000Z",
      "items": [
        {
          "item_code": "SKU-HAT-301-BLU-OS",
          "qty": 10.0,
          "carton_id": "CTN-TI-12344-20260123-203738-482",
          "rack": "Rack 02",
          "bin": "B2",
          "location_id": "A1-R02-L2-B2"
        }
      ]
    }
  ]
}
```

### 3.2 Mobile App Code (TypeScript/JavaScript)

**Correct Response Handling:**
```typescript
// ✅ CORRECT: Access response.data
const response = await api.get('/api/putaway/tasks', { params: {...} });

if (response.ok && response.data) {
  const tasks = response.data;  // Array of tasks
  tasks.forEach(task => {
    // Use task.title or task.putaway_task (both exist)
    // Use task.source_type to filter
    // Use task.status to check status
    // Use task.transfer_in for TransferIn tasks
    // Use task.asn_no for ASN tasks
  });
}

// ❌ WRONG: Accessing response directly
const tasks = response;  // This is { ok: true, data: [...] }
```

---

## Step 4: Filtering Logic in Mobile App

### 4.1 Tab-Based Filtering

**Implementation:**
```typescript
async function fetchPutawayTasks(activeTab: 'All' | 'ASN' | 'TransferIn') {
  const params: any = {
    status: 'Draft,Open,In Progress'  // Always include Open for TransferIn
  };

  // Apply source_type filter based on active tab
  if (activeTab === 'ASN') {
    params.source_type = 'ASN';
  } else if (activeTab === 'TransferIn') {
    params.source_type = 'TransferIn';
  }
  // For 'All' tab, don't set source_type (returns all types)

  const response = await api.get('/api/putaway/tasks', { params });
  
  if (response.ok && response.data) {
    return response.data;
  }
  
  return [];
}
```

### 4.2 Client-Side Filtering (Alternative)

If you prefer to fetch all tasks and filter client-side:

```typescript
// Fetch all tasks once
const allTasks = await fetchPutawayTasks('All');

// Filter client-side
const asnTasks = allTasks.filter(t => t.source_type === 'ASN');
const transferInTasks = allTasks.filter(t => t.source_type === 'TransferIn');
```

---

## Step 5: Desktop App (WMS Desktop) - Verify

The Desktop app should use the same API endpoints. Check:

1. **PutawayTaskListView** - Should call `/api/putaway/tasks` with proper filters
2. **Response handling** - Should access `response.data` array
3. **Filtering** - Should support filtering by `source_type`

---

## Step 6: Testing Checklist

### 6.1 Backend API Tests

```bash
# Test 1: All tasks (ASN + TransferIn)
curl "http://192.168.1.2:3000/api/putaway/tasks?status=Draft,Open,In Progress" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Returns both ASN and TransferIn tasks

# Test 2: Only ASN
curl "http://192.168.1.2:3000/api/putaway/tasks?source_type=ASN&status=Draft,Open,In Progress" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Returns only ASN tasks

# Test 3: Only TransferIn
curl "http://192.168.1.2:3000/api/putaway/tasks?source_type=TransferIn&status=Open,In Progress" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Returns only TransferIn tasks

# Test 4: Both types explicitly
curl "http://192.168.1.2:3000/api/putaway/tasks?source_type=ASN,TransferIn&status=Draft,Open,In Progress" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Returns both ASN and TransferIn tasks
```

### 6.2 Mobile App Tests

1. **All Tab:**
   - Should show both ASN and TransferIn tasks
   - Should exclude Completed tasks
   - Should show tasks with status: Draft, Open, In Progress

2. **ASN Tab:**
   - Should show only ASN tasks
   - Should exclude TransferIn tasks
   - Should exclude Completed tasks

3. **Transfer In Tab:**
   - Should show only TransferIn tasks
   - Should exclude ASN tasks
   - Should exclude Completed tasks
   - Should include tasks with status "Open"

---

## Step 7: Common Issues and Solutions

### Issue 1: TransferIn Tasks Not Showing

**Symptom:** TransferIn tab shows "No tasks available" but tasks exist in database

**Root Cause:** Status filter missing "Open"

**Solution:**
```typescript
// ❌ WRONG
status: 'Draft,In Progress'  // Missing "Open"

// ✅ CORRECT
status: 'Draft,Open,In Progress'  // Includes "Open"
```

---

### Issue 2: All Tab Only Shows ASN

**Symptom:** All tab shows ASN tasks but not TransferIn

**Root Cause:** Status filter missing "Open" OR source_type filter is set to "ASN"

**Solution:**
```typescript
// ❌ WRONG
params: {
  source_type: 'ASN',  // This filters out TransferIn
  status: 'Draft,In Progress'  // Missing "Open"
}

// ✅ CORRECT
params: {
  // No source_type = returns all types
  status: 'Draft,Open,In Progress'  // Includes "Open"
}
```

---

### Issue 3: Response Format Mismatch

**Symptom:** API returns data but mobile app shows empty list

**Root Cause:** Accessing wrong response property

**Solution:**
```typescript
// ❌ WRONG
const tasks = response;  // This is { ok: true, data: [...] }

// ✅ CORRECT
const tasks = response.data;  // This is the array of tasks
```

---

## Step 8: Summary of Required Changes

### Backend API: ✅ **NO CHANGES NEEDED**
- Already supports comma-separated status values
- Already supports comma-separated source_type values
- Already returns TransferIn tasks correctly
- Already excludes Completed tasks by default

### Mobile App: ⚠️ **CHANGES REQUIRED**

1. **Update "All" Tab:**
   - Add "Open" to status filter: `status: 'Draft,Open,In Progress'`
   - Remove or don't set `source_type` parameter

2. **Update "ASN" Tab:**
   - Keep `source_type: 'ASN'`
   - Add "Open" to status filter: `status: 'Draft,Open,In Progress'`

3. **Update "Transfer In" Tab:**
   - Keep `source_type: 'TransferIn'`
   - **CRITICAL:** Add "Open" to status filter: `status: 'Open,In Progress'`
   - OR remove status filter entirely (API defaults to exclude Completed)

4. **Response Handling:**
   - Ensure accessing `response.data` (not `response` directly)
   - Check `response.ok === true` before processing

### Desktop App: ⚠️ **VERIFY**

1. Check if using same API endpoints
2. Verify response format handling
3. Ensure filters match mobile app logic

---

## Step 9: Verification Script

Create a test script to verify all scenarios:

```javascript
// test-putaway-api.js
const API_BASE = 'http://192.168.1.2:3000';
const TOKEN = 'YOUR_TOKEN';

async function testPutawayAPI() {
  const tests = [
    {
      name: 'All Tab - All Tasks',
      url: '/api/putaway/tasks?status=Draft,Open,In Progress',
      expected: 'Should return both ASN and TransferIn tasks'
    },
    {
      name: 'ASN Tab - ASN Only',
      url: '/api/putaway/tasks?source_type=ASN&status=Draft,Open,In Progress',
      expected: 'Should return only ASN tasks'
    },
    {
      name: 'TransferIn Tab - TransferIn Only',
      url: '/api/putaway/tasks?source_type=TransferIn&status=Open,In Progress',
      expected: 'Should return only TransferIn tasks'
    }
  ];

  for (const test of tests) {
    const response = await fetch(`${API_BASE}${test.url}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    const data = await response.json();
    
    console.log(`\n${test.name}:`);
    console.log(`  Expected: ${test.expected}`);
    console.log(`  Found: ${data.data?.length || 0} tasks`);
    console.log(`  Tasks:`, data.data?.map(t => ({
      title: t.title,
      source_type: t.source_type,
      status: t.status
    })));
  }
}

testPutawayAPI();
```

---

## Conclusion

**Backend API Status:** ✅ **WORKING CORRECTLY**

**Mobile App Status:** ⚠️ **NEEDS UPDATES**

The backend is already returning TransferIn tasks correctly. The mobile app needs to:
1. Include "Open" in status filter for TransferIn tab
2. Ensure "All" tab doesn't filter by source_type
3. Properly handle response.data array

Once these changes are made in the mobile app, TransferIn tasks will appear correctly in all tabs.
