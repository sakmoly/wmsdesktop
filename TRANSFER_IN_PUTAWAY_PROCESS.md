# Transfer In Putaway Process - Complete Guide

## 📋 Overview

After receiving Transfer In items, they need to be put away into specific rack/bin locations in the warehouse. This document explains the complete process from receiving to putaway completion.

---

## 🔄 Complete Workflow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Receive Transfer In Items                               │
│    - Mobile app calls: POST /api/transfer-in/:title/receive-line │
│    - Items are received (cartonized or loose)              │
│    - Status: "Submitted" → "In Transit" → "Received"       │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Auto-Create Putaway Task (Automatic)                    │
│    - Triggered when ALL items are fully received           │
│    - Creates tabPutawayTask with status "Draft"            │
│    - Creates tabPutawayLine for each received item          │
│    - Initial rack/bin set to "TBD" (To Be Determined)      │
│    - Putaway Task Title: PUT-YYYYMMDD-XXXX                 │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Mobile App - Scan Items/Cartons for Putaway             │
│    - Operator scans carton_id or item_code                 │
│    - Scans or enters rack/bin location                     │
│    - Calls: POST /api/putaway/scan-transfer-carton        │
│    - Updates putaway line with location                    │
│    - Status: "Draft" → "In Progress"                        │
└───────────────────────┬───────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Complete Putaway                                        │
│    - All items assigned to locations                       │
│    - Mobile app calls: POST /api/putaway/complete          │
│    - Updates stock ledger with new locations               │
│    - Creates stock transactions                            │
│    - Status: "In Progress" → "Completed"                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Step-by-Step Process

### Step 1: Receive Transfer In Items

**API Endpoint:**
```
POST /api/transfer-in/:title/receive-line
```

**Request Body (Cartonized):**
```json
{
  "carton_id": "CTN-TI-001",
  "received_by": "USER-002"
}
```

**Request Body (Loose Item):**
```json
{
  "item_code": "SKU-HAT-301-BLU-OS",
  "received_qty": 2.00,
  "received_by": "USER-002"
}
```

**What Happens:**
1. Updates `tabTransferInItem.received_qty`
2. When **ALL items are fully received**:
   - Updates `tabTransferIn.status` to "Received"
   - **Automatically creates Putaway Task** (see Step 2)

---

### Step 2: Auto-Create Putaway Task (Automatic)

**Trigger:** When all Transfer In items are fully received

**What Gets Created:**

**1. Putaway Task (`tabPutawayTask`):**
```sql
INSERT INTO tabPutawayTask (
  title,                    -- e.g., "PUT-20260105-0001"
  status,                   -- "Draft"
  source_type,              -- "TransferIn"
  transfer_in,              -- Transfer In title (e.g., "INSLIP-0001")
  warehouse,                -- Destination warehouse
  created_by,               -- "SYSTEM"
  created_at,
  updated_at
)
```

**2. Putaway Lines (`tabPutawayLine`):**
```sql
INSERT INTO tabPutawayLine (
  parent_title,             -- Putaway Task title
  item_code,                -- Item code
  carton_id,                -- Carton ID (if cartonized, else NULL)
  qty,                      -- Quantity to put away
  rack,                     -- "TBD" (To Be Determined)
  bin,                      -- "TBD" (To Be Determined)
  status,                   -- "Pending"
  created_at,
  updated_at
)
```

**Example:**
- Transfer In: `INSLIP-0001` with 3 items received
- Auto-creates Putaway Task: `PUT-20260105-0001`
- Creates 3 Putaway Lines (one per item)
- All lines have `rack = "TBD"` and `bin = "TBD"`

---

### Step 3: Mobile App - Scan Items for Putaway

**API Endpoint:**
```
POST /api/putaway/scan-transfer-carton
```

**Purpose:** Assign items/cartons to specific rack/bin locations

**Request Body Options:**

**Option A: Scan by Carton ID (Cartonized Items)**
```json
{
  "box_id": "CTN-TI-001",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "user_id": "USER-003"
}
```

**Option B: Scan by Putaway Task (Direct Assignment)**
```json
{
  "putaway_task": "PUT-20260105-0001",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "user_id": "USER-003"
}
```

**Option C: Using location_id (Preferred)**
```json
{
  "putaway_task": "PUT-20260105-0001",
  "location_id": "LOC-001",
  "user_id": "USER-003"
}
```

