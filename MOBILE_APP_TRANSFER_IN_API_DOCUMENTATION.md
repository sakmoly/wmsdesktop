# Mobile App - Transfer In API Documentation

## 📋 Overview

This document provides complete API documentation for implementing Transfer In receiving functionality in the mobile app. Transfer In handles items transferred from showroom to warehouse.

**Key Features:**
- Support for items **with** Carton ID (cartonized)
- Support for items **without** Carton ID (loose items)
- **Automatic Putaway Task creation** when all items received
- **No Inbound Session required** - Direct receiving workflow
- Status management (Draft → Submitted → Received → Completed)

---

## 🔐 Authentication

All API endpoints require authentication. Include the Bearer token in the Authorization header:

```
Authorization: Bearer <your_token>
```

---

## 📡 API Endpoints

### 1. Get Transfer In List

**Endpoint:** `GET /api/transfer-in`

**Description:** Get list of Transfer In documents, optionally filtered by status, showroom, or warehouse.

**Query Parameters:**
- `status` (optional): Filter by status (`Draft`, `Submitted`, `In Transit`, `Received`, `Completed`)
- `from_showroom` (optional): Filter by source showroom
- `to_warehouse` (optional): Filter by destination warehouse

**Example Request:**
```http
GET /api/transfer-in?status=Submitted&to_warehouse=WH-MAIN
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
[
  {
    "title": "TI-0001",
    "status": "Submitted",
    "from_showroom": "SHOWROOM-001",
    "to_warehouse": "WH-MAIN",
    "transfer_date": "2025-01-05",
    "expected_arrival_date": "2025-01-05",
    "prepared_by": "USER-001",
    "received_by": null,
    "received_on": null,
    "total_qty": 80.00,
    "items": [
      {
        "item_code": "ITEM-001",
        "qty": 50.00,
        "carton_id": "CTN-TI-001",
        "received_qty": 0.00
      },
      {
        "item_code": "ITEM-002",
        "qty": 30.00,
        "carton_id": null,
        "received_qty": 0.00
      }
    ],
    "created_at": "2025-01-05T08:00:00.000Z",
    "updated_at": "2025-01-05T08:00:00.000Z"
  }
]
```

**Error Responses:**
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Database error

---

### 2. Get Transfer In Details

**Endpoint:** `GET /api/transfer-in/:title`

**Description:** Get detailed information about a specific Transfer In document.

**Path Parameters:**
- `title`: Transfer In title (e.g., `TI-0001`)

**Example Request:**
```http
GET /api/transfer-in/TI-0001
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "title": "TI-0001",
  "status": "Submitted",
  "from_showroom": "SHOWROOM-001",
  "to_warehouse": "WH-MAIN",
  "transfer_date": "2025-01-05",
  "expected_arrival_date": "2025-01-05",
  "prepared_by": "USER-001",
  "received_by": null,
  "received_on": null,
  "total_qty": 80.00,
  "items": [
    {
      "item_code": "ITEM-001",
      "qty": 50.00,
      "carton_id": "CTN-TI-001",
      "received_qty": 0.00
    },
    {
      "item_code": "ITEM-002",
      "qty": 30.00,
      "carton_id": null,
      "received_qty": 0.00
    }
  ],
  "created_at": "2025-01-05T08:00:00.000Z",
  "updated_at": "2025-01-05T08:00:00.000Z"
}
```

**Error Responses:**
- `404 Not Found`: Transfer In not found
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Database error

---

### 3. Submit Transfer In

**Endpoint:** `POST /api/transfer-in/:title/submit`

**Description:** Submit a Transfer In document (change status from `Draft` to `Submitted`). Only Draft Transfer Ins can be submitted.

**Path Parameters:**
- `title`: Transfer In title (e.g., `TI-0001`)

