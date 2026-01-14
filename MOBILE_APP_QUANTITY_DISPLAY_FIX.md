# Mobile App Quantity Display Fix

## Issue

**Desktop App:** Shows correct total quantity = **10** (sum of all events)  
**Mobile App:** Shows quantity = **2** (shows "Quantity changed from 1 to 2")

## Root Cause

The mobile app is displaying the **incremental change** (1 → 2) instead of the **total quantity** from all events.

### Database Verification

**Transfer Carton:** `TC-MR-123459-1768157787512`  
**Item:** `SKU-HAT-301-BLU-OS`

**Events in Database:**
```
1. PACK_ITEM_TO_TC | qty: 1.00 | time: 2026-01-12 13:31:57
2. PACK_ITEM_TO_TC | qty: 1.00 | time: 2026-01-12 13:31:57
3. PACK_ITEM_TO_TC | qty: 1.00 | time: 2026-01-12 13:30:44
4. PACK_ITEM_TO_TC | qty: 1.00 | time: 2026-01-12 13:25:32
5. PACK_ITEM_TO_TC | qty: 1.00 | time: 2026-01-12 13:25:32
6. PACK_ITEM_TO_TC | qty: 1.00 | time: 2026-01-12 13:15:44
7. PACK_ITEM_TO_TC | qty: 1.00 | time: 2026-01-12 13:07:50
8. PACK_ITEM_TO_TC | qty: 1.00 | time: 2026-01-12 13:01:14
9. PACK_ITEM_TO_TC | qty: 2.00 | time: 2026-01-11 21:56:00
```

**Total:** 8 × 1.00 + 1 × 2.00 = **10.00** ✅ (Desktop shows this correctly)

## Required Fix: Mobile App

### Option 1: Query Backend API (Recommended)

The mobile app should query the backend API to get the **total quantity** (sum of all events):

```javascript
// After scanning an item, query the backend to get total quantity
const response = await fetch(
  `${API_URL}/api/transfer-cartons/${tc_id}`,
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

const data = await response.json();
const item = data.data.contents.find(c => c.item_code === scannedItemCode);

if (item) {
  // Display total quantity from backend
  displayQuantity(item.qty); // This will be 10 (sum of all events)
}
```

### Option 2: Calculate Total from Local Events

If the mobile app stores events locally, it should **sum all events** for the same item:

```javascript
// Calculate total quantity from all local events
const totalQty = scannedItems
  .filter(item => item.item_code === scannedItemCode)
  .reduce((sum, item) => sum + item.qty, 0);

// Display total quantity
displayQuantity(totalQty); // Should be 10 (sum of all scans)
```

### Current Mobile App Behavior (Incorrect)

```javascript
// ❌ WRONG: Showing only the last scan's quantity
const lastScan = scannedItems[scannedItems.length - 1];
displayQuantity(lastScan.qty); // Shows 2 (only the last scan)

// ❌ WRONG: Showing incremental change
displayQuantity(previousQty + currentQty); // Shows 1 + 1 = 2
```

## Backend API Response

The backend API (`GET /api/transfer-cartons/{tc_id}`) correctly returns:

```json
{
  "ok": true,
  "data": {
    "tc_id": "TC-MR-123459-1768157787512",
    "contents": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "source_carton": "PAW-ASN365425473-1768138301111",
        "qty": 10.00,  // ✅ Correctly summed from all events
        "packed_by": "USER-150526",
        "packed_on": "2026-01-12T13:31:57.000Z"
      }
    ]
  }
}
```

## Summary

- ✅ **Backend:** Correctly stores all events and sums quantities
- ✅ **Desktop App:** Correctly displays total quantity (10)
- ❌ **Mobile App:** Incorrectly displays incremental quantity (2)

**Fix Required:** Mobile app must display the **total quantity** (sum of all events), not the incremental change.

---

**Status:** ⚠️ **MOBILE APP FIX REQUIRED**  
**Date:** 2026-01-12  
**Priority:** High