**What Happens:**
1. Finds Putaway Task (by `box_id` or `putaway_task`)
2. Updates Putaway Lines with rack/bin location:
   ```sql
   UPDATE tabPutawayLine
   SET rack = ?,
       bin = ?,
       status = 'Assigned',
       updated_at = NOW()
   WHERE parent_title = ? AND item_code = ?
   ```
3. Updates Putaway Task status to "In Progress"
4. **Stock is NOT updated yet** (only on completion)

**Response:**
```json
{
  "ok": true,
  "message": "Putaway task updated and items assigned successfully",
  "data": {
    "putaway_task": "PUT-20260105-0001",
    "status": "In Progress",
    "stock_updated": false,
    "rack": "RACK-A",
    "bin": "BIN-01",
    "items_count": 3,
    "items": [
      {
        "item_code": "SKU-HAT-301-BLU-OS",
        "box_id": "CTN-TI-001",
        "qty": 2.00,
        "rack": "RACK-A",
        "bin": "BIN-01"
      }
    ],
    "is_new_task": false
  }
}
```

---

### Step 4: Complete Putaway

**API Endpoint:**
```
POST /api/putaway/complete
```

**Purpose:** Finalize putaway and update stock ledger

**Request Body:**
```json
{
  "putaway_task": "PUT-20260105-0001",
  "completed_by": "USER-003"
}
```

**What Happens:**
1. Validates all items have locations assigned (rack/bin not "TBD")
2. For each Putaway Line:
   - Updates `tabStockLedger`:
     ```sql
     INSERT INTO tabStockLedger (
       item_code,
       warehouse,
       bin_location,        -- e.g., "RACK-A-BIN-01"
       qty,                 -- Quantity added
       reserved_qty,
       updated_at
     )
     VALUES (?, ?, ?, ?, 0, NOW())
     ON DUPLICATE KEY UPDATE
       qty = qty + VALUES(qty),
       updated_at = NOW()
     ```
   - Creates `tabStockTransaction`:
     ```sql
     INSERT INTO tabStockTransaction (
       item_code,
       warehouse,
       bin_location,
       transaction_type,    -- "Putaway"
       transaction_ref,     -- Putaway Task title
       qty,                 -- Positive quantity
       created_by,
       created_at
     )
     ```
   - Updates `tabItem.stock_qty`:
     ```sql
     UPDATE tabItem
     SET stock_qty = stock_qty + ?,
         updated_at = NOW()
     WHERE item_code = ?
     ```
3. Updates Putaway Task status to "Completed"
4. Updates all Putaway Lines status to "Completed"

**Response:**
```json
{
  "ok": true,
  "message": "Putaway completed successfully",
  "data": {
    "putaway_task": "PUT-20260105-0001",
    "status": "Completed",
    "items_put_away": 3,
    "stock_updated": true
  }
}
```

---

## 📱 Mobile App Implementation

### Screen 1: Putaway Task List

**API:** `GET /api/putaway/tasks?status=Draft,In Progress`

**Display:**
- Putaway Task Title
- Source (Transfer In number)
- Warehouse
- Status
- Item Count
- Created Date

**Action:** Select task to view details

---

### Screen 2: Putaway Task Details

**API:** `GET /api/putaway/tasks/:title`

**Display:**
- Task Information
- List of items to put away:
  - Item Code
  - Carton ID (if cartonized)
  - Quantity
  - Current Location (rack/bin) - shows "TBD" if not assigned
  - Status

**Action:** Scan item/carton to assign location

---

### Screen 3: Scan Item/Carton for Putaway

**Workflow:**
1. **Scan Carton ID or Item Code**
   - If cartonized: Scan carton barcode
   - If loose: Scan item barcode or select from list

2. **Scan or Enter Location**
   - **Option A:** Scan location barcode (if available)
   - **Option B:** Manually enter rack/bin
   - **Option C:** Select from location list

3. **Confirm Assignment**
   - Call `POST /api/putaway/scan-transfer-carton`
   - Show success message
   - Update UI to show assigned location

4. **Repeat** for all items

5. **Complete Putaway**
   - When all items assigned, show "Complete Putaway" button
   - Call `POST /api/putaway/complete`
   - Show success message

---

## 🔍 Database Tables

