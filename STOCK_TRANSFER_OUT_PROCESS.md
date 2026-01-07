# Stock Transfer Out to Showroom - Complete Process

## 📋 Overview

This document outlines the complete process for transferring stock from the warehouse to the showroom, starting from Material Request receipt through Transfer Carton generation.

---

## 🔄 Process Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Material Request Received from Showroom                      │
│    (tabMaterialRequest, tabMaterialRequestItem)                 │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Upload Material Request to Mobile Device                     │
│    (Sync via API: GET /api/material-requests)                  │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Generate Pick List from Mobile App                           │
│    (Auto-create Picking Transaction)                            │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Generate Transfer Out Transfer Carton                        │
│    (Create Transfer Carton after picking complete)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Detailed Process Steps

### Step 1: Material Request Received from Showroom

**Database Tables:**
- `tabMaterialRequest` - Main Material Request document
- `tabMaterialRequestItem` - Items requested

**Process:**

1. **Material Request Creation**
   - Material Request is created in ERPNext (by showroom) or directly in WMS
   - Contains:
     - `title`: Unique Material Request ID (e.g., "MR-0001")
     - `status`: "Draft", "Submitted", "In Progress", "Picked", "Dispatched", "Completed"
     - `from_warehouse`: Source warehouse code
     - `to_showroom`: Destination showroom code
     - `requested_date`: Date when request was made
     - `required_date`: Required delivery date
     - `requested_by`: User who created the request
     - `total_requested_qty`: Total quantity requested
     - `total_picked_qty`: Total quantity picked (initially 0)

2. **Material Request Items**
   - Each item in `tabMaterialRequestItem` contains:
     - `parent_title`: Links to Material Request title
     - `item_code`: Item code to be picked
     - `requested_qty`: Quantity requested
     - `picked_qty`: Quantity picked (initially 0)
     - `pending_qty`: Calculated as `requested_qty - picked_qty`

**Example Data:**
```sql
-- Material Request
INSERT INTO tabMaterialRequest VALUES (
  'MR-0001',
  'Submitted',
  'WH-MAIN',
  'SHOWROOM-001',
  '2026-01-03',
  '2026-01-05',
  'USER-003',
  35.00,
  0.00,
  NOW(),
  NOW()
);

-- Material Request Items
INSERT INTO tabMaterialRequestItem (parent_title, item_code, requested_qty) VALUES
  ('MR-0001', 'SKU-HAT-301-GRN-OS', 20.00),
  ('MR-0001', 'SKU-SHIRT-001-WHT-M', 15.00);
```

**Status Flow:**
- `Draft` → `Submitted` → `In Progress` → `Picked` → `Dispatched` → `Completed`

---

### Step 2: Upload Material Request to Mobile Device

**API Endpoint:**
```
GET /api/material-requests?status=Submitted&from_warehouse=WH-MAIN
Authorization: Bearer <token>
```

**Process:**

1. **Mobile App Sync**
   - Mobile app fetches Material Requests from backend API
   - Filters by:
     - `status`: "Submitted" or "In Progress" (ready for picking)
     - `from_warehouse`: Current warehouse
   - Material Requests are downloaded and stored locally on mobile device

2. **API Response Format:**
```json
[
  {
    "title": "MR-0001",
    "status": "Submitted",
    "from_warehouse": "WH-MAIN",
    "to_showroom": "SHOWROOM-001",
    "request_date": "2026-01-03",
    "required_date": "2026-01-05",
    "requested_by": "USER-003",
    "total_requested_qty": 35.00,
    "total_picked_qty": 0.00,
    "items": [
      {
        "item_code": "SKU-HAT-301-GRN-OS",
        "requested_qty": 20.00,
        "picked_qty": 0.00
      },
      {
        "item_code": "SKU-SHIRT-001-WHT-M",
        "requested_qty": 15.00,
        "picked_qty": 0.00
      }
    ],
    "created_at": "2026-01-03T08:00:00.000Z",
    "updated_at": "2026-01-03T08:00:00.000Z"
  }
]
```

3. **Mobile App Actions:**
   - Display Material Request list
   - Show pending items to pick
   - Allow user to select Material Request for picking
   - Display item details with requested quantities

**Key Points:**
- Material Requests are synced to mobile devices for offline picking
- Mobile app can work offline and sync later
- Status must be "Submitted" or "In Progress" to appear in mobile app

---

### Step 3: Generate Pick List from Mobile App

**Process:**

1. **Auto-Create Picking Transaction (Desktop)**
   - When Material Request status changes to "Submitted" or "In Progress"
   - Desktop app automatically creates a Picking Transaction
   - Transaction is created via `WmsTransactionAutoCreateService.CreatePickingTransactionFromMaterialRequestAsync()`

2. **Picking Transaction Details:**
   - `operation_type`: "Picking"
   - `reference_doc_type`: "Material Request"
   - `reference_doc`: Material Request title (e.g., "MR-0001")
   - `source_warehouse`: From warehouse
   - `target_warehouse`: To showroom
   - `status`: "Submitted"
   - `transaction_status`: "In Planning"

