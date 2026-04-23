# ASN Completed Putaway Filter Fix

## 🐛 Issue

**Problem:** ASNs that have completed putaway are still showing in the StartInbound screen, allowing users to start new inbound sessions for already completed ASNs.

**Example:**
- ASN-365425487 has completed putaway (all putaway tasks are "Completed")
- ASN still appears in StartInbound screen
- User can scan/select the ASN even though it's already done

**Expected Behavior:**
- ASNs with completed putaway should **NOT** appear in StartInbound screen
- Only ASNs that haven't completed putaway should be available

---

## ✅ Solution Implemented

**File Modified:** `wms-api/src/modules/master/masterController.js`  
**Function:** `getAllAsns` (GET `/api/master/asns`)

### Changes Applied

1. **Added Putaway Completion Check**
   - Checks if `tabPutawayTask` table exists
   - Verifies required columns exist (`status`, `advance_shipping_notice`)
   - Joins with putaway tasks to check completion status

2. **Filter Logic**
   - **Excludes ASNs** where all putaway tasks have `status = 'Completed'`
   - **Includes ASNs** where:
     - No putaway tasks exist (ASN hasn't been put away yet)
     - Some putaway tasks are not completed (still in progress)
     - All putaway tasks are not completed

3. **SQL Query Enhancement**
   ```sql
   LEFT JOIN (
     SELECT 
       advance_shipping_notice,
       COUNT(*) as total_tasks,
       SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_tasks
     FROM tabPutawayTask
     WHERE advance_shipping_notice IS NOT NULL
     GROUP BY advance_shipping_notice
   ) pt ON a.title = pt.advance_shipping_notice
   WHERE (pt.advance_shipping_notice IS NULL 
          OR pt.total_tasks = 0 
          OR pt.completed_tasks < pt.total_tasks)
   ```

---

## 🔄 How It Works

### Before Fix:
```
GET /api/master/asns
Returns: All ASNs regardless of putaway status
- ASN-365425487 (completed putaway) ✅ Shows
- ASN-365425488 (not started) ✅ Shows
- ASN-365425489 (in progress) ✅ Shows
```

### After Fix:
```
GET /api/master/asns
Returns: Only ASNs that haven't completed putaway
- ASN-365425487 (completed putaway) ❌ Filtered out
- ASN-365425488 (not started) ✅ Shows
- ASN-365425489 (in progress) ✅ Shows
```

### Completion Detection:
An ASN is considered "completed putaway" when:
- **All** putaway tasks for that ASN have `status = 'Completed'`
- **AND** there is at least one putaway task (if no tasks exist, ASN is not completed)

---

## 🧪 Testing

### Test 1: Verify Completed ASN is Filtered

**Setup:**
1. Create an ASN (e.g., ASN-365425487)
2. Complete putaway for all items
3. All putaway tasks should have `status = 'Completed'`

**Test:**
```bash
GET /api/master/asns
```

**Expected Result:**
- ASN-365425487 should **NOT** appear in the response
- Only ASNs with incomplete putaway should appear

### Test 2: Verify Incomplete ASN Still Shows

**Setup:**
1. Create an ASN (e.g., ASN-365425488)
2. Start putaway but don't complete all tasks
3. Some putaway tasks should have `status != 'Completed'`

**Test:**
```bash
GET /api/master/asns
```

**Expected Result:**
- ASN-365425488 **SHOULD** appear in the response
- ASN is still available for inbound/putaway operations

### Test 3: Verify ASN Without Putaway Tasks Shows

**Setup:**
1. Create an ASN (e.g., ASN-365425489)
2. No putaway tasks created yet

**Test:**
```bash
GET /api/master/asns
```

**Expected Result:**
- ASN-365425489 **SHOULD** appear in the response
- ASN is available for inbound operations

---

## 📊 Database Verification

### Check Putaway Task Status for ASN:
```sql
SELECT 
  advance_shipping_notice,
  status,
  COUNT(*) as task_count
FROM tabPutawayTask
WHERE advance_shipping_notice = 'ASN-365425487'
GROUP BY advance_shipping_notice, status;
```

**Expected for Completed ASN:**
- All tasks should have `status = 'Completed'`
- `completed_tasks = total_tasks`

**Expected for Incomplete ASN:**
- Some tasks should have `status != 'Completed'`
- `completed_tasks < total_tasks`

---

## 🔍 Troubleshooting

### Issue: Completed ASN Still Showing

**Possible Causes:**
1. **Putaway tasks not marked as Completed** - Check task status
2. **Multiple putaway tasks with different statuses** - Some may be completed, others not
3. **Table/column doesn't exist** - Check if `tabPutawayTask` table exists

**Solution:**
```sql
-- Check putaway task status
SELECT 
  advance_shipping_notice,
  status,
  COUNT(*) as count
FROM tabPutawayTask
WHERE advance_shipping_notice = 'ASN-365425487'
GROUP BY advance_shipping_notice, status;

-- Manually mark all tasks as Completed if needed
UPDATE tabPutawayTask
SET status = 'Completed'
WHERE advance_shipping_notice = 'ASN-365425487'
  AND status != 'Completed';
```

### Issue: Incomplete ASN Not Showing

**Possible Causes:**
1. **All tasks are Completed** - Check if tasks are actually incomplete
2. **No putaway tasks exist** - ASN should still show (not filtered)

**Solution:**
```sql
-- Check if ASN has putaway tasks
SELECT COUNT(*) 
FROM tabPutawayTask 
WHERE advance_shipping_notice = 'ASN-365425488';

-- If no tasks, ASN should appear in list
-- If tasks exist, check their status
```

---

## 📋 Alternative Solutions

### Option 1: Add `putaway_completed` Flag (Not Implemented)

Instead of filtering, add a flag to indicate completion status:

```json
{
  "asn_no": "ASN-365425487",
  "status": "Submitted",
  "putaway_completed": true,  // ← New field
  ...
}
```

**Pros:**
- Mobile app can decide whether to show/hide
- More flexible (can show with different styling)

**Cons:**
- Requires mobile app changes
- More complex logic

### Option 2: Sync and Delete (Not Recommended)

**Not Recommended** because:
- Deleting ASNs loses audit trail
- Historical data is important
- Better to filter than delete

---

## ✅ Status

**Current Status:** ✅ **FIXED**

The fix has been implemented. Completed ASNs will now be automatically filtered out from the `/api/master/asns` endpoint, so they won't appear in the StartInbound screen.

---

## 🔗 Related Files

- **Modified:** `wms-api/src/modules/master/masterController.js` (function: `getAllAsns`)
- **API Endpoint:** `GET /api/master/asns`
- **Table:** `tabPutawayTask` (for completion check)
- **Table:** `tabAdvanceShippingNotice` (ASN master data)

---

## 📝 Notes

- The filter only applies if `tabPutawayTask` table exists
- If the table doesn't exist, all ASNs are returned (backward compatible)
- The filter checks if **all** tasks are completed (not just some)
- ASNs without putaway tasks are still included (they haven't been put away yet)
