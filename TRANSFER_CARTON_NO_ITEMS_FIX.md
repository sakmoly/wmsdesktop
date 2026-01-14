# Transfer Carton Created Without Items - Analysis & Fix

## 🐛 Issue

**Problem:** Transfer Carton `TC-MR-123461-1768330310848` was created successfully, but the "Carton Contents" table is empty (no items showing).

**Status:** Dispatched  
**Created On:** 2026-01-13 21:51  
**Sealed On:** 2026-01-13 21:52  
**Dispatched On:** 2026-01-13 21:52

---

## 🔍 Root Cause

The Transfer Carton was created, but **no packing events were sent** to associate items with the Transfer Carton.

### How Transfer Carton Contents Work

The desktop app and API query `tabWmsScanEvent` for packing events:

```sql
SELECT 
  item_code,
  carton_id AS source_carton,
  SUM(qty) AS quantity,
  MAX(user_id) AS packed_by,
  MAX(event_time) AS packed_on
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123461-1768330310848'
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
  AND item_code IS NOT NULL
  AND item_code != ''
  AND qty > 0
GROUP BY item_code, carton_id
```

**If no events exist with `tc_id = 'TC-MR-123461-1768330310848'`, the carton contents will be empty.**

---

## ✅ Correct Workflow

### Step 1: Pick Items (Stock Reduction)

**API:** `POST /api/material-requests/:title/pick-items`

**Purpose:** Reduce stock from source bin/carton

**Request:**
```json
{
  "warehouse": "WH-MAIN",
  "user_id": "USER-150526",
  "items": [
    {
      "item_code": "SKU-HAT-301-BLU-OS",
      "picked_qty": 2,
      "source_bin": "A1-R01-L3-B1",
      "carton_id": "CTN-555444"
    }
  ]
}
```

**What it does:**
- Updates `picked_qty` in `tabMaterialRequestItem`
- Reduces stock in `tabStockLedger` and `tabCartonStock`
- **Does NOT create packing events** (items are not yet in Transfer Carton)

---

### Step 2: Create Transfer Carton (Empty Container)

**API:** `POST /api/transfer-cartons/create`

**Purpose:** Create an empty Transfer Carton container

**Request:**
```json
{
  "tc_id": "TC-MR-123461-1768330310848",
  "asn_no": null,
  "to_no": "MR-123461",
  "store": "STORE-001",
  "user_id": "USER-150526",
  "material_request": "MR-123461"
}
```

**What it does:**
- Creates a record in `tabTransferCarton`
- Sets `status = "Created"`
- **Does NOT add items** (container is empty)

---

### Step 3: Pack Items to Transfer Carton (REQUIRED - Currently Missing)

**API:** `POST /api/events/batch`

**Purpose:** Associate picked items with the Transfer Carton

**Request:**
```json
{
  "events": [
    {
      "offline_uuid": "550e8400-e29b-41d4-a716-446655440001",
      "event_type": "PACK_ITEM_TO_TC",
      "event_time": "2026-01-13T21:51:00Z",
      "device_id": "DEVICE-001",
      "user_id": "USER-150526",
      "item_code": "SKU-HAT-301-BLU-OS",
      "qty": 2,
      "carton_id": "CTN-555444",
      "source_bin": "A1-R01-L3-B1",
      "tc_id": "TC-MR-123461-1768330310848",  // ✅ CRITICAL - Links item to TC
      "material_request": "MR-123461",
      "store": "STORE-001"
    }
  ]
}
```

**What it does:**
- Creates `PACK_ITEM_TO_TC` event in `tabWmsScanEvent`
- **Links item to Transfer Carton via `tc_id`**
- Items will now appear in "Carton Contents"

---

## 🔧 Mobile App Fix Required

### Current Behavior (WRONG)

```
1. Pick items → ✅ Stock reduced
2. Create Transfer Carton → ✅ TC created
3. Pack items → ❌ NOT CALLED - Items not linked to TC
4. Seal Transfer Carton → ✅ TC sealed (but empty!)
```

### Required Behavior (CORRECT)

```
1. Pick items → ✅ Stock reduced
2. Create Transfer Carton → ✅ TC created
3. Pack items → ✅ Send PACK_ITEM_TO_TC events with tc_id
4. Seal Transfer Carton → ✅ TC sealed (with items!)
```

---

## 📋 Mobile App Implementation

### Option 1: Pack Items Immediately After Creating TC

**⚠️ IMPORTANT:** The mobile app must store `carton_id` and `source_bin` when picking items, as these are not returned by the Material Request API.