### tabPutawayTask
```sql
CREATE TABLE tabPutawayTask (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  source_type VARCHAR(50),           -- 'ASN', 'TransferIn', etc.
  transfer_in VARCHAR(100),           -- Transfer In title (if source_type = 'TransferIn')
  advance_shipping_notice VARCHAR(100), -- ASN number (if source_type = 'ASN')
  warehouse VARCHAR(100) NOT NULL,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### tabPutawayLine
```sql
CREATE TABLE tabPutawayLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,  -- Putaway Task title
  item_code VARCHAR(100) NOT NULL,
  carton_id VARCHAR(100),               -- NULL for loose items
  qty DECIMAL(10,2) NOT NULL,
  rack VARCHAR(100) DEFAULT 'TBD',     -- "TBD" until assigned
  bin VARCHAR(100) DEFAULT 'TBD',      -- "TBD" until assigned
  status VARCHAR(50) DEFAULT 'Pending', -- Pending, Assigned, Completed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_title) REFERENCES tabPutawayTask(title)
);
```

---

## ✅ Status Flow

### Putaway Task Status:
```
Draft → In Progress → Completed
```

### Putaway Line Status:
```
Pending → Assigned → Completed
```

**Status Transitions:**
- **Draft**: Task created, no items assigned yet
- **In Progress**: At least one item assigned to location
- **Completed**: All items assigned and stock updated

---

## 🎯 Key Points

1. **Automatic Putaway Task Creation**
   - Putaway Task is **automatically created** when all Transfer In items are received
   - No manual intervention required

2. **Location Assignment**
   - Items start with `rack = "TBD"` and `bin = "TBD"`
   - Mobile app operator assigns actual locations during putaway

3. **Stock Update Timing**
   - Stock is **NOT updated** when location is assigned
   - Stock is **ONLY updated** when putaway is completed
   - This ensures accuracy and allows corrections before finalizing

4. **Cartonized vs Loose Items**
   - **Cartonized**: Scan `carton_id` or `box_id` to assign location
   - **Loose**: Scan `item_code` or select from list to assign location

5. **Location Format**
   - Can use `rack` + `bin` (e.g., "RACK-A" + "BIN-01")
   - Or use `location_id` (preferred, if available)
   - Final `bin_location` in stock ledger: `"RACK-A-BIN-01"` or location name

---

## 📝 Example Scenario

**Transfer In:** `INSLIP-0001`
- Item 1: `SKU-HAT-301-BLU-OS`, Qty: 2, Carton: `CTN-001`
- Item 2: `SKU-HAT-301-GRN-OS`, Qty: 2, Carton: `CTN-002`
- Item 3: `SKU-HAT-301-RED-OS`, Qty: 2, Loose (no carton)

**Step 1: Receive Items**
- Mobile app receives all 3 items
- Transfer In status: "Received"
- **Auto-creates Putaway Task:** `PUT-20260105-0001`

**Step 2: Putaway Task Created**
- Task has 3 lines, all with `rack = "TBD"`, `bin = "TBD"`

**Step 3: Assign Locations (Mobile App)**
- Scan `CTN-001` → Assign to `RACK-A`, `BIN-01`
- Scan `CTN-002` → Assign to `RACK-A`, `BIN-02`
- Select `SKU-HAT-301-RED-OS` → Assign to `RACK-A`, `BIN-03`
- Task status: "In Progress"

**Step 4: Complete Putaway**
- Mobile app calls `POST /api/putaway/complete`
- Stock ledger updated:
  - `SKU-HAT-301-BLU-OS` at `RACK-A-BIN-01`: +2
  - `SKU-HAT-301-GRN-OS` at `RACK-A-BIN-02`: +2
  - `SKU-HAT-301-RED-OS` at `RACK-A-BIN-03`: +2
- Task status: "Completed"

---

## 🔗 Related API Endpoints

1. **Receive Transfer In:**
   - `POST /api/transfer-in/:title/receive-line`

2. **Get Putaway Tasks:**
   - `GET /api/putaway/tasks`
   - `GET /api/putaway/tasks/:title`

3. **Scan for Putaway:**
   - `POST /api/putaway/scan-transfer-carton`

4. **Complete Putaway:**
   - `POST /api/putaway/complete`

---

## 📚 Related Documentation

- `MOBILE_APP_TRANSFER_IN_API_DOCUMENTATION.md` - Transfer In API reference
- `CYCLE_COUNT_AND_TRANSFER_IN_DESIGN.md` - Complete design document
- Putaway API documentation (in `wms-api/src/modules/putaway/putawayController.js`)

---

**Status:** ✅ Complete  
**Last Updated:** 2026-01-05

