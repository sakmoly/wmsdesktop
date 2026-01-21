# Relocation / Bin Transfer Implementation

## Summary

Implemented complete relocation/bin transfer system per `BACKEND_DESKTOP_Relocation_BinTransfer_Spec.md`. Supports full carton moves (blind/verified), partial carton-to-carton moves, and proper transaction history tracking with carton IDs.

## Database Schema

### New Tables

#### 1. `tabRelocationSession`
- `session_id` VARCHAR(100) PRIMARY KEY (e.g., "RL-20260115-123456")
- `mode` VARCHAR(50) NOT NULL (FULL_CARTON | PARTIAL_ITEMS | CARTON_TO_CARTON)
- `policy` VARCHAR(50) NOT NULL (BLIND | VERIFIED)
- `warehouse_id` VARCHAR(100) NOT NULL
- `from_bin` VARCHAR(100) NULL
- `from_carton` VARCHAR(100) NULL
- `to_bin` VARCHAR(100) NULL
- `to_carton` VARCHAR(100) NULL
- `status` VARCHAR(50) DEFAULT 'IN_PROGRESS' (IN_PROGRESS | COMPLETED | CANCELLED)
- `created_by` VARCHAR(255) NULL
- `device_id` VARCHAR(255) NULL
- `created_at` TIMESTAMP
- `updated_at` TIMESTAMP

#### 2. `tabRelocationLine`
- `line_id` BIGINT AUTO_INCREMENT PRIMARY KEY
- `session_id` VARCHAR(100) FK → `tabRelocationSession.session_id`
- `item_code` VARCHAR(100) NOT NULL
- `qty_moved` DECIMAL(10,2) NOT NULL
- `barcode` VARCHAR(255) NULL
- `created_at` TIMESTAMP

#### 3. `tabStockDirty`
- `warehouse_id` VARCHAR(100) NOT NULL
- `item_code` VARCHAR(100) NOT NULL
- `dirty_reason` VARCHAR(255) NULL
- `marked_at` TIMESTAMP
- PRIMARY KEY: `(warehouse_id, item_code)`

### Enhanced Tables

#### `tabStockTransaction`
- Added `from_carton` VARCHAR(100) NULL
- Added `to_carton` VARCHAR(100) NULL
- Indexes added on `from_carton` and `to_carton`

### Migration Script

**File**: `wms-api/add-relocation-tables.js`

**Run Migration**:
```bash
cd wms-api
node add-relocation-tables.js
```

## API Endpoints

### 1. Start Relocation Session

**POST** `/api/relocation/session/start`

**Request**:
```json
{
  "mode": "FULL_CARTON",  // FULL_CARTON | PARTIAL_ITEMS | CARTON_TO_CARTON
  "warehouse_id": "WH-MAIN",
  "user_id": "USER-001",
  "device_id": "DEVICE-001" (optional)
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "session_id": "RL-20260115-123456",
    "status": "IN_PROGRESS",
    "mode": "FULL_CARTON",
    "policy": "BLIND",
    "warehouse_id": "WH-MAIN"
  }
}
```

### 2. Set FROM Location

**PUT** `/api/relocation/session/:session_id/from`

**Request**:
```json
{
  "from_bin": "A1-R01-L3-B1",
  "from_carton": "CTN-555444"
}
```

### 3. Set TO Location

**PUT** `/api/relocation/session/:session_id/to`

**Request**:
```json
{
  "to_bin": "A1-R02-L1-B2",
  "to_carton": "CTN-999999" (required for CARTON_TO_CARTON mode)
}
```

### 4. Get Carton Contents

**GET** `/api/carton/:carton_id/contents`

**Response**:
```json
{
  "ok": true,
  "data": {
    "carton_id": "CTN-555444",
    "warehouse_id": "WH-MAIN",
    "bin_location": "A1-R01-L3-B1",
    "status": "PUTAWAY",
    "items": [
      {
        "item_code": "SKU-001",
        "qty": 10.00,
        "uom": "PCS",
        "batch_no": null,
        "serial_no": null
      }
    ]
  }
}
```

### 5. Scan Item (Optional Helper)

**POST** `/api/relocation/session/:session_id/line-scan`

**Request**:
```json
{
  "barcode": "6281230001111",
  "qty": 1,
  "scan_ts": "2025-01-15T10:30:00Z" (optional)
}
```

### 6. Edit Line

