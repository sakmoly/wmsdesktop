# Inbound Session Tables Summary

## 📋 Three Tables Involved

### 1. **tabInboundSession** (Main/Parent Table)
**Primary Key:** `inbound_session`

**Columns:**
- `inbound_session` - Session ID (PRIMARY KEY)
- `asn_no` - ASN number
- `status` - Session status (Active, Receiving, Completed, etc.)
- `completed_cartons` - Number of cartons completed
- `total_cartons` - Total cartons
- `transfer_order` - Transfer order (optional)
- `dock` - Dock identifier
- `started_by` - User who started
- `device_id` - Device ID
- `started_at` - Start timestamp
- `ended_at` - End timestamp (optional)
- `completed_on` - Completion timestamp (optional)

---

### 2. **tabInboundUnloadLine** (Child Table - Unload Records)
**Primary Key:** `id` (auto-increment)

**Columns:**
- `id` - Auto-increment ID
- `parent_title` - References `tabInboundSession.inbound_session`
- `unit_type` - Type: "Carton", "Pallet", etc.
- `unit_id` - Unit ID (e.g., "CTN-0101")
- `scanned_on` - When scanned/unloaded
- `scanned_by` - User who scanned

**Relationship:** Many unload lines belong to one session

---

### 3. **tabInboundReceiveLine** (Child Table - Receive Records)
**Primary Key:** `id` (auto-increment)

**Columns:**
- `id` - Auto-increment ID
- `parent_title` - References `tabInboundSession.inbound_session`
- `carton_id` - Carton identifier
- `item_code` - Item/SKU code
- `expected_qty` - Expected quantity
- `received_qty` - Actual received quantity
- `condition` - "Good", "Damaged", etc.
- `remarks` - Notes (optional)

**Relationship:** Many receive lines belong to one session

---

## 📊 Mock Data Created

The SQL script (`INSERT_MOCK_INBOUND_SESSION_DATA.sql`) inserts:

**Session 1: SESSION-MOCK-001**
- 3 Unload Lines (2 cartons, 1 pallet)
- 4 Receive Lines (items in 2 cartons)

**Session 2: SESSION-MOCK-002**
- 3 Unload Lines (3 cartons)
- 4 Receive Lines (items in 3 cartons)

---

## 🔗 Relationships

```
tabInboundSession (1)
    │
    ├───< (many) tabInboundUnloadLine
    │
    └───< (many) tabInboundReceiveLine
```

All child records are linked via `parent_title` = `inbound_session`

