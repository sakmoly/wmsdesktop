# Transfer In - Handling Items Without Carton ID

## 📋 Overview

Transfer In items from showrooms may come in two forms:
1. **Cartonized Items** - Items packed in cartons (with `carton_id`)
2. **Loose Items** - Items not in cartons (without `carton_id`)

This document outlines how the system handles both scenarios.

---

## 🗄️ Database Schema

### Current Schema Support

**`tabTransferInItem` table:**
```sql
- carton_id VARCHAR(100) NULL  -- ⚠️ NULLABLE
```

**Key Point:** The `carton_id` column is already **NULLABLE**, meaning:
- ✅ Items can be created without `carton_id`
- ✅ Items can be received without `carton_id`
- ✅ Putaway can handle items without `carton_id`

---

## 🔄 Receiving Workflow - Two Scenarios

### Scenario A: Items WITH Carton ID (Cartonized)

**Use Case:** Items are packed in cartons at the showroom

**Workflow:**
```
1. Transfer In created with carton_id for each item
2. Mobile app: User scans carton ID
3. System displays all items in that carton
4. User confirms receipt
5. System updates received_qty for all items with that carton_id
```

**Example Data:**
```json
{
  "title": "TI-0001",
  "items": [
    {
      "item_code": "ITEM-001",
      "qty": 50.00,
      "carton_id": "CTN-TI-001"  // ← Has carton ID
    },
    {
      "item_code": "ITEM-002",
      "qty": 30.00,
      "carton_id": "CTN-TI-001"  // ← Same carton
    }
  ]
}
```

**Mobile App Receiving:**
- Scan carton "CTN-TI-001"
- System shows: ITEM-001 (50), ITEM-002 (30)
- User confirms receipt
- Both items marked as received

---

### Scenario B: Items WITHOUT Carton ID (Loose Items)

**Use Case:** Items are not packed in cartons (loose items)

**Workflow:**
```
1. Transfer In created without carton_id (NULL)
2. Mobile app: User scans item barcode directly
3. System shows item details and expected quantity
4. User enters received quantity
5. System updates received_qty for that item
```

**Example Data:**
```json
{
  "title": "TI-0001",
  "items": [
    {
      "item_code": "ITEM-001",
      "qty": 50.00,
      "carton_id": null  // ← No carton ID
    },
    {
      "item_code": "ITEM-002",
      "qty": 30.00,
      "carton_id": null  // ← No carton ID
    }
  ]
}
```

**Mobile App Receiving:**
- Scan item barcode "ITEM-001"
- System shows: Expected Qty: 50
- User enters: Received Qty: 50
- Item marked as received
- Repeat for next item

---

## 📱 Mobile App Implementation

### Receiving Screen Design

**Option 1: Unified Receiving Screen (Recommended)**

The receiving screen should handle both scenarios:

```javascript
// Receiving Screen Logic
function handleReceiveItem(transferIn, scanResult) {
  // Check if scanResult is carton_id or item_code
  if (isCartonId(scanResult)) {
    // Scenario A: Carton ID scanned
    const itemsInCarton = transferIn.items.filter(
      item => item.carton_id === scanResult
    );
    
    if (itemsInCarton.length > 0) {
      // Show all items in carton
      displayCartonItems(itemsInCarton);
      // User confirms receipt for all items
      receiveCartonItems(transferIn.title, scanResult);
    } else {
      showError("Carton not found in Transfer In");
    }
  } else {
    // Scenario B: Item barcode scanned
    const item = transferIn.items.find(
      item => item.item_code === scanResult
    );
    
    if (item) {
      // Show item details
      displayItemDetails(item);
      // User enters received quantity
      promptReceivedQuantity(item, (receivedQty) => {
        receiveLooseItem(transferIn.title, item.item_code, receivedQty);
      });
    } else {
      showError("Item not found in Transfer In");
    }
  }
}
```

**Option 2: Separate Receiving Modes**

- **Mode 1: Carton Receiving** - For items with carton_id
- **Mode 2: Item Receiving** - For loose items

User selects mode before receiving.

---

## 🔌 API Implementation

### Current API Support

