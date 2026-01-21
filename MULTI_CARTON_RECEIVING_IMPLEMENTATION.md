# Multi-Carton Receiving Implementation

## Summary

Implemented multi-carton receiving feature for Transfer In. Supports receiving items across multiple cartons, splitting item quantities across cartons, and managing carton lifecycle (Draft/Closed).

## Database Schema

### New Tables

#### 1. `tabTransferInCarton`
- `name` VARCHAR(255) PRIMARY KEY
- `carton_id` VARCHAR(255) UNIQUE (carton identifier)
- `transfer_in` VARCHAR(100) FK → `tabTransferIn.title`
- `status` VARCHAR(50) DEFAULT 'Draft' (Draft | Closed)
- `created_by` VARCHAR(255) NULL
- `created_at` TIMESTAMP
- `closed_by` VARCHAR(255) NULL
- `closed_at` TIMESTAMP NULL
- `updated_at` TIMESTAMP

#### 2. `tabTransferInCartonLine`
- `name` VARCHAR(255) PRIMARY KEY
- `transfer_in` VARCHAR(100) FK → `tabTransferIn.title`
- `carton_id` VARCHAR(255) FK → `tabTransferInCarton.carton_id`
- `item_code` VARCHAR(100)
- `received_qty` DECIMAL(10,2) DEFAULT 0
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP
- UNIQUE KEY: `(transfer_in, carton_id, item_code)`

### Migration Script

**File**: `wms-api/add-transfer-in-carton-tables.js`

**Run Migration**:
```bash
cd wms-api
node add-transfer-in-carton-tables.js
```

## Event Processing

### 1. TRANSFER_IN_RECEIVE (Enhanced)

**Event Payload**:
```json
{
  "event_type": "TRANSFER_IN_RECEIVE",
  "transfer_in": "INSLIP-123463",
  "carton_id": "CTN-123",  // Required for multi-carton mode
  "item_code": "SKU-001",
  "qty": 1,  // Quantity difference (additive)
  "user_id": "USER-001"
}
```

**Behavior**:
- **Multi-Carton Mode** (if `tabTransferInCarton` exists):
  1. Ensures carton exists in `tabTransferInCarton` (creates Draft if not exists)
  2. Prevents editing if carton is Closed
  3. Upserts `tabTransferInCartonLine`: `received_qty += qty` (additive)
  4. Recalculates total `received_qty` from all carton lines for the item
  5. Updates `tabTransferInItem.received_qty` = SUM(carton lines)
  