**PUT** `/api/relocation/session/:session_id/line`

**Request**:
```json
{
  "item_code": "SKU-001",
  "qty_moved": 10,
  "reason": "manual correction" (optional)
}
```

### 7. Commit Full Carton Move

**POST** `/api/relocation/session/:session_id/commit-full`

**Request**:
```json
{
  "policy": "BLIND",  // BLIND | VERIFIED
  "to_carton_mode": "KEEP_SAME"  // KEEP_SAME | NEW_CARTON (optional)
}
```

**Behavior**:
- Updates `tabCarton.current_bin_id`
- Updates `tabCartonStock.bin_location` for all items
- Inserts transaction history with `txn_type='CARTON_RELOCATION'`
- **Does NOT** create per-item OUT/IN movements (blind move)
- For VERIFIED policy, verifies carton contents match expected

### 8. Commit Partial Move

**POST** `/api/relocation/session/:session_id/commit-partial`

**Request**:
```json
{
  "lines": [
    { "item_code": "SKU-001", "qty": 10 }
  ] (optional - if not provided, uses lines from session)
}
```

**Behavior**:
- Decrements from source `tabCartonStock`
- Increments in destination `tabCartonStock`
- Creates destination carton if new
- Sets destination carton location
- Inserts item-level transaction history with `txn_type='PARTIAL_RELOCATION'` or `'CARTON_MERGE'`

### 9. Get Session Details

**GET** `/api/relocation/session/:session_id`

**Response**:
```json
{
  "ok": true,
  "data": {
    "session_id": "RL-20260115-123456",
    "mode": "FULL_CARTON",
    "policy": "BLIND",
    "warehouse_id": "WH-MAIN",
    "from_bin": "A1-R01-L3-B1",
    "from_carton": "CTN-555444",
    "to_bin": "A1-R02-L1-B2",
    "to_carton": null,
    "status": "IN_PROGRESS",
    "lines": [
      {
        "item_code": "SKU-001",
        "qty_moved": 10.00,
        "barcode": "6281230001111"
      }
    ]
  }
}
```

## Movement Logic

### Full Carton Move - BLIND

**Preconditions**:
- Carton exists in `tabCarton`
- Carton has items in `tabCartonStock`

**Action**:
1. Update `tabCarton.current_bin_id` → `to_bin`
2. Update `tabCartonStock.bin_location` → `to_bin` (for all items)
3. Insert transaction history:
   - `txn_type = 'CARTON_RELOCATION'`
   - `from_bin`, `to_bin`
   - `from_carton`, `to_carton`
   - `qty = 0` (blind move)
4. **Do NOT** create per-item OUT/IN movements

**Result**: Item locations update automatically via carton location join

### Full Carton Move - VERIFIED

**Action**:
1. Verify scanned totals match `tabCartonStock` contents
2. Update carton location (same as BLIND)
3. Insert transaction history with verification status
4. Optionally set `tabCarton.status = 'VERIFIED'`

### Partial Move (Carton A → Carton B)

**Action** (atomic in DB transaction):
1. For each item:
   - Decrement `qty` from source `tabCartonStock` (carton A)
   - Increment `qty` in destination `tabCartonStock` (carton B)
   - If destination carton is new, create `tabCarton` and `tabCartonStock` rows
   - Set destination `tabCarton.current_bin_id = to_bin`
2. Insert transaction history per item:
   - `txn_type = 'PARTIAL_RELOCATION'` or `'CARTON_MERGE'`
   - `from_carton`, `to_carton`
   - `from_bin`, `to_bin`
   - `item_code`, `qty`

## Transaction History

### Transaction Types

- `CARTON_RELOCATION` - Full carton blind move
- `PARTIAL_RELOCATION` - Partial item move between cartons/bins
- `CARTON_MERGE` - Carton-to-carton merge (when mode = CARTON_TO_CARTON)
- `CARTON_SPLIT` - Carton split operation (future)

### Required Fields

All relocation transactions include:
- `from_carton` - Source carton ID
- `to_carton` - Destination carton ID
- `from_bin` - Source bin location
- `to_bin` - Destination bin location
- `carton_id` - Primary carton involved (for backward compatibility)

## Files Created/Modified

### New Files

1. **wms-api/add-relocation-tables.js**
   - Migration script for relocation tables
   - Enhances `tabStockTransaction` with `from_carton`/`to_carton`

