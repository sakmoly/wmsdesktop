# Showroom Transfer In and Material Request Management

## 📋 Overview

The WMS needs to handle two additional scenarios:

1. **Putaway from Transfer In (Showroom)** - Items transferred FROM showroom TO warehouse
2. **Picking for Material Request (Showroom)** - Items picked FROM warehouse TO showroom

---

## 🔄 Current System vs. Extended System

### Current System

| Operation     | Source Document               | Reference          |
| ------------- | ----------------------------- | ------------------ |
| **Receiving** | ASN (Advance Shipping Notice) | From Supplier      |
| **Putaway**   | Putaway Task (linked to ASN)  | From ASN receiving |
| **Picking**   | Transfer Order                | To Stores          |

### Extended System (With Showroom Support)

| Operation     | Source Document  | Reference               | Direction            |
| ------------- | ---------------- | ----------------------- | -------------------- |
| **Receiving** | ASN              | From Supplier           | Supplier → Warehouse |
| **Receiving** | Transfer In      | From Showroom           | Showroom → Warehouse |
| **Putaway**   | Putaway Task     | From ASN or Transfer In | Dock → Storage       |
| **Picking**   | Transfer Order   | To Stores               | Warehouse → Stores   |
| **Picking**   | Material Request | To Showroom             | Warehouse → Showroom |

---

## 🗄️ Database Schema Extensions

### 1. Add Transfer In Table

