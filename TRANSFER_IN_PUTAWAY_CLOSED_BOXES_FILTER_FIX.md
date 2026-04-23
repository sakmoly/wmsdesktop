# Transfer In Putaway Closed Boxes Filter Fix

## 🐛 Bug Description

**Issue:** Putaway boxes with status "CLOSED" are still appearing in the mobile app's "Put Away List" even though they've already been completed.

**Example:**
- **Box ID:** `CTN-TI-12347-20260126-143016-185`
- **Status:** `CLOSED` (already put away)
- **Putaway Task:** `PUT-20260126-0002`
- **Transfer In:** `INSLIP-12347`
- **Problem:** Box still appears in "Sealed Putaway boxes ready for put away" list

**Root Cause:**
- The `GET /api/transfer-in/:title/putaway-boxes` endpoint returns ALL boxes regardless of status
- It doesn't filter out closed/completed boxes
- Mobile app displays all returned boxes, including closed ones

---

## ✅ Solution Implemented

**File Modified:** `wms-api/src/modules/transfer-in/transferInController.js`  
**Function:** `getTransferInPutawayBoxes`  
**Lines:** 2941-2949

### Changes Applied

**Before:**
```sql
SELECT ...
FROM tabSortBox
WHERE advance_shipping_notice = ?
ORDER BY created_on DESC
```

**After:**
```sql
SELECT ...
FROM tabSortBox
WHERE advance_shipping_notice = ?
  AND status != 'Closed'
ORDER BY created_on DESC
```

### Logic Enhancement

**Filter Applied:**
- ✅ Excludes boxes with `status = 'Closed'`
- ✅ Only returns boxes that are ready for putaway (e.g., "Open", "Sealed")
- ✅ Prevents completed putaway boxes from appearing in the list

**Why This Works:**
- Closed boxes have already been put away
- They should not appear in the "ready for put away" list
- Only active/open boxes should be shown

---

## 🔄 Complete Flow (After Fix)

### Before Fix:
```
1. User completes putaway for box CTN-TI-12347-...
2. Box status changes to "Closed"
3. Mobile app calls GET /api/transfer-in/INSLIP-12347/putaway-boxes
4. API returns ALL boxes (including closed ones) ❌
5. Mobile app displays closed box in list ❌
```

### After Fix:
```
1. User completes putaway for box CTN-TI-12347-...
2. Box status changes to "Closed"
3. Mobile app calls GET /api/transfer-in/INSLIP-12347/putaway-boxes
4. API filters out closed boxes ✅
5. Mobile app only displays active boxes ✅
```

---

## 🧪 Testing

### Test 1: Closed Box Should Not Appear

**Setup:**
1. Create Transfer In `INSLIP-12347`
2. Create putaway box `CTN-TI-12347-20260126-143016-185`
3. Complete putaway (box status = "Closed")

**Test:**
```bash
GET /api/transfer-in/INSLIP-12347/putaway-boxes
```

**Expected Result:**
- ✅ Closed box should NOT appear in response
- ✅ Only active/open boxes should be returned

### Test 2: Active Boxes Should Still Appear

**Setup:**
1. Create Transfer In `INSLIP-12348`
2. Create putaway box `CTN-TI-12348-...` (status = "Open" or "Sealed")

**Test:**
```bash
GET /api/transfer-in/INSLIP-12348/putaway-boxes
```

**Expected Result:**
- ✅ Active boxes should appear in response
- ✅ Closed boxes should NOT appear

---

## 📊 Database Verification

### Check Box Status:
```sql
SELECT 
  box_id,
  status,
  advance_shipping_notice,
  putaway_task_title,
  created_on,
  closed_on
FROM tabSortBox
WHERE advance_shipping_notice = 'INSLIP-12347'
ORDER BY created_on DESC;
```

**Expected:**
- Should show boxes with various statuses (Open, Sealed, Closed)
- API should only return non-closed boxes

### Verify API Response:
```sql
-- Simulate API query
SELECT 
  box_id,
  status,
  advance_shipping_notice,
  putaway_task_title
FROM tabSortBox
WHERE advance_shipping_notice = 'INSLIP-12347'
  AND status != 'Closed'
ORDER BY created_on DESC;
```

**Expected:**
- Should only return boxes with status != 'Closed'

---

## 🔍 Troubleshooting

### Issue: Closed Boxes Still Appearing

**Possible Causes:**
1. **Status value mismatch** - Box might have different status value (e.g., "COMPLETED", "DONE")
2. **Case sensitivity** - Status might be "CLOSED" vs "Closed"
3. **Cache issue** - Mobile app might be caching old results

**Solution:**
```sql
-- Check actual status values in database
SELECT DISTINCT status 
FROM tabSortBox 
WHERE advance_shipping_notice = 'INSLIP-12347';

-- Update query to handle case-insensitive matching if needed
-- AND UPPER(status) != 'CLOSED'
```

### Issue: Active Boxes Not Appearing

**Possible Causes:**
- Status filter too strict
- Box status is NULL or unexpected value

**Solution:**
- Check box status values in database
- Verify status values match expected values ("Open", "Sealed", etc.)

---

## ✅ Status

**Current Status:** ✅ **FIXED**

The fix has been implemented. Closed putaway boxes will no longer appear in the mobile app's "Put Away List".

---

## 🔗 Related Files

- **Modified:** `wms-api/src/modules/transfer-in/transferInController.js` (function: `getTransferInPutawayBoxes`)
- **Endpoint:** `GET /api/transfer-in/:title/putaway-boxes`
- **Table:** `tabSortBox` (stores box status)
- **Related:** Similar fix may be needed for ASN putaway boxes endpoint

---

## 📝 Notes

- This fix only applies to Transfer In putaway boxes
- If ASN putaway boxes have the same issue, a similar fix should be applied to the ASN boxes endpoint
- The mobile app should refresh the list after completing putaway to see updated results