**Example Request:**
```http
POST /api/transfer-in/TI-0001/submit
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:** (No body required)

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "Transfer In submitted successfully",
  "data": {
    "title": "TI-0001",
    "status": "Submitted"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Transfer In is not in Draft status
- `404 Not Found`: Transfer In not found
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Database error

---

### 4. Receive Items (Cartonized or Loose)

**Endpoint:** `POST /api/transfer-in/:title/receive-line`

**Description:** Receive items from Transfer In. Supports two scenarios:
1. **Cartonized Items:** Receive by scanning carton ID (all items in carton)
2. **Loose Items:** Receive by scanning item barcode (individual items)

**Path Parameters:**
- `title`: Transfer In title (e.g., `TI-0001`)

#### Scenario A: Receive by Carton ID (Cartonized Items)

**Example Request:**
```http
POST /api/transfer-in/TI-0001/receive-line
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "carton_id": "CTN-TI-001",
  "received_by": "USER-002"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "Received 2 items from carton CTN-TI-001",
  "data": {
    "transfer_in": "TI-0001",
    "carton_id": "CTN-TI-001",
    "items_received": 2
  }
}
```

**Behavior:**
- All items with the specified `carton_id` are marked as received
- `received_qty` is set to `qty` for all items in the carton
- Transfer In status updates automatically:
  - If all items received → Status becomes `Received` → Putaway Task auto-created
  - If some items received → Status becomes `In Transit`

#### Scenario B: Receive Loose Item (No Carton ID)

**Example Request:**
```http
POST /api/transfer-in/TI-0001/receive-line
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "item_code": "ITEM-002",
  "received_qty": 30.00,
  "received_by": "USER-002"
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "message": "Received 30.00 units of ITEM-002",
  "data": {
    "transfer_in": "TI-0001",
    "item_code": "ITEM-002",
    "received_qty": 30.00,
    "expected_qty": 30.00
  }
}
```

**Behavior:**
- Only the specified item is updated
- `received_qty` is **incremental** (added to existing `received_qty`)
- Transfer In status updates automatically (same as Scenario A)

**Error Responses:**
- `400 Bad Request`: 
  - Missing `received_by`
  - Invalid request (both `carton_id` and `item_code` provided, or neither provided)
  - `received_qty` exceeds expected quantity
  - `received_qty` must be greater than 0
- `404 Not Found`: 
  - Transfer In not found
  - Carton ID not found in Transfer In
  - Item code not found (or item has carton_id)
- `400 Bad Request`: Transfer In is already Completed
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Database error

---

## 📱 Mobile App Implementation Guide

### Screen 1: Transfer In List Screen

**Purpose:** Display available Transfer Ins for receiving

**UI Components:**
- List/Table of Transfer Ins
- Filter controls (Status, Showroom, Warehouse)
- Pull-to-refresh
- Search bar (optional)

**Data Display:**
- Transfer In Number (title)
- From Showroom
- To Warehouse
- Transfer Date
- Status (with color coding)
- Total Qty
- Progress indicator (received_qty / total_qty)

**Actions:**
- Tap item → Navigate to Transfer In Detail Screen
- Pull to refresh → Reload list

**API Call:**
```javascript
GET /api/transfer-in?status=Submitted&to_warehouse=WH-MAIN
```

**Status Color Coding:**
- `Draft`: Gray
- `Submitted`: Blue (ready for receiving)
- `In Transit`: Orange (partially received)
- `Received`: Green (all items received)
- `Completed`: Dark Green (putaway completed)

---

### Screen 2: Transfer In Detail Screen

**Purpose:** Show Transfer In details and items list

**UI Components:**
- Header section (Transfer In info)
- Items list/table
- Action buttons

**Header Section:**
- Transfer In Number
- Status badge
- From Showroom → To Warehouse
- Transfer Date
- Expected Arrival Date
- Prepared By
- Progress: X / Y items received

**Items List:**
- Item Code
- Expected Qty
- Received Qty
- Carton ID (show "N/A" if null)
- Status indicator (Received / Pending)

**Action Buttons:**
- "Start Receiving" → Navigate to Receiving Screen
- "View Putaway Task" (if status is Received/Completed)

**API Call:**
```javascript
GET /api/transfer-in/TI-0001
```

---

### Screen 3: Receiving Screen ⭐ (Core Feature)

**Purpose:** Receive items (cartonized or loose)

**UI Components:**
- Scanner input field
- Item details display
- Quantity input (for loose items)
- Action buttons

**Workflow:**

#### Step 1: Scan Detection

**Unified Receiving Logic:**
```javascript
function handleScan(scanResult) {
  // Check if scanResult is a carton_id or item_code
  if (isCartonId(scanResult)) {
    // Scenario A: Carton ID scanned
    receiveByCarton(transferInTitle, scanResult);
  } else {
    // Scenario B: Item barcode scanned
    receiveByItem(transferInTitle, scanResult);
  }
}
```

#### Step 2A: Receive by Carton (Cartonized Items)

**Flow:**
1. User scans carton ID
2. App calls API: `POST /api/transfer-in/:title/receive-line` with `carton_id`
3. API returns items in carton
4. App displays confirmation dialog:
   - "Carton: CTN-TI-001"
   - "Items: ITEM-001 (50), ITEM-002 (30)"
   - "Confirm receipt?"
5. User confirms
6. App shows success message
7. Refresh Transfer In details

**API Call:**
```javascript
POST /api/transfer-in/TI-0001/receive-line
{
  "carton_id": "CTN-TI-001",
  "received_by": currentUser
}
```

**UI Example:**
```
┌─────────────────────────────┐
│  Scan Carton or Item        │
│  [________________] [Scan]   │
├─────────────────────────────┤
│  Carton: CTN-TI-001          │
│  Items in Carton:            │
│  • ITEM-001: 50 units        │
│  • ITEM-002: 30 units        │
│                              │
│  [Cancel]  [Confirm Receipt] │
└─────────────────────────────┘
```

#### Step 2B: Receive Loose Item (No Carton ID)

**Flow:**
1. User scans item barcode
2. App calls API: `GET /api/transfer-in/:title` to get item details
3. App displays item details:
   - Item Code
   - Expected Qty
   - Already Received Qty
   - Remaining Qty
4. User enters received quantity
5. App validates: received_qty ≤ remaining_qty
6. App calls API: `POST /api/transfer-in/:title/receive-line` with `item_code` and `received_qty`
7. App shows success message
8. Refresh Transfer In details

**API Call:**
```javascript
POST /api/transfer-in/TI-0001/receive-line
{
  "item_code": "ITEM-002",
  "received_qty": 30.00,
  "received_by": currentUser
}
```

**UI Example:**
```
┌─────────────────────────────┐
│  Scan Carton or Item        │
│  [ITEM-002________] [Scan]  │
├─────────────────────────────┤
│  Item: ITEM-002             │
│  Expected: 30.00 units        │
│  Already Received: 0.00      │
│  Remaining: 30.00            │
│                              │
│  Received Qty:               │
│  [30.00________]             │
│                              │
│  [Cancel]  [Confirm Receipt] │
└─────────────────────────────┘
```

**Incremental Receiving:**
- If item already has `received_qty = 10` and user enters `received_qty = 20`
- Final `received_qty = 30` (10 + 20)
- API handles this automatically

**When All Items Received:**
- Transfer In status automatically becomes "Received"
- Putaway Task is **automatically created**
- Show success message with Putaway Task number
- Navigate to Putaway Task list

---

### Screen 4: Receiving Complete / Putaway Task Created

**Purpose:** Show confirmation when all items are received and Putaway Task is created

**Display:**
- ✅ "All items received successfully"
- Putaway Task created: `PUT-YYYYMMDD-XXXX`
- Total items received
- "Go to Putaway Tasks" button

**Actions:**
- "Go to Putaway Tasks" → Navigate to Putaway Task list (filtered by Transfer In)
- "View Transfer In" → Return to Transfer In Detail

**When Shown:**
- Automatically displayed when last item is received
- Transfer In status becomes "Received"
- Putaway Task is created automatically (no manual step)

**API Call (to get Putaway Task):**
```javascript
GET /api/putaway/tasks?source_type=TransferIn&transfer_in=TI-0001
```

---

## 🔄 Status Flow

```
Draft → Submitted → In Transit → Received → Completed
  ↓         ↓           ↓            ↓          ↓