2. **wms-api/src/modules/relocation/relocationController.js**
   - Complete relocation controller with all endpoints
   - Movement logic for blind/verified/partial moves
   - Transaction history logging

3. **wms-api/src/routes/relocationRoutes.js**
   - Route definitions for relocation endpoints

### Modified Files

1. **wms-api/src/routes/index.js**
   - Registered relocation routes

2. **wms-api/src/routes/cartonRoutes.js**
   - Added `GET /api/carton/:carton_id/contents` endpoint

## Migration Steps

### Step 1: Run Migration Script

```bash
cd wms-api
node add-relocation-tables.js
```

**Expected Output**:
```
============================================================
Adding Relocation tables and enhancing Transaction History
============================================================

✅ Connected to database

📝 Creating tabRelocationSession table...
✅ Created tabRelocationSession table

📝 Creating tabRelocationLine table...
✅ Created tabRelocationLine table

📝 Creating tabStockDirty table...
✅ Created tabStockDirty table

📝 Enhancing tabStockTransaction table...
✅ Added from_carton column to tabStockTransaction
✅ Added to_carton column to tabStockTransaction
✅ Added index on from_carton
✅ Added index on to_carton

✅ Migration completed successfully!
```

### Step 2: Restart Backend Server

```bash
pm2 restart wms-api
# or
npm start
```

## Testing Checklist

### Full Carton Move - BLIND

- [ ] Create session with mode=FULL_CARTON
- [ ] Set FROM location (bin + carton)
- [ ] Set TO location (bin)
- [ ] Commit full move with policy=BLIND
- [ ] Verify carton location updated
- [ ] Verify transaction history created with carton IDs
- [ ] Verify no per-item movements created

### Full Carton Move - VERIFIED

- [ ] Create session with mode=FULL_CARTON
- [ ] Set FROM/TO locations
- [ ] Commit with policy=VERIFIED
- [ ] Verify carton contents checked
- [ ] Verify transaction history includes verification

### Partial Move

- [ ] Create session with mode=PARTIAL_ITEMS
- [ ] Set FROM location (carton A)
- [ ] Set TO location (carton B + bin)
- [ ] Scan items or provide lines
- [ ] Commit partial move
- [ ] Verify source carton stock decremented
- [ ] Verify destination carton stock incremented
- [ ] Verify transaction history per item with carton IDs

### Carton-to-Carton Merge

- [ ] Create session with mode=CARTON_TO_CARTON
- [ ] Set FROM/TO cartons
- [ ] Provide lines to move
- [ ] Commit partial move
- [ ] Verify transaction type = CARTON_MERGE
- [ ] Verify both cartons updated correctly

## Key Features

### ✅ Session-Based Workflow

- All moves tracked via relocation sessions
- Session state: IN_PROGRESS → COMPLETED
- Supports cancellation (future)

### ✅ Multiple Movement Modes

- **FULL_CARTON**: Move entire carton (blind or verified)
- **PARTIAL_ITEMS**: Move specific items between cartons/bins
- **CARTON_TO_CARTON**: Merge/split cartons

### ✅ Transaction History

- All moves logged with `from_carton` and `to_carton`
- Transaction types: `CARTON_RELOCATION`, `PARTIAL_RELOCATION`, `CARTON_MERGE`
- No blank carton IDs in history

### ✅ Self-Healing Support

- `tabStockDirty` table created (ready for implementation)
- Can mark items dirty on failure
- Repair logic can be added later

## Backward Compatibility

- ✅ Works with existing `tabCarton` and `tabCartonStock` tables
- ✅ Transaction history enhancement is additive (doesn't break existing queries)
- ✅ Existing carton movement (`MoveCartonToBinAsync`) still works
- ✅ Can be extended to use relocation session workflow

## Next Steps

1. ✅ **Database Migration**: Complete
2. ✅ **Backend API**: Complete
3. ⏳ **Desktop UI**: Needs implementation (relocation session management screen)
4. ⏳ **Mobile App**: Needs implementation (relocation workflow)
5. ⏳ **Self-Healing Logic**: Can be implemented later (table ready)

## Summary

✅ **Relocation/bin transfer system fully implemented**

- Database tables created
- All API endpoints implemented
- Movement logic (blind/verified/partial) complete
- Transaction history enhanced with carton IDs
- Routes registered and ready

The system is ready for testing after running the migration and restarting the backend server.
