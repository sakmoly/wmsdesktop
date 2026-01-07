# Mobile App Changes for Remaining Items Putaway

## Summary

**Minimal changes required** - The mobile app can work with existing endpoints, but one **optional** new endpoint is available to manually trigger putaway task creation for remaining items.

---

## Current Mobile App Flow (No Changes Needed)

The mobile app **already has** all the necessary endpoints to handle remaining items putaway:

### 1. ✅ Get Putaway Tasks (Already Available)
```http
GET /api/putaway/tasks?status=Open&source_type=ASN&advance_shipping_notice=ASN-AAA
```

**Response:**
```json
[
  {
    "title": "PUT-20250120-0001",
    "status": "Open",
    "source_type": "ASN",
    "advance_shipping_notice": "ASN-AAA",
    "items": [
      {
        "item_code": "SKU-001",
        "qty": 25.0,
        "carton_id": "CTN-001",
        "rack": "TBD",
        "bin": "TBD"
      }
    ]
  }
]
```

**Mobile App Action:** 
- Display putaway tasks in the list
- User can select a task and perform putaway

### 2. ✅ Scan Transfer Carton/Box (Already Available)
```http
POST /api/putaway/scan-transfer-carton
```

**Request:**
```json
{
  "tc_id": "TC-001",
  "box_id": "BOX-WHMAIN-514364",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "user_id": "USER-001"
}
```

**Mobile App Action:**
- User scans box/carton and location
- API automatically creates/updates putaway task

### 3. ✅ Complete Putaway (Already Available)
```http
POST /api/putaway/complete
```

**Request:**
```json
{
  "putaway_task": "PUT-20250120-0001",
  "performed_by": "USER-001"
}
```

**Mobile App Action:**
- User completes putaway task
- Stock is updated automatically

---

## Optional: New Endpoint for Manual Task Creation

### NEW: Create Putaway Task for Remaining Items

**Endpoint:** `POST /api/putaway/create-task-for-remaining-items`

**Purpose:** Manually trigger creation of putaway tasks for remaining items (items not sorted to Transfer Orders)

**When to Use:**
- After sorting is complete
- When putaway tasks are not automatically created
- To ensure remaining items appear in putaway screen

**Request:**
```http
POST /api/putaway/create-task-for-remaining-items
Authorization: Bearer {token}
Content-Type: application/json
```

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

**Error Responses:**

**400 - ASN Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "ASN_NOT_FOUND",
    "message": "ASN ASN-AAA not found or has no items"
  }
}
```

**400 - No Inbound Session:**
```json
{
  "ok": false,
  "error": {
    "code": "NO_INBOUND_SESSION",
    "message": "No inbound session found for ASN ASN-AAA"
  }
}
```

**200 - No Remaining Items:**
```json
{
  "ok": true,
  "message": "No remaining items found. All items were sorted to transfer orders.",
  "data": {
    "asn_no": "ASN-AAA",
    "remaining_items_count": 0,
    "putaway_task": null
  }
}
```

---

## Recommended Mobile App Implementation

### Option 1: Automatic (Recommended - No Changes)

**Flow:**
1. After sorting is complete, mobile app calls:
   ```http
   GET /api/putaway/tasks?status=Open&source_type=ASN&advance_shipping_notice=ASN-AAA
   ```
2. If tasks exist → Display them
3. If no tasks → Show message: "No putaway tasks available. Remaining items will be created automatically."

**Advantage:** No code changes needed. Desktop app or backend will create tasks automatically.

---

### Option 2: Manual Trigger (Optional Enhancement)

**Flow:**
1. After sorting is complete, mobile app calls:
   ```http
   POST /api/putaway/create-task-for-remaining-items
   {
     "asn_no": "ASN-AAA"
   }
   ```
2. If successful → Refresh putaway tasks list
3. Display newly created tasks

**Advantage:** Ensures putaway tasks are created immediately after sorting.

**Implementation Example:**
```javascript
// After sorting is complete
async function createPutawayForRemainingItems(asnNo) {
  try {
    const response = await fetch('/api/putaway/create-task-for-remaining-items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asn_no: asnNo
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      if (result.data.remaining_items_count > 0) {
        // Show success message
        showMessage(`Putaway task created: ${result.data.putaway_task}`);
        // Refresh putaway tasks list
        refreshPutawayTasks();
      } else {
        // No remaining items
        showMessage('All items were sorted to transfer orders.');
      }
    } else {
      // Handle error
      showError(result.error.message);
    }
  } catch (error) {
    showError('Failed to create putaway task');
  }
}
```

---

## Mobile App UI Flow

### Scenario: ASN with Transfer Order (Some Items to Showroom, Some to Warehouse)

**Step 1: After Sorting Complete**
- Mobile app shows: "Sorting complete. Checking for remaining items..."

**Step 2: Check Remaining Items (Optional)**
```http
GET /api/putaway/remaining-items?asn=ASN-AAA
```

**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "item_code": "SKU-001",
      "carton_id": "CTN-001",
      "remaining_qty": 25.0,
      "asn_no": "ASN-AAA"
    }
  ]
}
```

**Step 3: Create Putaway Task (Optional)**
```http
POST /api/putaway/create-task-for-remaining-items
{
  "asn_no": "ASN-AAA"
}
```

**Step 4: View Putaway Tasks**
```http
GET /api/putaway/tasks?status=Open&source_type=ASN&advance_shipping_notice=ASN-AAA
```

**Step 5: Perform Putaway**
- User selects putaway task
- Scans box/carton and location
- Completes putaway

---

## Summary of Changes

### ✅ No Changes Required (Current Flow)
- Mobile app can continue using existing endpoints
- `GET /api/putaway/tasks` - Get putaway tasks
- `POST /api/putaway/scan-transfer-carton` - Scan box/carton
- `POST /api/putaway/complete` - Complete putaway

### 🔄 Optional Enhancement
- Add call to `POST /api/putaway/create-task-for-remaining-items` after sorting
- This ensures putaway tasks are created immediately
- Can be added as a "Create Putaway Task" button in the UI

### 📱 UI Suggestions

**Option A: Automatic (No Button)**
- After sorting, automatically check for putaway tasks
- If tasks exist, show them
- If not, show message: "No remaining items for putaway"

**Option B: Manual Button**
- Add "Create Putaway Task" button after sorting
- User clicks button → Calls API → Shows result
- Then refreshes putaway tasks list

---

## Testing Checklist

- [ ] Test `GET /api/putaway/tasks` with ASN filter
- [ ] Test `POST /api/putaway/create-task-for-remaining-items` with valid ASN
- [ ] Test `POST /api/putaway/create-task-for-remaining-items` with ASN that has no remaining items
- [ ] Test `POST /api/putaway/create-task-for-remaining-items` with invalid ASN
- [ ] Verify putaway tasks appear after creation
- [ ] Test complete putaway workflow with remaining items

---

## Files Modified (Backend Only)

✅ **No mobile app code changes required** - All endpoints are ready to use.

**Backend Files:**
- `wms-api/src/modules/putaway/putawayController.js` - Added `createTaskForRemainingItems()`
- `wms-api/src/routes/putawayRoutes.js` - Added route

**Mobile App:**
- Use existing endpoints (no changes needed)
- Optionally add call to new endpoint for manual trigger