Create   Submit    Start        All Items   Putaway
         Transfer   Receiving    Received    Completed
         In
```

**Status Transitions:**
- `Draft` → `Submitted`: User submits Transfer In (desktop app or API)
- `Submitted` → `In Transit`: First item received (some items received, but not all)
- `In Transit` → `Received`: All items received (automatic) → **Putaway Task auto-created**
- `Received` → `Completed`: Putaway completed (separate workflow)

**Important:** 
- ✅ **No Inbound Session required** - Receiving is done directly via API
- ✅ **Putaway Task is created automatically** when all items are received
- ✅ **Go directly to Putaway Task list** after receiving all items

---

## 🎨 UI/UX Best Practices

### 1. Scanner Input

**Recommendations:**
- Large, easy-to-tap scan button
- Visual feedback when scanning
- Auto-submit on successful scan (or manual confirm)
- Support for manual entry (if barcode fails)

### 2. Item Display

**For Cartonized Items:**
- Show all items in carton clearly
- Group by carton ID
- Show quantities for each item

**For Loose Items:**
- Show item details prominently
- Highlight expected vs received quantities
- Show progress indicator

### 3. Error Handling

**Display user-friendly messages:**
- "Carton not found in this Transfer In"
- "Item not found or already has carton ID"
- "Cannot receive X units. Maximum: Y units"
- "Transfer In is already completed"

### 4. Progress Indicators

**Show receiving progress:**
- Overall: "5 / 10 items received"
- Per item: Progress bar or percentage
- Status badges (Received / Pending)

### 5. Offline Support (Optional)

**Consider:**
- Cache Transfer In list locally
- Queue receiving operations when offline
- Sync when connection restored

---

## 📝 JavaScript Code Examples

### Example 1: Get Transfer In List

```javascript
async function getTransferInList(status = 'Submitted', warehouse = 'WH-MAIN') {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/transfer-in?status=${status}&to_warehouse=${warehouse}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch Transfer Ins');
    }
    
    const transferIns = await response.json();
    return transferIns;
  } catch (error) {
    console.error('Error fetching Transfer Ins:', error);
    throw error;
  }
}
```

### Example 2: Get Transfer In Details

```javascript
async function getTransferInDetails(title) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/transfer-in/${title}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch Transfer In');
    }
    
    const transferIn = await response.json();
    return transferIn;
  } catch (error) {
    console.error('Error fetching Transfer In:', error);
    throw error;
  }
}
```

### Example 3: Receive by Carton ID

```javascript
async function receiveByCarton(transferInTitle, cartonId, receivedBy) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/transfer-in/${transferInTitle}/receive-line`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          carton_id: cartonId,
          received_by: receivedBy
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to receive items');
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error receiving carton:', error);
    throw error;
  }
}
```