```sql
-- Transfer In (from Showroom to Warehouse)
CREATE TABLE IF NOT EXISTS tabTransferIn (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft', -- Draft, Submitted, In Transit, Received, Completed
  from_showroom VARCHAR(100) NOT NULL, -- Showroom code/name
  to_warehouse VARCHAR(100) NOT NULL, -- Warehouse code
  transfer_date DATE NOT NULL,
  expected_arrival_date DATE NULL,
  prepared_by VARCHAR(100) NOT NULL,
  received_by VARCHAR(100) NULL,
  received_on TIMESTAMP NULL,
  total_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_showroom (from_showroom),
  INDEX idx_to_warehouse (to_warehouse),
  INDEX idx_status (status),
  INDEX idx_transfer_date (transfer_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transfer In Item (Child Table)
CREATE TABLE IF NOT EXISTS tabTransferInItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  qty DECIMAL(10,2) NOT NULL,
  carton_id VARCHAR(100) NULL,
  received_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_title) REFERENCES tabTransferIn(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2. Add Material Request Table

```sql
-- Material Request (from Showroom to Warehouse)
CREATE TABLE IF NOT EXISTS tabMaterialRequest (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft', -- Draft, Submitted, In Progress, Picked, Dispatched, Completed
  from_warehouse VARCHAR(100) NOT NULL, -- Warehouse code
  to_showroom VARCHAR(100) NOT NULL, -- Showroom code/name
  requested_date DATE NOT NULL,
  required_date DATE NULL,
  requested_by VARCHAR(100) NOT NULL,
  total_requested_qty DECIMAL(10,2) DEFAULT 0,
  total_picked_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_warehouse (from_warehouse),
  INDEX idx_to_showroom (to_showroom),
  INDEX idx_status (status),
  INDEX idx_required_date (required_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Material Request Item (Child Table)
CREATE TABLE IF NOT EXISTS tabMaterialRequestItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  requested_qty DECIMAL(10,2) NOT NULL,
  picked_qty DECIMAL(10,2) DEFAULT 0,
  pending_qty DECIMAL(10,2) AS (requested_qty - picked_qty) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  FOREIGN KEY (parent_title) REFERENCES tabMaterialRequest(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3. Extend Putaway Task Table

```sql
-- Add source_type column to distinguish ASN vs Transfer In
ALTER TABLE tabPutawayTask
ADD COLUMN source_type VARCHAR(50) DEFAULT 'ASN' AFTER status,
ADD COLUMN transfer_in VARCHAR(100) NULL AFTER advance_shipping_notice,
ADD INDEX idx_source_type (source_type),
ADD INDEX idx_transfer_in (transfer_in);

-- Update existing records
UPDATE tabPutawayTask SET source_type = 'ASN' WHERE source_type IS NULL;
```

**Note:** `advance_shipping_notice` can remain for ASN-based putaway, and `transfer_in` will be used for Transfer In-based putaway.

---

## 🔧 Code Changes Required

### 1. Extend Putaway Task Model

```csharp
// Models/PutawayTask.cs
public sealed class PutawayTask
{
    public string Title { get; init; } = string.Empty;
    public string Status { get; init; } = "Draft";
    public string SourceType { get; init; } = "ASN"; // "ASN" or "TransferIn"

    // For ASN-based putaway
    public string? AdvanceShippingNotice { get; init; }

    // For Transfer In-based putaway
    public string? TransferIn { get; init; }

    public string InboundSession { get; init; } = string.Empty;
    public string CreatedBy { get; init; } = string.Empty;

    public IReadOnlyList<PutawayLine> Lines { get; init; } = Array.Empty<PutawayLine>();
}
```

### 2. Extend Inbound Session to Support Transfer In

```sql
-- Add transfer_in column to tabInboundSession
ALTER TABLE tabInboundSession
ADD COLUMN transfer_in VARCHAR(100) NULL AFTER transfer_order,
ADD INDEX idx_transfer_in (transfer_in);
```

### 3. Create Transfer In Service

```csharp
// Services/TransferInDataService.cs
public static class TransferInDataService
{
    public static async Task<List<TransferIn>> GetTransferInsAsync(WmsSettings settings)
    {
        // Similar to AsnDataService but for Transfer In
        // Query tabTransferIn and tabTransferInItem
    }

    public static async Task<bool> CreateInboundSessionFromTransferInAsync(
        WmsSettings settings,
        string transferInTitle,
        string dock,
        string startedBy)
    {
        // Create inbound session for Transfer In (similar to ASN)
        // Set transfer_in field instead of asn_no
    }
}
```

### 4. Extend Putaway Task Creation

```csharp
// Services/PutawayTaskDataService.cs
public static async Task<bool> CreatePutawayTaskFromTransferInAsync(
    WmsSettings settings,
    string transferInTitle,
    string inboundSessionTitle)
{
    // Create putaway task for Transfer In
    // Set source_type = 'TransferIn' and transfer_in = transferInTitle
}
```

### 5. Create Material Request Service

```csharp
// Services/MaterialRequestDataService.cs
public static class MaterialRequestDataService
{
    public static async Task<List<MaterialRequest>> GetMaterialRequestsAsync(WmsSettings settings)
    {
        // Query tabMaterialRequest and tabMaterialRequestItem
    }
}
```

### 6. Extend Picking Transaction Creation

```csharp
// Services/WmsTransactionAutoCreateService.cs
public static async Task<bool> CreatePickingTransactionFromMaterialRequestAsync(
    WmsSettings settings,
    string materialRequestTitle)
{
    // Similar to CreatePickingTransactionFromTransferOrderAsync
    // But reference Material Request instead of Transfer Order
    // Set reference_doc_type = "Material Request"
    // Set reference_doc = materialRequestTitle
}
```

---

## 📊 Workflow Examples

### Workflow 1: Transfer In from Showroom → Putaway

```
1. Showroom creates Transfer In
   └── TI-0001: From SHOWROOM-001 to WH-MAIN
       ├── Item A: 50 units
       └── Item B: 30 units

2. Warehouse receives Transfer In
   └── Inbound Session Created: SESSION-TI0001-DEVICE4-USER4
       ├── transfer_in: "TI-0001"
       └── status: "Receiving"

3. Receiving Transaction Auto-Created
   └── REC-TI0001-20251227
       ├── Operation: Receiving
       ├── Reference Doc Type: "Transfer In"
       ├── Reference Doc: "TI-0001"
       └── Items: All items from TI-0001

4. Putaway Task Created
   └── PUT-0006
       ├── source_type: "TransferIn"
       ├── transfer_in: "TI-0001"
       ├── inbound_session: "SESSION-TI0001-DEVICE4-USER4"
       └── Lines: Items to put away

5. Putaway Transaction Auto-Created
   └── PUT-TASK006-20251227
       ├── Operation: Putaway
       ├── Reference Doc Type: "Putaway Task"
       ├── Reference Doc: "PUT-0006"
       └── Items: Items with target bins
```

### Workflow 2: Material Request from Showroom → Picking

```
1. Showroom creates Material Request
   └── MR-0001: From WH-MAIN to SHOWROOM-001
       ├── Item A: 100 units
       └── Item B: 50 units

2. Warehouse processes Material Request
   └── Material Request status: "Submitted" → "In Progress"

3. Picking Transaction Auto-Created
   └── PICK-MR0001-20251227
       ├── Operation: Picking
       ├── Reference Doc Type: "Material Request"
       ├── Reference Doc: "MR-0001"
       ├── Source Warehouse: "WH-MAIN"
       ├── Target Warehouse: "SHOWROOM-001"
       └── Items:
           - Item A: 100 units (from RACK-A-01-BIN-05)
           - Item B: 50 units (from RACK-B-02-BIN-10)

4. Operators pick items
   └── Update picked_qty in tabMaterialRequestItem
   └── Update assignment_status in tabWmsTransactionDetail

5. When Picking Transaction Completed
   └── Send to ERPNext as Material Transfer
       ├── From: WH-MAIN
       └── To: SHOWROOM-001
```

---

## 🔍 Key Implementation Points

### 1. Putaway Task Source Type

**Current:**

- Putaway Tasks only reference ASN via `advance_shipping_notice`

**Extended:**

- Add `source_type` column: `'ASN'` or `'TransferIn'`
- If `source_type = 'ASN'`: Use `advance_shipping_notice`
- If `source_type = 'TransferIn'`: Use `transfer_in`

**Query Example:**

```sql
SELECT
    pt.title,
    pt.source_type,
    CASE
        WHEN pt.source_type = 'ASN' THEN pt.advance_shipping_notice
        WHEN pt.source_type = 'TransferIn' THEN pt.transfer_in
    END as source_document
FROM tabPutawayTask pt;
```

### 2. Inbound Session Source Type

**Current:**

- Inbound Sessions reference ASN via `asn_no`

**Extended:**

- Add `transfer_in` column
- If `transfer_in IS NOT NULL`: Source is Transfer In
- If `asn_no IS NOT NULL`: Source is ASN

**Query Example:**

```sql
SELECT
    inbound_session,
    COALESCE(asn_no, transfer_in) as source_document,
    CASE
        WHEN asn_no IS NOT NULL THEN 'ASN'
        WHEN transfer_in IS NOT NULL THEN 'TransferIn'
    END as source_type
FROM tabInboundSession;
```

### 3. WMS Transaction Reference Document

**Current:**

- Receiving: `reference_doc_type = 'Advance Shipping Notice'`, `reference_doc = ASN number`
- Picking: `reference_doc_type = 'Transfer Order'`, `reference_doc = TO number`

**Extended:**

- Receiving: Can also be `reference_doc_type = 'Transfer In'`, `reference_doc = TI number`
- Picking: Can also be `reference_doc_type = 'Material Request'`, `reference_doc = MR number`

**Query Example:**

```sql
SELECT
    title,
    operation_type,
    reference_doc_type,
    reference_doc,
    source_warehouse,
    target_warehouse
FROM tabWmsTransaction
WHERE operation_type IN ('Receiving', 'Picking')
ORDER BY transaction_date DESC;
```

---

## 📱 UI Changes Required

### 1. Add Transfer In List View

- Similar to ASN List View
- Show Transfer Ins from showrooms
- Create Inbound Session from Transfer In

### 2. Add Material Request List View

- Similar to Transfer Order List View
- Show Material Requests from showrooms
- Auto-create Picking Transaction when submitted

### 3. Update Putaway Task List View

- Add column for `Source Type` (ASN / Transfer In)
- Add column for `Source Document` (ASN number or Transfer In number)

### 4. Update WMS Transaction List View

- Filter by `reference_doc_type` to show:
  - Receiving: ASN or Transfer In
  - Picking: Transfer Order or Material Request

---

## 🔄 ERPNext Integration

### Transfer In → Stock Entry

**When:** Receiving Transaction completed for Transfer In

**Stock Entry Type:** `Material Transfer`

```json
{
  "stock_entry_type": "Material Transfer",
  "from_warehouse": "SHOWROOM-001",
  "to_warehouse": "WH-MAIN",
  "posting_date": "2025-12-27",
  "reference_doctype": "Transfer In",
  "reference_docname": "TI-0001",
  "items": [
    {
      "item_code": "SKU-001",
      "qty": 50,
      "s_warehouse": "SHOWROOM-001",
      "t_warehouse": "WH-MAIN"
    }
  ]
}
```

### Material Request → Stock Entry

**When:** Picking Transaction completed for Material Request

**Stock Entry Type:** `Material Transfer`

```json
{
  "stock_entry_type": "Material Transfer",
  "from_warehouse": "WH-MAIN",
  "to_warehouse": "SHOWROOM-001",
  "posting_date": "2025-12-27",
  "reference_doctype": "Material Request",
  "reference_docname": "MR-0001",
  "items": [
    {
      "item_code": "SKU-001",
      "qty": 100,
      "s_warehouse": "WH-MAIN",
      "t_warehouse": "SHOWROOM-001"
    }
  ]
}
```

---

## ✅ Summary

### Putaway from Transfer In (Showroom)

1. **Create Transfer In** in ERPNext or WMS
2. **Create Inbound Session** for Transfer In (similar to ASN)
3. **Auto-create Receiving Transaction** (reference: Transfer In)
4. **Create Putaway Task** with `source_type = 'TransferIn'`
5. **Auto-create Putaway Transaction** (reference: Putaway Task)
6. **Send to ERPNext** as Material Transfer when completed

### Picking for Material Request (Showroom)

1. **Create Material Request** in ERPNext or WMS
2. **Auto-create Picking Transaction** (reference: Material Request)
3. **Operators pick items** from storage bins
4. **Update Material Request** with picked quantities
5. **Send to ERPNext** as Material Transfer when completed

### Key Database Changes

1. ✅ Add `tabTransferIn` and `tabTransferInItem` tables
2. ✅ Add `tabMaterialRequest` and `tabMaterialRequestItem` tables
3. ✅ Extend `tabPutawayTask` with `source_type` and `transfer_in` columns
4. ✅ Extend `tabInboundSession` with `transfer_in` column
5. ✅ Use `reference_doc_type` and `reference_doc` in `tabWmsTransaction` to track source

### Key Code Changes

1. ✅ Extend `PutawayTask` model to support both ASN and Transfer In
2. ✅ Create `TransferInDataService` for Transfer In operations
3. ✅ Create `MaterialRequestDataService` for Material Request operations
4. ✅ Extend `WmsTransactionAutoCreateService` to handle Material Requests
5. ✅ Update UI to show Transfer In and Material Request lists

---

## 🎯 Next Steps

1. **Create database migration script** to add new tables and columns
2. **Implement Transfer In services** (similar to ASN services)
3. **Implement Material Request services** (similar to Transfer Order services)
4. **Extend Putaway Task logic** to handle both ASN and Transfer In
5. **Extend Picking Transaction logic** to handle both Transfer Order and Material Request
6. **Update UI** to show new document types
7. **Test workflows** end-to-end

This design maintains backward compatibility while extending the system to handle showroom operations!
