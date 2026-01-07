# Putaway Remaining Items Fix

## Problem

For ASN-AAA, items that were **NOT in Transfer Orders** are not showing in Putaway screen.

### Root Cause

1. **Routing Logic Issue:**
   - When ASN has a Transfer Order → Items route to Sorting (no putaway task created)
   - After sorting, remaining items should go to Putaway
   - But `RouteRemainingItemsToPutawayAsync()` was:
     - Not called automatically
     - Creating tasks for ALL items instead of remaining items only

2. **Task Creation Bug:**
   - `CreatePutawayTaskFromAsnAsync()` creates tasks for ALL ASN items
   - It doesn't exclude items that were already sorted to Transfer Orders

---

## Solution Implemented

### 1. ✅ Fixed C# Code - Create Tasks for Remaining Items Only

**File:** `Services/PutawayTaskDataService.cs`

**New Method:** `CreatePutawayTaskForRemainingItemsAsync()`
- Only creates putaway lines for items NOT sorted to Transfer Orders
- Calculates: ASN Total Qty - Sorted Qty (from SORT_TO_BOX events)
- Creates task only for remaining items

**Updated Method:** `ReceivingRoutingService.RouteRemainingItemsToPutawayAsync()`
- Now calls `CreatePutawayTaskForRemainingItemsAsync()` instead of `CreatePutawayTaskFromAsnAsync()`
- Passes only remaining items dictionary

### 2. ✅ Added API Endpoint - Manual Trigger

**New Endpoint:** `POST /api/putaway/create-task-for-remaining-items`

**Purpose:** Manually create putaway tasks for remaining items

**Request:**
```json
{
  "asn_no": "ASN-AAA"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Putaway task created for remaining items",
  "data": {
    "putaway_task": "PUT-20250120-0001",
    "asn_no": "ASN-AAA",
    "remaining_items_count": 3,
    "items_added": 3,
    "items": [
      {
        "item_code": "SKU-001",
        "carton_id": "CTN-001",
        "qty": 25.0
      }
    ],
    "is_new_task": true
  }
}
```

---

## How to Fix ASN-AAA

### Option 1: Use API Endpoint (Recommended)

Call the API to create putaway task for remaining items:

```bash
POST /api/putaway/create-task-for-remaining-items
{
  "asn_no": "ASN-AAA"
}
```

This will:
1. Calculate remaining items (ASN items - Sorted items)
2. Create or update putaway task
3. Add only remaining items to putaway lines

### Option 2: Desktop App Integration

The desktop app can call `ReceivingRoutingService.RouteRemainingItemsToPutawayAsync()` after sorting is complete.

**Code:**
```csharp
await ReceivingRoutingService.RouteRemainingItemsToPutawayAsync(
    settings, 
    "ASN-AAA");
```

---

## How It Works

### Calculation Logic:

1. **Get ASN Items:**
   ```sql
   SELECT item_code, carton_id, shipped_qty
   FROM tabAsnItemDetails
   WHERE parent_title = 'ASN-AAA'
   ```

2. **Get Sorted Items:**
   ```sql
   SELECT item_code, carton_id, SUM(qty) as sorted_qty
   FROM tabWmsScanEvent
   WHERE advance_shipping_notice = 'ASN-AAA'
     AND event_type = 'SORT_TO_BOX'
   GROUP BY item_code, carton_id
   ```

3. **Calculate Remaining:**
   ```
   Remaining Qty = ASN Shipped Qty - Sorted Qty
   ```

4. **Create Putaway Task:**
   - Only for items where Remaining Qty > 0
   - Creates putaway lines with remaining quantities

---

## Testing

### Check Remaining Items:

```bash
GET /api/putaway/remaining-items?asn=ASN-AAA
```

### Create Putaway Task:

```bash
POST /api/putaway/create-task-for-remaining-items
{
  "asn_no": "ASN-AAA"
}
```

### Verify Putaway Task:

```bash
GET /api/putaway/tasks?advance_shipping_notice=ASN-AAA
```

---

## Files Modified

1. ✅ `Services/PutawayTaskDataService.cs`
   - Added `CreatePutawayTaskForRemainingItemsAsync()` method
   - Added `AddRemainingItemsToTaskAsync()` helper method

2. ✅ `Services/ReceivingRoutingService.cs`
   - Updated `RouteRemainingItemsToPutawayAsync()` to use new method

3. ✅ `wms-api/src/modules/putaway/putawayController.js`
   - Added `createTaskForRemainingItems()` function

4. ✅ `wms-api/src/routes/putawayRoutes.js`
   - Added route: `POST /api/putaway/create-task-for-remaining-items`

---

## Summary

✅ **Fixed:** Putaway tasks now only include remaining items (not sorted to TO)
✅ **API Added:** Manual endpoint to create tasks for remaining items
✅ **Logic Fixed:** C# code now correctly calculates and creates tasks for remaining items only

**For ASN-AAA:**
- Call `POST /api/putaway/create-task-for-remaining-items` with `{"asn_no": "ASN-AAA"}`
- This will create a putaway task with only the items that were NOT sorted to Transfer Orders
- The task will appear in the desktop Putaway screen