**✅ Already Handles NULL carton_id:**
```javascript
// In transferInController.js
await connection.execute(`
  INSERT INTO tabTransferInItem 
    (parent_title, item_code, qty, carton_id, received_qty)
  VALUES (?, ?, ?, ?, 0)
`, [title, item.item_code, item.qty, item.carton_id || null]);
```

### Required API Enhancements

#### 1. Receive Line Endpoint (Update Existing)

**Endpoint:** `POST /api/inbound/receive-line`

**Request Body (Cartonized):**
```json
{
  "transfer_in": "TI-0001",
  "carton_id": "CTN-TI-001",
  "received_by": "USER-002"
}
```

**Request Body (Loose Item):**
```json
{
  "transfer_in": "TI-0001",
  "item_code": "ITEM-001",
  "received_qty": 50.00,
  "carton_id": null,
  "received_by": "USER-002"
}
```

**Implementation Logic:**
```javascript
export const receiveLine = async (req, res) => {
  const { transfer_in, carton_id, item_code, received_qty, received_by } = req.body;
  
  // Scenario A: Receiving by carton_id
  if (carton_id && !item_code) {
    // Update all items with this carton_id
    await connection.execute(`
      UPDATE tabTransferInItem
      SET received_qty = qty,
          updated_at = NOW()
      WHERE parent_title = ?
        AND carton_id = ?
        AND received_qty < qty
    `, [transfer_in, carton_id]);
  }
  
  // Scenario B: Receiving loose item
  else if (item_code && !carton_id) {
    // Update specific item
    await connection.execute(`
      UPDATE tabTransferInItem
      SET received_qty = ?,
          updated_at = NOW()
      WHERE parent_title = ?
        AND item_code = ?
        AND carton_id IS NULL
    `, [received_qty, transfer_in, item_code]);
  }
  
  // Validate: Both or neither provided
  else {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Either carton_id OR (item_code + received_qty) must be provided'
      }
    });
  }
  
  // Check if all items received
  const [remaining] = await connection.execute(`
    SELECT COUNT(*) as count
    FROM tabTransferInItem
    WHERE parent_title = ?
      AND received_qty < qty
  `, [transfer_in]);
  
  if (remaining[0].count === 0) {
    // All items received - update Transfer In status
    await connection.execute(`
      UPDATE tabTransferIn
      SET status = 'Received',
          received_by = ?,
          received_on = NOW()
      WHERE title = ?
    `, [received_by, transfer_in]);
  }
  
  res.json({ ok: true, message: 'Items received successfully' });
};
```

#### 2. Batch Receive Endpoint (New - Optional)

**Endpoint:** `POST /api/inbound/receive-lines`

**Request Body:**
```json
{
  "transfer_in": "TI-0001",
  "lines": [
    {
      "item_code": "ITEM-001",
      "received_qty": 50.00,
      "carton_id": null
    },
    {
      "item_code": "ITEM-002",
      "received_qty": 30.00,
      "carton_id": null
    }
  ],
  "received_by": "USER-002"
}
```

**Use Case:** User receives multiple loose items at once

---

## 🏗️ Putaway Integration

### Putaway Line Creation

**Current Support:** `tabPutawayLine.carton_id` is already nullable

**When Creating Putaway Lines from Transfer In:**

```javascript
// For each Transfer In item
for (const item of transferInItems) {
  await connection.execute(`
    INSERT INTO tabPutawayLine 
      (parent_title, carton_id, item_code, qty, rack, bin)
    VALUES (?, ?, ?, ?, 'TBD', 'TBD')
  `, [
    putawayTaskTitle,
    item.carton_id || null,  // ← NULL if no carton
    item.item_code,
    item.received_qty
  ]);
}
```

**Result:**
- Items with `carton_id` → Putaway line has `carton_id`
- Items without `carton_id` → Putaway line has `carton_id = NULL`

**Putaway Process:**
- **With Carton ID:** Scan carton, put away entire carton
- **Without Carton ID:** Scan item barcode, put away individual items

---

## 📊 Desktop App Implementation

### Transfer In Detail Window

**Items DataGrid should show:**
- Item Code
- Expected Qty
- Carton ID (nullable - show "N/A" if NULL)
- Received Qty
- Status