- **Legacy Mode** (if `tabTransferInCarton` doesn't exist):
  1. Updates `tabTransferInItem.received_qty` directly (additive)
  2. Updates `tabTransferInItem.carton_id` (single carton per item)

**File**: `wms-api/src/modules/events/eventController.js`
**Function**: `processTransferInReceiveEvent()`

### 2. TRANSFER_IN_RECEIVE_ADJUST (NEW)

**Event Payload**:
```json
{
  "event_type": "TRANSFER_IN_RECEIVE_ADJUST",
  "transfer_in": "INSLIP-123463",
  "carton_id": "CTN-123",  // Required
  "item_code": "SKU-001",
  "qty": 5.0,  // Absolute qty to set (NOT difference)
  "user_id": "USER-001"
}
```

**Behavior**:
- Sets absolute quantity for item in specific carton
- Upserts `tabTransferInCartonLine`: `received_qty = set_qty`
- Recalculates total `received_qty` from all carton lines
- Updates `tabTransferInItem.received_qty`

**File**: `wms-api/src/modules/events/eventController.js`
**Function**: `processTransferInReceiveAdjustEvent()`

### 3. TRANSFER_IN_CARTON_CLOSE (NEW)

**Event Payload**:
```json
{
  "event_type": "TRANSFER_IN_CARTON_CLOSE",
  "transfer_in": "INSLIP-123463",
  "carton_id": "CTN-123",  // Required
  "user_id": "USER-001"
}
```

**Behavior**:
- Sets carton `status = 'Closed'`
- Sets `closed_at = NOW()`
- Sets `closed_by = user_id`
- **Does NOT** change Transfer In header status
- Prevents further edits to carton (until reopened)

**File**: `wms-api/src/modules/events/eventController.js`
**Function**: `processTransferInCartonCloseEvent()`

## API Endpoints

### 1. GET /api/transfer-in/:title/cartons

**Get all cartons for a Transfer In**

**Response**:
```json
{
  "ok": true,
  "data": {
    "transfer_in": "INSLIP-123463",
    "cartons": [
      {
        "name": "TIC-INSLIP-123463-CTN-123-...",
        "carton_id": "CTN-123",
        "transfer_in": "INSLIP-123463",
        "status": "Draft",
        "total_qty": 10.0,
        "created_by": "USER-001",
        "created_at": "2026-01-15T10:00:00.000Z",
        "closed_by": null,
        "closed_at": null
      }
    ]
  }
}
```

### 2. POST /api/transfer-in/:title/cartons

**Create or select a carton**

**Request**:
```json
{
  "carton_id": "CTN-123"
}
```

**Response** (if carton exists):
```json
{
  "ok": true,
  "message": "Using existing carton CTN-123",
  "data": {
    "name": "TIC-INSLIP-123463-CTN-123-...",
    "carton_id": "CTN-123",
    "transfer_in": "INSLIP-123463",
    "status": "Draft",
    "total_qty": 10.0,
    "created_by": "USER-001",
    "created_at": "2026-01-15T10:00:00.000Z"
  }
}
```

**Response** (if carton created):
```json
{
  "ok": true,
  "message": "Created carton CTN-123 for Transfer In INSLIP-123463",
  "data": {
    "name": "TIC-INSLIP-123463-CTN-123-...",
    "carton_id": "CTN-123",
    "transfer_in": "INSLIP-123463",
    "status": "Draft",
    "total_qty": 0,
    "created_by": "USER-001",
    "created_at": "2026-01-15T10:00:00.000Z"
  }
}
```

### 3. GET /api/transfer-in/:title/cartons/:carton_id/lines

**Get all items in a carton**

**Response**:
```json
{
  "ok": true,
  "data": {
    "transfer_in": "INSLIP-123463",
    "carton_id": "CTN-123",
    "lines": [
      {
        "name": "TICL-INSLIP-123463-CTN-123-SKU-001-...",
        "transfer_in": "INSLIP-123463",
        "carton_id": "CTN-123",
        "item_code": "SKU-001",
        "received_qty": 5.0,
        "created_at": "2026-01-15T10:00:00.000Z",
        "updated_at": "2026-01-15T10:05:00.000Z"
      }
    ]
  }
}
```

### 4. POST /api/transfer-in/:title/cartons/:carton_id/close

**Close a carton**

**Response**:
```json
{
  "ok": true,
  "message": "Closed carton CTN-123 for Transfer In INSLIP-123463",
  "data": {
    "carton_id": "CTN-123",
    "transfer_in": "INSLIP-123463",
    "status": "Closed",
    "closed_by": "USER-001",
    "closed_at": "2026-01-15T10:30:00.000Z"
  }
}
```

### 5. POST /api/transfer-in/:title/cartons/:carton_id/reopen

**Reopen a closed carton**

**Response**:
```json
{
  "ok": true,
  "message": "Reopened carton CTN-123 for Transfer In INSLIP-123463",
  "data": {
    "carton_id": "CTN-123",
    "transfer_in": "INSLIP-123463",
    "status": "Draft"
  }
}
```

## Receiving Calculation Rules

### Total Received per Item:
```sql
SELECT SUM(received_qty) 
FROM tabTransferInCartonLine 
WHERE transfer_in = 'INSLIP-123463' 
  AND item_code = 'SKU-001';
```

### Remaining per Item:
```sql
SELECT 
  i.qty - COALESCE(SUM(cl.received_qty), 0) as remaining
FROM tabTransferInItem i
LEFT JOIN tabTransferInCartonLine cl 
  ON cl.transfer_in = i.parent_title 
  AND cl.item_code = i.item_code
WHERE i.parent_title = 'INSLIP-123463'
  AND i.item_code = 'SKU-001';
```

### Carton Total:
```sql
SELECT SUM(received_qty) 
FROM tabTransferInCartonLine 
WHERE transfer_in = 'INSLIP-123463' 
  AND carton_id = 'CTN-123';
```

## Status Recalculation

The `recalculateTransferInStatus()` function now:

1. **Checks for multi-carton tables**
2. **If carton tables exist**: Calculates `total_received` from `tabTransferInCartonLine`
3. **If carton tables don't exist**: Uses `received_qty` from `tabTransferInItem` (legacy mode)

**Status Rules** (unchanged):
- `completed_at IS NOT NULL` OR `is_completed = 1` → **"Received"**
- ANY item has `received_qty > 0` AND NOT completed → **"Receiving"**
- No items received AND NOT completed → **"Submitted"**

## Backward Compatibility

The implementation is **fully backward compatible**:

- ✅ If carton tables don't exist, uses legacy mode (single carton per item)
- ✅ Existing `TRANSFER_IN_RECEIVE` events without `carton_id` continue to work
- ✅ `tabTransferInItem.received_qty` is always kept in sync (sum of carton lines)

## Mobile App Integration

### Required Changes:

1. **Carton Selection**:
   - Scan or generate carton ID
   - Call `POST /api/transfer-in/:title/cartons` with `carton_id`
   - Store active carton ID in app state

2. **Item Scanning**:
   - Always include `carton_id` in `TRANSFER_IN_RECEIVE` events
   - Each scan adds qty to active carton

3. **Quantity Editing**:
   - Use `TRANSFER_IN_RECEIVE_ADJUST` event with absolute `qty`
   - Only edits qty within active carton

4. **Close Carton**:
   - Call `POST /api/transfer-in/:title/cartons/:carton_id/close` OR
   - Send `TRANSFER_IN_CARTON_CLOSE` event

5. **Complete Transfer In**:
   - Call `POST /api/transfer-in/:title/complete-receiving`
   - Sets Transfer In header status to "Received"

## Validation Examples

### Example 1: Split Item Across Cartons
```
Item: SKU-001, Required: 10

Carton A:
- Receive 6 → carton_line: {item: SKU-001, carton: A, qty: 6}

Carton B:
- Receive 4 → carton_line: {item: SKU-001, carton: B, qty: 4}

Total: 6 + 4 = 10 ✅
Remaining: 10 - 10 = 0 ✅
```

### Example 2: Edit Quantity in Carton
```
Carton A: SKU-001, qty: 6
Edit to 5 → TRANSFER_IN_RECEIVE_ADJUST {set_qty: 5}
Result: carton_line: {item: SKU-001, carton: A, qty: 5}

Total: 5 + 4 = 9
Remaining: 10 - 9 = 1
```

### Example 3: Close Carton
```
Carton A: status = 'Closed', closed_at = NOW()
- Can't edit items in closed carton
- Transfer In status still "Receiving" (not changed)
- Complete Transfer In separately via Complete endpoint
```

## Files Changed

1. **wms-api/add-transfer-in-carton-tables.js** (NEW)
   - Migration script for carton tables

2. **wms-api/src/modules/events/eventController.js**
   - Enhanced `processTransferInReceiveEvent()` for multi-carton mode
   - Added `processTransferInReceiveAdjustEvent()` (NEW)
   - Added `processTransferInCartonCloseEvent()` (NEW)
   - Added `recalculateTransferInItemReceivedQty()` helper (NEW)

3. **wms-api/src/modules/transfer-in/transferInController.js**
   - Updated `recalculateTransferInStatus()` to use carton line totals
   - Added `getTransferInCartons()` (NEW)
   - Added `createOrSelectTransferInCarton()` (NEW)
   - Added `getTransferInCartonLines()` (NEW)
   - Added `closeTransferInCarton()` (NEW)
   - Added `reopenTransferInCarton()` (NEW)

4. **wms-api/src/routes/transferInRoutes.js**
   - Added routes for carton management

## Migration Steps

### Step 1: Run Migration Script

```bash
cd wms-api
node add-transfer-in-carton-tables.js
```

### Step 2: Restart Backend Server

```bash
pm2 restart wms-api
# or
npm start
```

### Step 3: Test Multi-Carton Receiving

1. Create Transfer In with items
2. Create/select carton: `POST /api/transfer-in/:title/cartons`
3. Receive items with carton_id in events
4. Verify carton lines created
5. Verify total received_qty calculated correctly
6. Close carton: `POST /api/transfer-in/:title/cartons/:carton_id/close`
7. Complete Transfer In: `POST /api/transfer-in/:title/complete-receiving`

## Testing Checklist

- [ ] Migration script runs successfully
- [ ] Carton tables created
- [ ] TRANSFER_IN_RECEIVE events create cartons automatically
- [ ] TRANSFER_IN_RECEIVE events update carton lines additively
- [ ] Total received_qty calculated from carton lines
- [ ] TRANSFER_IN_RECEIVE_ADJUST sets absolute qty
- [ ] TRANSFER_IN_CARTON_CLOSE closes carton
- [ ] Closed cartons can't be edited
- [ ] Cartons can be reopened
- [ ] Transfer In status updates correctly (from carton line totals)
- [ ] Backward compatible with legacy mode (if tables don't exist)

## Summary

✅ **Multi-carton receiving fully implemented**
✅ **Backward compatible with legacy single-carton mode**
✅ **Status calculation uses carton line totals**
✅ **All required API endpoints created**
✅ **Event processing supports all event types**
