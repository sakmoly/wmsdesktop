# Inbound Session Tables Reference

## 📋 Tables Involved

### 1. **tabInboundSession** (Main Session Table)
**Purpose:** Stores the main inbound session information

**Primary Key:** `inbound_session`

**Key Columns:**
- `inbound_session` (VARCHAR(100), PRIMARY KEY) - Unique session identifier
- `asn_no` (VARCHAR(100)) - Advance Shipping Notice number
- `status` (VARCHAR(50)) - Session status (Draft, Active, Receiving, Completed, etc.)
- `completed_cartons` (INT) - Number of cartons completed
- `total_cartons` (INT) - Total number of cartons
- `transfer_order` (VARCHAR(100), NULL) - Transfer order number (optional)
- `dock` (VARCHAR(50)) - Dock identifier
- `started_by` (VARCHAR(100)) - User who started the session
- `device_id` (VARCHAR(100)) - Device identifier
- `started_at` (TIMESTAMP) - Session start time
- `ended_at` (TIMESTAMP, NULL) - Session end time
- `completed_on` (TIMESTAMP, NULL) - Completion timestamp
- `created_at` (TIMESTAMP) - Record creation time
- `updated_at` (TIMESTAMP) - Last update time

**Relationships:**
- Parent table for `tabInboundUnloadLine` and `tabInboundReceiveLine`
- References `tabAdvanceShippingNotice` via `asn_no`

---

### 2. **tabInboundUnloadLine** (Unload Lines Table)
**Purpose:** Stores unload records - tracks which units (cartons/pallets) were unloaded and when

**Primary Key:** `id` (AUTO_INCREMENT)

**Foreign Key:** `parent_title` → `tabInboundSession.inbound_session` (ON DELETE CASCADE)

**Key Columns:**
- `id` (INT, AUTO_INCREMENT, PRIMARY KEY)
- `parent_title` (VARCHAR(100), NOT NULL) - References `tabInboundSession.inbound_session`
- `unit_type` (VARCHAR(50)) - Type of unit: "Carton", "Pallet", etc.
- `unit_id` (VARCHAR(100)) - ID of the unit (e.g., "CTN-0101", "PLT-0001")
- `scanned_on` (TIMESTAMP) - When the unit was scanned/unloaded
- `scanned_by` (VARCHAR(100)) - User who scanned/unloaded the unit
- `created_at` (TIMESTAMP) - Record creation time
- `updated_at` (TIMESTAMP) - Last update time

**Indexes:**
- `idx_parent` - Index on `parent_title` for faster lookups
- `idx_unit_id` - Index on `unit_id`

**Example Data:**
```
parent_title: SESSION-MOCK-001
unit_type: Carton
unit_id: CTN-0101
scanned_on: 2025-12-24 18:51:00
scanned_by: USER-MOCK-001
```

---

### 3. **tabInboundReceiveLine** (Receive Lines Table)
**Purpose:** Stores receiving records - tracks which items were received in which cartons with quantities

**Primary Key:** `id` (AUTO_INCREMENT)

**Foreign Key:** `parent_title` → `tabInboundSession.inbound_session` (ON DELETE CASCADE)

**Key Columns:**
- `id` (INT, AUTO_INCREMENT, PRIMARY KEY)
- `parent_title` (VARCHAR(100), NOT NULL) - References `tabInboundSession.inbound_session`
- `carton_id` (VARCHAR(100)) - Carton identifier
- `item_code` (VARCHAR(100)) - Item/SKU code
- `expected_qty` (DECIMAL(10,2)) - Expected quantity
- `received_qty` (DECIMAL(10,2)) - Actual received quantity
- `condition` (VARCHAR(50)) - Condition of items: "Good", "Damaged", etc.
- `remarks` (TEXT, NULL) - Additional notes/remarks
- `created_at` (TIMESTAMP) - Record creation time
- `updated_at` (TIMESTAMP) - Last update time

**Indexes:**
- `idx_parent` - Index on `parent_title`
- `idx_carton_id` - Index on `carton_id`
- `idx_item_code` - Index on `item_code`

**Example Data:**
```
parent_title: SESSION-MOCK-001
carton_id: CTN-0101
item_code: SKU-JEANS-021-BLU-32
expected_qty: 100.00
received_qty: 100.00
condition: Good
remarks: NULL
```

---

## 🔗 Relationships

```
tabInboundSession (1) ──────< (many) tabInboundUnloadLine
     │
     │
     └───────────────< (many) tabInboundReceiveLine
```

- One session can have **many unload lines** (one per carton/pallet unloaded)
- One session can have **many receive lines** (one per item received in a carton)

---

## 📊 Mock Data Inserted

The SQL script inserts:

### Session 1: `SESSION-MOCK-001`
- **Status:** Active
- **ASN:** ASN-0002
- **Unload Lines:** 3 (2 cartons, 1 pallet)
- **Receive Lines:** 4 items across 2 cartons

### Session 2: `SESSION-MOCK-002`
- **Status:** Receiving
- **ASN:** ASN-0001
- **Transfer Order:** TO-0001
- **Unload Lines:** 3 cartons
- **Receive Lines:** 4 items across 3 cartons

---

## 🧪 Verify Data

After running the SQL script, you can verify with:

```sql
-- Check sessions
SELECT * FROM tabInboundSession WHERE inbound_session LIKE 'SESSION-MOCK%';

-- Check unload lines
SELECT * FROM tabInboundUnloadLine WHERE parent_title LIKE 'SESSION-MOCK%';

-- Check receive lines
SELECT * FROM tabInboundReceiveLine WHERE parent_title LIKE 'SESSION-MOCK%';

-- Count lines per session
SELECT 
    s.inbound_session,
    s.status,
    COUNT(DISTINCT ul.id) as unload_lines_count,
    COUNT(DISTINCT rl.id) as receive_lines_count
FROM tabInboundSession s
LEFT JOIN tabInboundUnloadLine ul ON s.inbound_session = ul.parent_title
LEFT JOIN tabInboundReceiveLine rl ON s.inbound_session = rl.parent_title
WHERE s.inbound_session LIKE 'SESSION-MOCK%'
GROUP BY s.inbound_session, s.status;
```

---

## 📝 Notes

1. **Foreign Key Constraint:** Both `tabInboundUnloadLine` and `tabInboundReceiveLine` have `ON DELETE CASCADE`, meaning if a session is deleted, all its unload and receive lines are automatically deleted.

2. **Data Integrity:** The `parent_title` in child tables must match an existing `inbound_session` value in `tabInboundSession`.

3. **Status Values:** Session status typically follows: Draft → Active → Receiving → Completed

4. **Unit Types:** Common unit types in `tabInboundUnloadLine` are: "Carton", "Pallet", "Box"

5. **Condition Values:** Common condition values in `tabInboundReceiveLine` are: "Good", "Damaged", "Missing"