**UI Display:**
```xml
<DataGridTextColumn Header="Carton ID" Binding="{Binding CartonId, TargetNullValue='N/A'}" />
```

**Create/Edit Form:**
- Carton ID field should be **optional**
- Allow user to leave blank for loose items
- Validate: If carton_id provided, must be unique within Transfer In

---

## ✅ Validation Rules

### Transfer In Creation

1. **Carton ID is Optional:**
   - ✅ Items can be created without `carton_id`
   - ✅ Items can be created with `carton_id`
   - ✅ Mix of both is allowed

2. **Carton ID Uniqueness (if provided):**
   - If `carton_id` is provided, it should be unique within the Transfer In
   - Same carton_id can appear in multiple Transfer Ins (different shipments)

3. **Receiving Validation:**
   - If `carton_id` exists: Must receive by carton
   - If `carton_id` is NULL: Must receive by item code

---

## 🔍 Query Examples

### Get Items With Carton ID

```sql
SELECT * FROM tabTransferInItem
WHERE parent_title = 'TI-0001'
  AND carton_id IS NOT NULL;
```

### Get Loose Items (Without Carton ID)

```sql
SELECT * FROM tabTransferInItem
WHERE parent_title = 'TI-0001'
  AND carton_id IS NULL;
```

### Get All Items (Both Types)

```sql
SELECT * FROM tabTransferInItem
WHERE parent_title = 'TI-0001';
-- Returns both cartonized and loose items
```

---

## 📝 Implementation Checklist

### API Updates

- [x] ✅ `carton_id` already nullable in database
- [x] ✅ API already handles `carton_id || null`
- [ ] ⚠️ Update `receive-line` endpoint to handle both scenarios
- [ ] ⚠️ Add validation for receiving workflow
- [ ] ⚠️ Add batch receive endpoint (optional)

### Desktop App Updates

- [x] ✅ Model already supports nullable `CartonId`
- [x] ✅ Data service already handles NULL carton_id
- [ ] ⚠️ Update UI to show "N/A" for NULL carton_id
- [ ] ⚠️ Make carton_id field optional in create/edit form
- [ ] ⚠️ Add validation for carton_id uniqueness

### Mobile App Updates

- [ ] ❌ Implement unified receiving screen
- [ ] ❌ Handle carton ID scanning
- [ ] ❌ Handle item barcode scanning
- [ ] ❌ Show appropriate UI based on item type
- [ ] ❌ Validate receiving workflow

### Putaway Integration

- [x] ✅ `tabPutawayLine.carton_id` already nullable
- [x] ✅ Putaway process already handles NULL carton_id
- [ ] ⚠️ Verify Putaway Task creation handles both scenarios
- [ ] ⚠️ Test putaway for loose items

---

## 🎯 Recommended Approach

### Option 1: Unified Receiving (Recommended)

**Single receiving screen that handles both:**
- Auto-detect if scan is carton_id or item_code
- Show appropriate UI based on detection
- Simpler for users (one screen)

### Option 2: Mode Selection

**User selects mode:**
- "Receive by Carton" mode
- "Receive by Item" mode
- More explicit but requires mode switching

**Recommendation:** **Option 1 (Unified)** - Better UX, less confusion

---

## 🧪 Test Scenarios

### Test 1: Transfer In with Carton ID

1. Create Transfer In with items having `carton_id`
2. Receive by scanning carton ID
3. Verify all items in carton marked as received
4. Verify Putaway Task created correctly

### Test 2: Transfer In without Carton ID

1. Create Transfer In with items having `carton_id = NULL`
2. Receive by scanning item barcode
3. Enter received quantity
4. Verify item marked as received
5. Verify Putaway Task created correctly

### Test 3: Mixed Transfer In

1. Create Transfer In with mix of cartonized and loose items
2. Receive cartonized items by carton ID
3. Receive loose items by item barcode
4. Verify all items received correctly
5. Verify Putaway Task handles both types

---

## 📚 Related Documentation

- `CYCLE_COUNT_AND_TRANSFER_IN_DESIGN.md` - Main design document
- `CYCLE_COUNT_AND_TRANSFER_IN_SUMMARY.md` - Implementation summary

---

**Document Version:** 1.0  
**Created:** 2026-01-05  
**Status:** Design Complete

