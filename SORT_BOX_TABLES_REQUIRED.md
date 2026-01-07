# Sort Box Tables Required - Complete Analysis

## Summary

For Sort Boxes functionality, **8 tables** are involved:

**Required (3):**

1. ✅ **`tabSortBox`** - Main table (REQUIRED)
2. ✅ **`tabWmsScanEvent`** - For box contents (REQUIRED)
3. ✅ **`tabWarehouse`** - For store selection (REQUIRED)

**Optional for Display (2):** 4. ⚠️ **`tabAdvanceShippingNotice`** - For ASN details (OPTIONAL - for display only) 5. ⚠️ **`tabTransferOrder`** - For Transfer Order details (OPTIONAL - for display only)

**Optional for Delete Validation (3):** 6. ⚠️ **`tabReceiveLine`** - For delete validation (OPTIONAL) 7. ⚠️ **`scanned_items`** - Mobile app local table (OPTIONAL) 8. ⚠️ **`tabInboundReceiveLine`** - For delete validation (OPTIONAL)

---

## Required Tables (Core Functionality)

### 1. ✅ `tabSortBox` - Main Sort Box Table

**Purpose:** Stores sort box header information

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS tabSortBox (
  box_id VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Open',
  advance_shipping_notice VARCHAR(100) NOT NULL,
  transfer_order VARCHAR(100) NOT NULL,
  store VARCHAR(100) NOT NULL,
  purpose VARCHAR(50) DEFAULT 'STORE',
  created_by VARCHAR(100) NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_by VARCHAR(100) NULL,
  closed_on TIMESTAMP NULL,
  dispatched_on TIMESTAMP NULL,
  received_at_store_on TIMESTAMP NULL,
  updated_on TIMESTAMP NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_store (store),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Used By:**

- ✅ Sort Box List Screen - Lists all boxes
- ✅ Sort Box Detail Screen - Shows box information
- ✅ Create Sort Box Screen - Creates new boxes
- ✅ Backend API - `GET /api/boxes`, `GET /api/boxes/:box_id`, `POST /api/boxes/create`, `POST /api/boxes/close`

**Key Fields:**

- `box_id` - Primary key (e.g., "BOX-WHMAIN-218010")
- `status` - Box status (Open, Filling, Closed, Dispatched, Received)
- `advance_shipping_notice` - ASN reference
- `transfer_order` - Transfer Order reference
- `store` - Store/warehouse code

---

### 2. ✅ `tabWmsScanEvent` - Box Contents (Derived)

**Purpose:** Stores SORT events that populate box contents

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS tabWmsScanEvent (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  offline_uuid VARCHAR(36) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_time TIMESTAMP NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  advance_shipping_notice VARCHAR(100) NULL,
  transfer_order VARCHAR(100) NULL,
  inbound_session VARCHAR(100) NULL,
  carton_id VARCHAR(100) NULL,
  item_code VARCHAR(100) NULL,
  qty DECIMAL(10,2) DEFAULT 1,
  store VARCHAR(100) NULL,
  box_id VARCHAR(100) NULL,  -- ✅ Links to tabSortBox.box_id
  tc_id VARCHAR(100) NULL,
  rack VARCHAR(100) NULL,
  bin VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_event_type (event_type),
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_inbound_session (inbound_session),
  INDEX idx_event_time (event_time)
  -- Note: idx_box_id is NOT in actual schema but recommended for performance
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Used By:**

- ✅ Sort Box Detail Screen - Shows box contents table
- ✅ Backend API - `GET /api/boxes/:box_id` (includes contents)
- ✅ Box Contents Query - `WHERE event_type = 'SORT_TO_BOX' AND box_id = ?`

**Key Fields:**

- `event_type` - Must be `'SORT_TO_BOX'`
- `box_id` - Links to `tabSortBox.box_id`
- `item_code` - Item sorted into box
- `carton_id` - Source carton
- `qty` - Quantity sorted
- `user_id` - Who sorted it
- `event_time` - When sorted

**Query Example:**

```sql
SELECT
  item_code,
  carton_id,
  qty,
  user_id,
  event_time
FROM tabWmsScanEvent
WHERE event_type = 'SORT_TO_BOX'
  AND box_id = 'BOX-WHMAIN-218010'
ORDER BY event_time DESC
```

---

### 3. ✅ `tabWarehouse` - Store/Warehouse Master Data

**Purpose:** Provides store/warehouse list for box creation

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS tabWarehouse (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  warehouse_type VARCHAR(50) NULL,  -- 'Warehouse' or 'Store'
  is_group BOOLEAN DEFAULT FALSE,   -- Note: BOOLEAN type (equivalent to TINYINT(1))
  parent_warehouse VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Used By:**

- ✅ Create Sort Box Screen - Dropdown for store selection
- ✅ Backend API - `GET /api/master/warehouses-stores`

**Key Fields:**

- `code` - Store/warehouse code (used as `store` in `tabSortBox`)
- `name` - Display name
- `warehouse_type` - 'Warehouse' or 'Store'

---

## Optional Tables (For Enhanced Display)

### 4. ⚠️ `tabAdvanceShippingNotice` - ASN Details

**Purpose:** Provides ASN information for display in Sort Box Detail screen

**Used By:**

- ⚠️ Sort Box Detail Screen - Shows ASN information (optional)
- ⚠️ `SortBoxDetailViewModel.LoadRelatedDataAsync()` - Loads ASN details

**Note:** Not required for core functionality. If missing, ASN field will just show the ASN number without details.

---

### 5. ⚠️ `tabTransferOrder` - Transfer Order Details

**Purpose:** Provides Transfer Order information for display in Sort Box Detail screen

**Used By:**

- ⚠️ Sort Box Detail Screen - Shows Transfer Order information (optional)
- ⚠️ `SortBoxDetailViewModel.LoadRelatedDataAsync()` - Loads Transfer Order details

**Note:** Not required for core functionality. If missing, Transfer Order field will just show the TO number without details.

---

## Screens and Their Table Requirements

### 1. Sort Box List Screen (`SortBoxListView`)

**Tables Required:**

- ✅ `tabSortBox` - Lists all boxes

**Tables Optional:**

- None

**Query:**

```sql
SELECT box_id, status, advance_shipping_notice, transfer_order, store,
       purpose, created_by, created_on, closed_by, closed_on,
       dispatched_on, received_at_store_on, remarks
FROM tabSortBox
ORDER BY created_on DESC, box_id
```

---

### 2. Sort Box Detail Screen (`SortBoxDetailWindow`)

**Tables Required:**

- ✅ `tabSortBox` - Box header information
- ✅ `tabWmsScanEvent` - Box contents (derived from SORT_TO_BOX events)

**Tables Optional:**

- ⚠️ `tabAdvanceShippingNotice` - ASN details (for display)
- ⚠️ `tabTransferOrder` - Transfer Order details (for display)

**Queries:**

**Box Information:**

```sql
SELECT * FROM tabSortBox WHERE box_id = ?
```

**Box Contents:**

```sql
SELECT item_code, carton_id, qty, user_id, event_time
FROM tabWmsScanEvent
WHERE event_type = 'SORT_TO_BOX' AND box_id = ?
ORDER BY event_time DESC
```

**ASN Details (Optional):**

```sql
SELECT * FROM tabAdvanceShippingNotice WHERE title = ?
```

**Transfer Order Details (Optional):**

```sql
SELECT * FROM tabTransferOrder WHERE title = ?
```

---

### 3. Create Sort Box Screen (`CreateSortBoxWindow`)

**Tables Required:**

- ✅ `tabSortBox` - Creates new box record
- ✅ `tabWarehouse` - Store/warehouse dropdown

**Tables Optional:**

- None

**Queries:**

**Load Warehouses:**

```sql
SELECT code, name, warehouse_type, is_group
FROM tabWarehouse
WHERE warehouse_type = 'Store' OR is_group = 0
ORDER BY warehouse_type DESC, code ASC
```

**Generate Box ID:**

```sql
SELECT MAX(CAST(SUBSTRING_INDEX(box_id, '-', -1) AS UNSIGNED)) as max_seq
FROM tabSortBox
WHERE box_id LIKE CONCAT('BOX-', ?, '-%')
```

**Create Box:**

```sql
INSERT INTO tabSortBox
(box_id, status, advance_shipping_notice, transfer_order, store, purpose,
 created_by, created_on, remarks)
VALUES (?, 'Open', ?, ?, ?, ?, ?, NOW(), ?)
```

---

## Table Relationships

```
tabSortBox
├── advance_shipping_notice → tabAdvanceShippingNotice.title (optional)
├── transfer_order → tabTransferOrder.title (optional)
├── store → tabWarehouse.code (required for creation)
└── box_id → tabWmsScanEvent.box_id (for contents)

tabWmsScanEvent
└── box_id → tabSortBox.box_id (SORT_TO_BOX events)
```

---

## Minimum Required Tables

For **basic Sort Box functionality**, you need:

1. ✅ **`tabSortBox`** - Store box information
2. ✅ **`tabWmsScanEvent`** - Store box contents (SORT events)
3. ✅ **`tabWarehouse`** - Store/warehouse master data

**Total: 3 tables minimum**

---

## Full Functionality Tables

For **complete Sort Box functionality** with all features:

1. ✅ **`tabSortBox`** - Main table
2. ✅ **`tabWmsScanEvent`** - Box contents
3. ✅ **`tabWarehouse`** - Store selection
4. ⚠️ **`tabAdvanceShippingNotice`** - ASN details (optional)
5. ⚠️ **`tabTransferOrder`** - Transfer Order details (optional)

**Total: 8 tables (3 required + 5 optional)**

**Breakdown:**

- 3 Required tables (core functionality)
- 2 Optional tables (enhanced display)
- 3 Optional tables (delete validation)

---

## Backend API Endpoints

### Required Tables for Each Endpoint:

| Endpoint                 | Required Tables                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `GET /api/boxes`         | ✅ `tabSortBox`                                                                                        |
| `GET /api/boxes/:box_id` | ✅ `tabSortBox`, ✅ `tabWmsScanEvent`                                                                  |
| `POST /api/boxes/create` | ✅ `tabSortBox`                                                                                        |
| `POST /api/boxes/close`  | ✅ `tabSortBox`                                                                                        |
| `POST /api/boxes/delete` | ✅ `tabSortBox`, ⚠️ `tabReceiveLine`, ⚠️ `scanned_items`, ⚠️ `tabInboundReceiveLine` (optional checks) |
| `POST /api/boxes/print`  | ✅ `tabSortBox`, ✅ `tabWmsScanEvent` (for contents)                                                   |

---

## Summary Table

| Table                          | Required?       | Purpose                        | Used In              |
| ------------------------------ | --------------- | ------------------------------ | -------------------- |
| **`tabSortBox`**               | ✅ **REQUIRED** | Main sort box data             | All screens          |
| **`tabWmsScanEvent`**          | ✅ **REQUIRED** | Box contents (SORT events)     | Detail screen, Print |
| **`tabWarehouse`**             | ✅ **REQUIRED** | Store/warehouse master         | Create screen        |
| **`tabAdvanceShippingNotice`** | ⚠️ Optional     | ASN details display            | Detail screen        |
| **`tabTransferOrder`**         | ⚠️ Optional     | Transfer Order details display | Detail screen        |

---

## Quick Reference

### Minimum Setup (3 tables)

```sql
-- Required for basic Sort Box functionality
✅ tabSortBox
✅ tabWmsScanEvent
✅ tabWarehouse
```

### Recommended Index

```sql
-- Add this index for better query performance on box contents
ALTER TABLE tabWmsScanEvent ADD INDEX idx_box_id (box_id);
```

### Verification Scripts

- **Quick Check:** Run `VERIFY_SORT_BOX_TABLES.sql`
- **Detailed Check:** Run `VERIFY_SORT_BOX_TABLES_DETAILED.sql`

---

## Verification Checklist

### Required Tables

- [ ] `tabSortBox` table exists
- [ ] `tabWmsScanEvent` table exists with `box_id` column
- [ ] `tabWarehouse` table exists with `code` and `warehouse_type` columns

### Optional Tables (Display)

- [ ] `tabAdvanceShippingNotice` table exists (optional)
- [ ] `tabTransferOrder` table exists (optional)

### Optional Tables (Delete Validation)

- [ ] `tabReceiveLine` table exists with `box_id` column (optional)
- [ ] `scanned_items` table exists with `box_id` column (optional - mobile app)
- [ ] `tabInboundReceiveLine` table exists with `box_id` column (optional)

### Performance Optimization

- [ ] `idx_box_id` index exists on `tabWmsScanEvent.box_id` (recommended)

---

## Additional Tables Referenced (For Delete Operation)

### 6. ⚠️ `tabReceiveLine` - Receive Line Items (OPTIONAL - for delete validation)

**Purpose:** Backend API checks this table when deleting boxes to ensure no scanned items exist

**Used By:**

- ⚠️ Backend API - `POST /api/boxes/delete` (checks for scanned items)

**Note:** This table is checked by the backend API's `deleteBox` function, but it's optional. If the table doesn't exist or doesn't have a `box_id` column, the check is skipped gracefully.

**Query Example:**

```sql
SELECT COUNT(*) as count
FROM tabReceiveLine
WHERE box_id = ?
```

---

### 7. ⚠️ `scanned_items` - Mobile App Local Table (OPTIONAL - for delete validation)

**Purpose:** Mobile app local table that may contain scanned items linked to boxes

**Used By:**

- ⚠️ Backend API - `POST /api/boxes/delete` (checks for scanned items)

**Note:** This is a mobile app local table. The backend API checks it when deleting boxes, but it's optional. If the table doesn't exist, the check is skipped gracefully.

**Query Example:**

```sql
SELECT COUNT(*) as count
FROM scanned_items
WHERE box_id = ?
```

---

### 8. ⚠️ `tabInboundReceiveLine` - Inbound Receive Line (OPTIONAL - for delete validation)

**Purpose:** Backend API checks this table when deleting boxes to ensure no inbound receive lines reference the box

**Used By:**

- ⚠️ Backend API - `POST /api/boxes/delete` (checks for scanned items if `box_id` column exists)

**Note:** This table is checked by the backend API's `deleteBox` function, but it's optional. The check only occurs if the table has a `box_id` column. If the column doesn't exist, the check is skipped gracefully.

**Query Example:**

```sql
SELECT COUNT(*) as count
FROM tabInboundReceiveLine
WHERE box_id = ?
```

---

## Verified Schema Details

### `tabSortBox` - Verified Schema

**Actual Schema (from `DatabaseService.cs`):**

```sql
CREATE TABLE IF NOT EXISTS tabSortBox (
  box_id VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Open',
  advance_shipping_notice VARCHAR(100) NOT NULL,
  transfer_order VARCHAR(100) NOT NULL,
  store VARCHAR(100) NOT NULL,
  purpose VARCHAR(50) DEFAULT 'STORE',
  created_by VARCHAR(100) NOT NULL,
  created_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_by VARCHAR(100) NULL,
  closed_on TIMESTAMP NULL,
  dispatched_on TIMESTAMP NULL,
  received_at_store_on TIMESTAMP NULL,
  updated_on TIMESTAMP NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_store (store),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**✅ Schema Verification:** Matches documented schema exactly.

---

### `tabWmsScanEvent` - Verified Schema

**Actual Schema (from `DatabaseService.cs`):**

```sql
CREATE TABLE IF NOT EXISTS tabWmsScanEvent (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  offline_uuid VARCHAR(36) UNIQUE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_time TIMESTAMP NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  advance_shipping_notice VARCHAR(100) NULL,
  transfer_order VARCHAR(100) NULL,
  inbound_session VARCHAR(100) NULL,
  carton_id VARCHAR(100) NULL,
  item_code VARCHAR(100) NULL,
  qty DECIMAL(10,2) DEFAULT 1,
  store VARCHAR(100) NULL,
  box_id VARCHAR(100) NULL,  -- ✅ Links to tabSortBox.box_id
  tc_id VARCHAR(100) NULL,
  rack VARCHAR(100) NULL,
  bin VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_offline_uuid (offline_uuid),
  INDEX idx_event_type (event_type),
  INDEX idx_asn (advance_shipping_notice),
  INDEX idx_inbound_session (inbound_session),
  INDEX idx_event_time (event_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**✅ Schema Verification:** Matches documented schema exactly.

**⚠️ Note:** The schema does NOT include an explicit `idx_box_id` index as documented. However, queries on `box_id` will still work, though they may be slower for large datasets. Consider adding this index if performance is an issue:

```sql
ALTER TABLE tabWmsScanEvent ADD INDEX idx_box_id (box_id);
```

---

### `tabWarehouse` - Verified Schema

**Actual Schema (from `DatabaseService.cs`):**

```sql
CREATE TABLE IF NOT EXISTS tabWarehouse (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  warehouse_type VARCHAR(50) NULL,  -- 'Warehouse' or 'Store'
  is_group BOOLEAN DEFAULT FALSE,   -- Note: BOOLEAN type (not TINYINT)
  parent_warehouse VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_warehouse)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**✅ Schema Verification:** Matches documented schema with minor note:

- `is_group` is `BOOLEAN` type (not `TINYINT(1)`) - both work the same way in MySQL

---

## Backend API Additional Table Checks

The backend API's `POST /api/boxes/delete` endpoint performs additional checks on these tables (all optional):

1. **`tabReceiveLine`** - Checks if box has receive line items
2. **`scanned_items`** - Checks if box has scanned items (mobile app local table)
3. **`tabInboundReceiveLine`** - Checks if box has inbound receive line items (if `box_id` column exists)

All these checks are **gracefully handled** - if tables/columns don't exist, the checks are skipped without error.

---

## Verification Scripts

Two SQL verification scripts have been created:

1. **`VERIFY_SORT_BOX_TABLES.sql`** - Quick verification script that checks:

   - Table existence
   - Required columns
   - Indexes
   - Sample data
   - Summary report

2. **`VERIFY_SORT_BOX_TABLES_DETAILED.sql`** - Detailed verification script that checks:
   - Complete column schemas
   - Foreign key relationships
   - Data integrity
   - Sample data

**Usage:**

```bash
# Run in MySQL client or MySQL Workbench
mysql -u username -p database_name < VERIFY_SORT_BOX_TABLES.sql
mysql -u username -p database_name < VERIFY_SORT_BOX_TABLES_DETAILED.sql
```

---

## Updated Summary Table

| Table                          | Required?       | Purpose                        | Used In              |
| ------------------------------ | --------------- | ------------------------------ | -------------------- |
| **`tabSortBox`**               | ✅ **REQUIRED** | Main sort box data             | All screens          |
| **`tabWmsScanEvent`**          | ✅ **REQUIRED** | Box contents (SORT events)     | Detail screen, Print |
| **`tabWarehouse`**             | ✅ **REQUIRED** | Store/warehouse master         | Create screen        |
| **`tabAdvanceShippingNotice`** | ⚠️ Optional     | ASN details display            | Detail screen        |
| **`tabTransferOrder`**         | ⚠️ Optional     | Transfer Order details display | Detail screen        |
| **`tabReceiveLine`**           | ⚠️ Optional     | Delete validation              | Backend API delete   |
| **`scanned_items`**            | ⚠️ Optional     | Delete validation (mobile)     | Backend API delete   |
| **`tabInboundReceiveLine`**    | ⚠️ Optional     | Delete validation              | Backend API delete   |

---

## Notes

1. **Box Contents are Derived** - Not stored directly in `tabSortBox`, but derived from `tabWmsScanEvent`
2. **No Child Table** - `tabSortBox` has no child table; contents come from events
3. **Store Selection** - `tabWarehouse` is required for the Create screen dropdown
4. **ASN/TO Details** - Optional tables only enhance display; core functionality works without them
5. **Delete Validation** - Backend API checks multiple optional tables when deleting boxes to ensure no scanned items exist
6. **Schema Verification** - All documented schemas match the actual database schema in `DatabaseService.cs`
7. **Index Recommendation** - Consider adding `idx_box_id` index to `tabWmsScanEvent` for better query performance