3. **Mobile App Picking Process:**

   **Step 3.1: View Material Request Details**
   ```
   GET /api/material-requests/MR-0001
   ```
   - Mobile app displays items to pick
   - Shows requested quantity vs. picked quantity

   **Step 3.2: Check Stock Availability**
   ```
   GET /api/stock-ledger/{item_code}/{warehouse}
   ```
   - Check available stock in warehouse
   - View bin locations with available stock
   - Verify stock availability before picking

   **Step 3.3: Perform Picking**
   ```
   POST /api/wms-transactions
   Content-Type: application/json
   ```
   - User scans item barcode
   - User scans source bin location
   - User enters picked quantity
   - Mobile app sends picking transaction

   **Request Body:**
   ```json
   {
     "operation_type": "MaterialRequest",
     "reference_doc": "MR-0001",
     "reference_doc_type": "Material Request",
     "warehouse": "WH-MAIN",
     "performed_by": "USER-004",
     "details": [
       {
         "item_code": "SKU-HAT-301-GRN-OS",
         "qty": 20.00,
         "source_bin": "RACK-A-01-BIN-05",
         "target_bin": "STAGE-SHOWROOM-001",
         "assignment_status": "Completed"
       },
       {
         "item_code": "SKU-SHIRT-001-WHT-M",
         "qty": 15.00,
         "source_bin": "RACK-B-02-BIN-10",
         "target_bin": "STAGE-SHOWROOM-001",
         "assignment_status": "Completed"
       }
     ]
   }
   ```

4. **Backend Updates:**
   - Updates `tabMaterialRequestItem.picked_qty` for each item
   - Updates `tabMaterialRequest.total_picked_qty`
   - Updates `tabMaterialRequest.status` to "In Progress" or "Picked"
   - Updates stock ledger (reduces stock from source bins)
   - Creates/updates WMS Transaction records

5. **Picking Complete:**
   - When all items are picked (`picked_qty = requested_qty` for all items)
   - Material Request status changes to "Picked"
   - Items are now at staging area (`STAGE-{showroom_code}`)

**Key Points:**
- Picking transaction is auto-created when Material Request is submitted
- Mobile app performs actual picking operations
- Stock is deducted from source bins during picking
- Items are moved to staging area for packing

---

### Step 4: Generate Transfer Out Transfer Carton

**Process:**

1. **Create Transfer Carton**
   - After picking is complete, create Transfer Carton to pack items
   - Transfer Carton groups picked items for dispatch to showroom

   **API Endpoint:**
   ```
   POST /api/transfer-cartons/create
   Content-Type: application/json
   ```

   **Request Body:**
   ```json
   {
     "tc_id": "TC-MR-0001-1767516827262",
     "asn_no": null,  // MUST be null for Material Request
     "to_no": "MR-0001",  // MUST be Material Request number (e.g., "MR-0001"), NOT null
     "store": "STORE-001",
     "user_id": "USER-004",
     "material_request": "MR-0001"  // Optional, for reference
   }
   ```

   **Note:** For Material Request transfers:
   - `asn_no` **MUST** be `null`
   - `to_no` **MUST** be the Material Request number (e.g., `"MR-0001"`), **NOT** `null`
   - `store` should be the destination showroom
   - Transfer Carton must be created explicitly via API call (not automatic)

2. **Pack Items to Transfer Carton**

   **Option A: Pack Individual Items**
   ```
   POST /api/events/batch
   ```
   ```json
   {
     "events": [
       {
         "event_type": "PACK_ITEM_TO_TC",
         "event_time": "2026-01-03T10:45:00Z",
         "device_id": "DEVICE-001",
         "user_id": "USER-004",
         "item_code": "SKU-HAT-301-GRN-OS",
         "qty": 20.00,
         "store": "SHOWROOM-001",
         "tc_id": "TC-MR0001-001",
         "source_bin": "STAGE-SHOWROOM-001"
       }
     ]
   }
   ```

   **Option B: Pack Boxes to Transfer Carton**
   - If items are packed into boxes first
   - Create boxes, pack items to boxes, then pack boxes to Transfer Carton
   ```
   POST /api/events/batch
   ```
   ```json
   {
     "events": [
       {
         "event_type": "PACK_BOX_TO_TC",
         "event_time": "2026-01-03T10:45:00Z",
         "device_id": "DEVICE-001",
         "user_id": "USER-004",
         "box_id": "BOX-SHOWROOM-001-001",
         "tc_id": "TC-MR0001-001",
         "store": "SHOWROOM-001"
       }
     ]
   }
   ```

3. **Seal Transfer Carton**
   - When all items are packed, seal the Transfer Carton
   ```
   POST /api/transfer-cartons/seal
   Content-Type: application/json
   ```
   ```json
   {
     "tc_id": "TC-MR0001-001",
     "sealed_by": "USER-004",
     "sealed_on": "2026-01-03T11:00:00Z"
   }
   ```