### Example 4: Receive Loose Item

```javascript
async function receiveLooseItem(transferInTitle, itemCode, receivedQty, receivedBy) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/transfer-in/${transferInTitle}/receive-line`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          item_code: itemCode,
          received_qty: receivedQty,
          received_by: receivedBy
        })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to receive item');
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error receiving item:', error);
    throw error;
  }
}
```

### Example 5: Unified Receiving Handler

```javascript
async function handleReceiveScan(transferInTitle, scanResult, receivedBy) {
  // Determine if scanResult is carton_id or item_code
  // This logic depends on your barcode format
  const isCartonId = scanResult.startsWith('CTN-') || scanResult.startsWith('CARTON-');
  
  if (isCartonId) {
    // Receive by carton
    return await receiveByCarton(transferInTitle, scanResult, receivedBy);
  } else {
    // Get item details first
    const transferIn = await getTransferInDetails(transferInTitle);
    const item = transferIn.items.find(i => i.item_code === scanResult);
    
    if (!item) {
      throw new Error('Item not found in Transfer In');
    }
    
    if (item.carton_id) {
      throw new Error('Item has carton ID. Please scan the carton instead.');
    }
    
    // Prompt user for quantity (in your UI)
    // For this example, assume user enters quantity
    const receivedQty = await promptForQuantity(item);
    
    // Receive loose item
    return await receiveLooseItem(transferInTitle, scanResult, receivedQty, receivedBy);
  }
}
```

---

## ✅ Testing Checklist

### Test Scenario 1: Receive Cartonized Items

- [ ] Create Transfer In with items having `carton_id`
- [ ] Submit Transfer In
- [ ] Scan carton ID
- [ ] Verify all items in carton marked as received
- [ ] Verify Transfer In status updated
- [ ] Verify Putaway Task created (if all items received)

### Test Scenario 2: Receive Loose Items

- [ ] Create Transfer In with items having `carton_id = null`
- [ ] Submit Transfer In
- [ ] Scan item barcode
- [ ] Enter received quantity
- [ ] Verify item marked as received
- [ ] Verify incremental receiving works
- [ ] Verify Transfer In status updated

### Test Scenario 3: Mixed Transfer In

- [ ] Create Transfer In with mix of cartonized and loose items
- [ ] Receive cartonized items by carton ID
- [ ] Receive loose items by item barcode
- [ ] Verify all items received correctly
- [ ] Verify Putaway Task created with both types

### Test Scenario 4: Error Handling

- [ ] Test invalid carton ID
- [ ] Test invalid item code
- [ ] Test receiving more than expected quantity
- [ ] Test receiving completed Transfer In
- [ ] Test network errors

---

## 🔗 Related Documentation

- `TRANSFER_IN_NO_CARTON_ID_HANDLING.md` - Detailed handling of items without carton ID
- `CYCLE_COUNT_AND_TRANSFER_IN_DESIGN.md` - Complete design document
- `CYCLE_COUNT_AND_TRANSFER_IN_SUMMARY.md` - Implementation summary

---

## 📞 Support

For API issues or questions:
- Check API response error messages
- Review server logs for detailed errors
- Verify database schema matches expected structure

---

**Document Version:** 1.0  
**Created:** 2026-01-05  
**Status:** Ready for Mobile App Development

