# ASN Putaway List Empty on Mobile - Fix Summary

**Date**: 2026-01-21  
**Status**: ✅ **BACKEND FIXED** | ⚠️ **MOBILE APP CHANGE NEEDED**

---

## 🚨 Problem

Mobile app shows "No putaway tasks available" even though:
- ✅ Backend has 2 Open ASN tasks (`PUT-20260121-0004`, `PUT-20260121-0003`)
- ✅ Tasks have correct `source_type = 'ASN'`
- ✅ Tasks have putaway lines (items)
- ✅ API returns tasks correctly when queried directly

---

## 🔍 Root Cause

**Issue**: Mobile app is filtering by "Current ASN" (`ASN-365425479`) shown on screen, but the Open tasks are for a different ASN (`ASN-365425480`).

**Evidence**:
- Mobile app screen shows: "Current ASN: ASN-365425479"
- Open tasks in database: `ASN-365425480`
- API test with `advance_shipping_notice=ASN-365425479`: Returns 0 tasks
- API test with `advance_shipping_notice=ASN-365425480`: Returns 2 tasks

**When "All" tab is selected**, the mobile app should NOT filter by ASN, but it appears to be doing so.

---

## ✅ Backend Fixes Applied

### 1. Fixed `source_type` for ASN Boxes

**File**: `wms-api/src/modules/boxes/boxController.js`

**Change**: When closing an ASN box, set `source_type = 'ASN'` instead of `'Box'`.

```javascript
// Determine source_type: If box has ASN, use 'ASN', otherwise use 'Box'
const sourceType = box.asn_no ? 'ASN' : 'Box';
```

**Result**: New ASN boxes will create putaway tasks with `source_type = 'ASN'`.

---

### 2. Updated Existing Tasks

**Script**: `wms-api/fix-asn-box-source-type.js`

**Action**: Updated 3 existing tasks from `source_type = 'Box'` to `source_type = 'ASN'`:
- `PUT-20260121-0004` (ASN: ASN-365425480)
- `PUT-20260121-0003` (ASN: ASN-365425480)
- `PUT-20260121-0002` (ASN: ASN-365425479) - Completed

**Result**: All ASN box tasks now have correct `source_type`.

---

## 📱 Mobile App Changes Required

### Issue: ASN Filter Applied When "All" Tab Selected

**Problem**: When "All" tab is selected, the mobile app should show ALL putaway tasks regardless of ASN, but it appears to be filtering by the "Current ASN" shown on screen.

**Solution**: Update mobile app to:
1. **When "All" tab is selected**: Do NOT send `advance_shipping_notice` parameter in API request
2. **When "ASN" tab is selected**: Send `advance_shipping_notice` parameter with current ASN
3. **When "Transfer In" tab is selected**: Send `source_type=TransferIn` parameter

---

## 🧪 API Testing Results

### Test 1: No Filters (Should Return All Open Tasks)
```http
GET /api/putaway/tasks?status=Open
```
**Result**: ✅ Returns 2 tasks

### Test 2: Filter by ASN-365425479 (Current ASN on Mobile)
```http
GET /api/putaway/tasks?status=Open&advance_shipping_notice=ASN-365425479
```
**Result**: ❌ Returns 0 tasks (tasks are for ASN-365425480)

### Test 3: Filter by ASN-365425480 (Tasks' ASN)
```http
GET /api/putaway/tasks?status=Open&advance_shipping_notice=ASN-365425480
```
**Result**: ✅ Returns 2 tasks

### Test 4: Filter by source_type=ASN
```http
GET /api/putaway/tasks?status=Open&source_type=ASN
```
**Result**: ✅ Returns 2 tasks

---

## 📋 Current Database State

**Open ASN Tasks**:
- `PUT-20260121-0004`
  - Status: `Open`
  - Source Type: `ASN` ✅
  - ASN: `ASN-365425480`
  - Items: 2 (SKU-HAT-301-BLU-OS, SKU-HAT-301-GRN-OS)

- `PUT-20260121-0003`
  - Status: `Open`
  - Source Type: `ASN` ✅
  - ASN: `ASN-365425480`
  - Items: 2 (SKU-HAT-301-BLU-OS, SKU-HAT-301-GRN-OS)

---

## ✅ Verification Checklist

- [x] ✅ Backend creates putaway tasks with `source_type = 'ASN'` for ASN boxes
- [x] ✅ Existing tasks updated to have `source_type = 'ASN'`
- [x] ✅ API returns tasks correctly when queried without ASN filter
- [x] ✅ API returns tasks correctly when queried with `source_type=ASN`
- [ ] ⚠️ **Mobile app needs to stop filtering by ASN when "All" tab is selected**

---

## 🔧 Next Steps

1. **Mobile App Fix**: Update putaway task list to:
   - When "All" tab selected: Call `GET /api/putaway/tasks?status=Open` (no ASN filter)
   - When "ASN" tab selected: Call `GET /api/putaway/tasks?status=Open&source_type=ASN` (no ASN filter, or filter by current ASN if needed)
   - When "Transfer In" tab selected: Call `GET /api/putaway/tasks?status=Open&source_type=TransferIn`

2. **Test**: After mobile app fix, verify that:
   - "All" tab shows all Open tasks (regardless of ASN)
   - "ASN" tab shows all ASN tasks (regardless of specific ASN number)
   - "Transfer In" tab shows all Transfer In tasks

---

## 📝 Summary

- **Backend**: ✅ Fixed - All ASN box tasks now have `source_type = 'ASN'`
- **Mobile App**: ⚠️ Needs fix - Should not filter by ASN when "All" tab is selected
- **Root Cause**: Mobile app filtering by "Current ASN" (`ASN-365425479`) while tasks are for different ASN (`ASN-365425480`)