4. **Update Material Request Status**
   - After Transfer Carton is sealed and ready for dispatch
   - Update Material Request status to "Dispatched"
   ```
   POST /api/material-requests/MR-0001/update-status
   ```
   ```json
   {
     "status": "Dispatched",
     "dispatched_by": "USER-004",
     "dispatched_on": "2026-01-03T11:00:00Z"
   }
   ```

5. **Print Delivery Note / Out Slip**
   - Print delivery note for Transfer Carton
   - Shows all items in Transfer Carton
   - Used for dispatch documentation

**Transfer Carton Contents:**
- Transfer Carton contains items from Material Request
- Items are linked via `tabTransferCartonItem` or `tabWmsScanEvent` (where `tc_id` matches)
- Transfer Carton status: `Created` → `Sealed` → `Dispatched`

---

## 🔄 Complete Workflow Summary

### Phase 1: Material Request Setup
1. ✅ Showroom creates Material Request (ERPNext or WMS)
2. ✅ Material Request stored in `tabMaterialRequest` and `tabMaterialRequestItem`
3. ✅ Status: "Draft" → "Submitted"

### Phase 2: Mobile Device Sync
1. ✅ Mobile app fetches Material Requests via API
2. ✅ Material Requests downloaded to mobile device
3. ✅ Mobile app displays pending Material Requests

### Phase 3: Picking Operations
1. ✅ Desktop app auto-creates Picking Transaction
2. ✅ Mobile app displays Material Request details
3. ✅ Warehouse staff picks items from bins
4. ✅ Mobile app sends picking transactions
5. ✅ Backend updates:
   - `tabMaterialRequestItem.picked_qty`
   - `tabMaterialRequest.total_picked_qty`
   - Stock ledger (reduces stock)
6. ✅ Material Request status: "In Progress" → "Picked"

### Phase 4: Transfer Carton Generation
1. ✅ Create Transfer Carton (`POST /api/transfer-cartons/create`)
2. ✅ Pack items/boxes to Transfer Carton (`POST /api/events/batch`)
3. ✅ Seal Transfer Carton (`POST /api/transfer-cartons/seal`)
4. ✅ Update Material Request status to "Dispatched"
5. ✅ Print Delivery Note / Out Slip
6. ✅ Dispatch Transfer Carton to showroom

---

## 📊 Database Tables Involved

| Table | Purpose | Key Fields |
|------|---------|------------|
| `tabMaterialRequest` | Material Request header | `title`, `status`, `from_warehouse`, `to_showroom`, `total_requested_qty`, `total_picked_qty` |
| `tabMaterialRequestItem` | Material Request items | `parent_title`, `item_code`, `requested_qty`, `picked_qty` |
| `tabWmsTransaction` | Picking transaction | `operation_type`, `reference_doc_type`, `reference_doc` |
| `tabWmsTransactionDetail` | Picking transaction items | `item_code`, `qty`, `source_bin`, `target_bin` |
| `tabTransferCarton` | Transfer Carton header | `tc_id`, `status`, `store` |
| `tabTransferCartonItem` | Transfer Carton items | `tc_id`, `item_code`, `qty` |
| `tabWmsScanEvent` | Scan events (packing) | `event_type`, `tc_id`, `item_code`, `qty` |
| `tabStockLedger` | Stock balance | `item_code`, `warehouse`, `bin_location`, `qty` |

---

## 🔑 Key API Endpoints

### Material Request APIs
- `GET /api/material-requests` - List Material Requests
- `GET /api/material-requests/:title` - Get Material Request details
- `POST /api/material-requests/:title/update-status` - Update Material Request status

### Picking APIs
- `POST /api/wms-transactions` - Create picking transaction (operation_type="MaterialRequest")
- `GET /api/stock-ledger/:item_code/:warehouse` - Check stock availability

### Transfer Carton APIs
- `POST /api/transfer-cartons/create` - Create Transfer Carton
- `POST /api/transfer-cartons/seal` - Seal Transfer Carton
- `GET /api/transfer-cartons` - List Transfer Cartons
- `POST /api/events/batch` - Pack items/boxes to Transfer Carton

---

## ✅ Status Flow

### Material Request Status
```
Draft → Submitted → In Progress → Picked → Dispatched → Completed
```

### Transfer Carton Status
```
Created → Sealed → Dispatched
```

---

## 🎯 Key Points

1. **Material Request Source**: Created in ERPNext (by showroom) or directly in WMS
2. **Mobile Sync**: Material Requests are synced to mobile devices for picking
3. **Auto-Creation**: Picking Transaction is auto-created when Material Request is submitted
4. **Picking**: Mobile app performs picking operations and updates quantities
5. **Transfer Carton**: Created after picking is complete to pack items for dispatch
6. **Stock Updates**: Stock is deducted from source bins during picking
7. **Staging**: Picked items are moved to staging area before packing

---

## 📝 Notes

- Material Request can be created manually in Desktop app or synced from ERPNext
- Mobile app can work offline and sync picking transactions later
- Transfer Carton creation is optional - items can be dispatched without Transfer Carton
- Delivery Note / Out Slip can be printed for Transfer Carton documentation
- Material Request status must be "Submitted" or "In Progress" to appear in mobile app