```javascript
// Store picked items with carton_id and source_bin during picking
const pickedItemsMap = new Map(); // Store: item_code -> { carton_id, source_bin, picked_qty }

// When picking an item:
async function pickItem(itemCode, qty, sourceBin, cartonId) {
  // Call pick-items API
  await fetch(`/api/material-requests/${mrTitle}/pick-items`, {
    method: 'POST',
    body: JSON.stringify({
      warehouse: warehouse,
      user_id: userId,
      items: [{
        item_code: itemCode,
        picked_qty: qty,
        source_bin: sourceBin,
        carton_id: cartonId
      }]
    })
  });
  
  // Store locally for later packing
  if (!pickedItemsMap.has(itemCode)) {
    pickedItemsMap.set(itemCode, {
      carton_id: cartonId,
      source_bin: sourceBin,
      picked_qty: 0
    });
  }
  const item = pickedItemsMap.get(itemCode);
  item.picked_qty += qty;
}

// Step 1: Create Transfer Carton
const createResponse = await fetch('/api/transfer-cartons/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tc_id: generatedTcId,
    asn_no: null,
    to_no: materialRequestTitle,
    store: storeCode,
    user_id: userId,
    material_request: materialRequestTitle
  })
});

const { data: tcData } = await createResponse.json();
const tcId = tcData.tc_id; // Store this!

// Step 2: Pack all picked items to Transfer Carton
// Get items from local storage (pickedItemsMap)
const packingEvents = Array.from(pickedItemsMap.entries()).map(([itemCode, itemData]) => ({
  offline_uuid: generateUUID(),
  event_type: 'PACK_ITEM_TO_TC',
  event_time: new Date().toISOString(),
  device_id: deviceId,
  user_id: userId,
  item_code: itemCode,
  qty: itemData.picked_qty,
  carton_id: itemData.carton_id,        // From local storage (picked during picking)
  source_bin: itemData.source_bin,      // From local storage (picked during picking)
  tc_id: tcId,                          // ✅ CRITICAL - Link to TC
  material_request: materialRequestTitle,
  store: storeCode
}));

// Step 3: Send packing events
if (packingEvents.length > 0) {
  await fetch('/api/events/batch', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ events: packingEvents })
  });
}
```

### Option 2: Pack Items During Picking (Real-time)

```javascript
// When user picks an item
async function pickItem(itemCode, qty, sourceBin, cartonId) {
  // Step 1: Update picked_qty
  await fetch(`/api/material-requests/${mrTitle}/pick-items`, {
    method: 'POST',
    body: JSON.stringify({
      warehouse: warehouse,
      user_id: userId,
      items: [{
        item_code: itemCode,
        picked_qty: qty,
        source_bin: sourceBin,
        carton_id: cartonId
      }]
    })
  });

  // Step 2: If Transfer Carton exists, pack item immediately
  if (currentTcId) {
    await fetch('/api/events/batch', {
      method: 'POST',
      body: JSON.stringify({
        events: [{
          event_type: 'PACK_ITEM_TO_TC',
          event_time: new Date().toISOString(),
          device_id: deviceId,
          user_id: userId,
          item_code: itemCode,
          qty: qty,
          carton_id: cartonId,
          source_bin: sourceBin,
          tc_id: currentTcId,  // ✅ Link to TC
          material_request: mrTitle,
          store: storeCode
        }]
      })
    });
  }
}
```

---

## 🔍 Diagnostic Queries

Run these SQL queries to diagnose the issue:

```sql
-- 1. Check if TC exists
SELECT tc_id, status, to_no, created_on, sealed_on
FROM tabTransferCarton
WHERE tc_id = 'TC-MR-123461-1768330310848';

-- 2. Check if any events exist for this TC
SELECT COUNT(*) as total_events
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123461-1768330310848';

-- 3. Check packing events for this TC
SELECT 
  event_type,
  item_code,
  carton_id,
  qty,
  event_time
FROM tabWmsScanEvent
WHERE tc_id = 'TC-MR-123461-1768330310848'
  AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
ORDER BY event_time DESC;

-- 4. Check if items were picked for this Material Request
SELECT 
  item_code,
  requested_qty,
  picked_qty
FROM tabMaterialRequestItem
WHERE parent_title = 'MR-123461';

-- 5. Check if packing events exist for this MR (but without tc_id)
SELECT 
  event_type,
  item_code,
  carton_id,
  qty,
  tc_id,  -- Check if this is NULL
  event_time
FROM tabWmsScanEvent
WHERE material_request = 'MR-123461'
  AND event_type IN ('PACK_ITEM_TO_TC', 'PACK_BOX_TO_TC')
ORDER BY event_time DESC;
```

---

## ✅ Expected Results After Fix

1. **Transfer Carton Created:** ✅ `TC-MR-123461-1768330310848` exists
2. **Packing Events Sent:** ✅ Events with `tc_id = 'TC-MR-123461-1768330310848'` exist
3. **Items Visible:** ✅ "Carton Contents" table shows items
4. **Source Carton Populated:** ✅ Source Carton column shows carton IDs

---

## 📝 Summary

**Issue:** Transfer Carton created but no items showing

**Root Cause:** Mobile app is NOT sending `PACK_ITEM_TO_TC` events with `tc_id` after creating the Transfer Carton

**Fix:** Mobile app must:
1. ✅ Create Transfer Carton (already working)
2. ✅ Send `PACK_ITEM_TO_TC` events with `tc_id` to link items to TC
3. ✅ Seal Transfer Carton (already working)

**API Endpoint:** `POST /api/events/batch`

**Required Field:** `tc_id` in each packing event

---

**Status:** 📱 **MOBILE APP FIX REQUIRED**  
**Date:** 2026-01-13  
**TC ID:** `TC-MR-123461-1768330310848`
