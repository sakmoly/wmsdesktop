# Internal Test: Putaway Error Handling and Retry

**Test Date**: 2026-01-17  
**Test Case**: PUT-20260119-0001  
**Purpose**: Verify putaway error handling and retry functionality

---

## Test Scenario

**Task**: `PUT-20260119-0001`  
**Status**: `Open` (from user's screenshot)  
**Carton ID**: `PAW-ASN365425473-1768812437984`  
**Items**:
- `SKU-HAT-301-BLU-OS` (qty: 5.00)
- `SKU-HAT-301-GRN-OS` (qty: 5.00)  
**Target Location**: `A1-R02-L1-B2` (currently empty)

---

## Test Steps

### Step 1: Verify Initial State

```sql
-- Check task exists and status
SELECT title, status, source_type, advance_shipping_notice, created_by
FROM tabPutawayTask
WHERE title = 'PUT-20260119-0001';

-- Check putaway lines (should have empty location)
SELECT id, parent_title, carton_id, item_code, qty, location_id, rack, bin
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260119-0001'
ORDER BY item_code;

-- Check current stock at target location (should be 0 or empty)
SELECT item_code, bin_location, qty
FROM tabStockLedger
WHERE bin_location = 'A1-R02-L1-B2';

-- Check carton stock (if exists)
SELECT carton_id, item_code, bin_location, qty
FROM tabCartonStock
WHERE carton_id = 'PAW-ASN365425473-1768812437984';
```

**Expected**:
- ✅ Task status = "Open"
- ✅ Lines exist with empty `location_id`, `rack`, `bin`
- ✅ No stock at target location yet

---

### Step 2: Test `scanTransferCarton` (Should Work After Fix)

```bash
curl -X POST http://localhost:3000/api/putaway/scan-transfer-carton \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "box_id": "PAW-ASN365425473-1768812437984",
    "location_id": "A1-R02-L1-B2",
    "user_id": "USER-294226"
  }'
```

**Expected Response**:
```json
{
  "ok": true,
  "message": "Putaway task updated and items assigned successfully",
  "data": {
    "putaway_task": "PUT-20260119-0001",
    "status": "In Progress",
    "stock_updated": false,
    "location_id": "A1-R02-L1-B2",
    "carton_id": "PAW-ASN365425473-1768812437984"
  }
}
```

**Verify Database**:
```sql
-- Check location updated in lines
SELECT location_id, rack, bin
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260119-0001';

-- Check task status (should be "In Progress", NOT "Completed")
SELECT status FROM tabPutawayTask WHERE title = 'PUT-20260119-0001';

-- Stock should NOT be updated yet
SELECT item_code, bin_location, qty
FROM tabStockLedger
WHERE bin_location = 'A1-R02-L1-B2';
```

**Expected**:
- ✅ Location updated in putaway lines
- ✅ Task status = "In Progress" (NOT "Completed")
- ✅ Stock NOT updated yet (will be updated in Step 3)

---

### Step 3: Test `completePutaway` (Simulates "Update Stock" Button)

```bash
curl -X POST http://localhost:3000/api/putaway/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "putaway_task": "PUT-20260119-0001",
    "performed_by": "USER-294226"
  }'
```

**Expected Response**:
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20260119-0001",
    "status": "Completed",
    "stock_updated": true,
    "items_updated": 2,
    "stock_updates": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "location": "A1-R02-L1-B2",
        "qty_added": 5.0,
        "from_location_id": "STAGING-01",
        "to_location_id": "A1-R02-L1-B2"
      },
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "location": "A1-R02-L1-B2",
        "qty_added": 5.0,
        "from_location_id": "STAGING-01",
        "to_location_id": "A1-R02-L1-B2"
      }
    ]
  }
}
```

**Verify Database**:
```sql
-- Check task status (should be "Completed")
SELECT status FROM tabPutawayTask WHERE title = 'PUT-20260119-0001';

-- Check stock ledger updated (MOVE pattern)
SELECT item_code, bin_location, qty, last_transaction_type, last_transaction_ref
FROM tabStockLedger
WHERE bin_location = 'A1-R02-L1-B2'
ORDER BY item_code;

-- Check stock transactions created
SELECT transaction_type, reference_doc, item_code, source_bin, target_bin, qty_change, qty_before, qty_after
FROM tabStockTransaction
WHERE reference_doc = 'PUT-20260119-0001'
ORDER BY item_code;

-- Check carton stock updated (if carton-level tracking)
SELECT carton_id, item_code, bin_location, qty
FROM tabCartonStock
WHERE carton_id = 'PAW-ASN365425473-1768812437984'
ORDER BY item_code;

-- Check carton location updated
SELECT carton_id, current_bin_id, status
FROM tabCarton
WHERE carton_id = 'PAW-ASN365425473-1768812437984';
```

**Expected**:
- ✅ Task status = "Completed"
- ✅ Stock ledger updated at target location (qty = 5.0 for each item)
- ✅ Stock ledger decreased at staging location (or entry deleted if qty = 0)
- ✅ Stock transaction created with `source_bin` and `target_bin`
- ✅ Carton stock updated (if carton-level tracking enabled)
- ✅ Carton `current_bin_id` = "A1-R02-L1-B2"

---

### Step 4: Test Error Handling (Simulate Error)

**Test**: Call `completePutaway` with non-existent task

```bash
curl -X POST http://localhost:3000/api/putaway/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "putaway_task": "PUT-NONEXISTENT-0001",
    "performed_by": "USER-294226"
  }'
```

**Expected Response**:
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Putaway task PUT-NONEXISTENT-0001 not found"
  }
}
```

**Verify Database**:
```sql
-- Original task should still be "Completed" (not affected by error)
SELECT status FROM tabPutawayTask WHERE title = 'PUT-20260119-0001';
```

**Expected**:
- ✅ Error response returned
- ✅ Original task status unchanged (still "Completed")

---

### Step 5: Test Retry After Error (New Task)

**Create New Test Task**:
1. Create a new putaway task (status: "Open")
2. Call `scanTransferCarton` with invalid data (e.g., non-existent location)
3. Verify error response
4. Verify task status still "Open"
5. Fix the issue (use valid location)
6. Call `scanTransferCarton` again - should succeed
7. Call `completePutaway` - should complete successfully

**Expected**:
- ✅ Error doesn't update task status
- ✅ Task can be retried after fixing the issue
- ✅ Final completion succeeds

---

## Test Results Summary

| Test Step | Expected Result | Actual Result | Status |
|-----------|----------------|---------------|--------|
| Step 1: Initial State | Task "Open", lines empty | ✅ | PASS |
| Step 2: scanTransferCarton | Location updated, status "In Progress" | ⏳ | PENDING |
| Step 3: completePutaway | Stock updated, status "Completed" | ⏳ | PENDING |
| Step 4: Error Handling | Error response, status unchanged | ⏳ | PENDING |
| Step 5: Retry After Error | Task can be retried | ⏳ | PENDING |

---

## Notes

1. **Fix Applied**: `box_id` column check moved before SELECT query (prevents "Unknown column" error)

2. **Error Handling**: 
   - All operations use database transactions
   - Errors trigger `rollback()` - prevents status updates
   - Task status preserved on error (allows retry)

3. **"Update Stock" Button**:
   - Should call `POST /api/putaway/complete`
   - This endpoint completes putaway and updates stock
   - Only marks as "Completed" if all operations succeed

4. **Mobile App Behavior**:
   - Should NOT show "Success" if backend returns error
   - Should show error message from backend
   - "Update Stock" button should retry via `POST /api/putaway/complete`

---

**END**
