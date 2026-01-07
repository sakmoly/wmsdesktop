# Putaway Task Creation Guide

## Who Creates Putaway Tasks?

**Putaway tasks are created AUTOMATICALLY by the Desktop Application** - no manual user action is required. The system automatically creates putaway tasks based on routing logic.

---

## How Putaway Tasks Are Created

### 1. Automatic Creation After Receiving (ASN Items)

**When:** After items are received from an ASN (Advance Shipping Notice)

**Service:** `ReceivingRoutingService.RouteReceivedItemsAsync()`

**Logic:**
```
1. Check if Transfer Order exists for this ASN
   ├── YES → Route to Sorting (no putaway task created)
   └── NO → Create Putaway Task for ALL received items
```

**Code Location:** `Services/ReceivingRoutingService.cs`

**Method Called:**
```csharp
PutawayTaskDataService.CreatePutawayTaskFromAsnAsync(
    settings, 
    asnNo, 
    inboundSessionTitle)
```

**What It Creates:**
- Creates a new `tabPutawayTask` record with:
  - `title`: Auto-generated (e.g., "PUT-20250120-0001")
  - `status`: "Draft"
  - `source_type`: "ASN"
  - `advance_shipping_notice`: ASN number
  - `inbound_session`: Inbound session identifier
  - `created_by`: "SYSTEM"
- Creates `tabPutawayLine` records for each item with:
  - `rack`: "TBD" (to be determined)
  - `bin`: "TBD" (to be determined)
  - `qty`: Item quantity from ASN

---

### 2. Automatic Creation After Sorting (Remaining Items)

**When:** After sorting is complete, if there are remaining items that weren't sorted to transfer orders

**Service:** `ReceivingRoutingService.RouteRemainingItemsToPutawayAsync()`

**Logic:**
```
1. Calculate: ASN Total Qty - Sorted Qty (from SORT_TO_BOX events)
2. If remaining > 0:
   └── Create Putaway Task for remaining items
3. If remaining = 0:
   └── No putaway task needed (all items sorted)
```

**Code Location:** `Services/ReceivingRoutingService.cs`

**Method Called:**
```csharp
PutawayTaskDataService.CreatePutawayTaskFromAsnAsync(
    settings, 
    asnNo, 
    inboundSessionTitle)
```

**What It Creates:**
- Same as above, but only for items that weren't sorted to transfer orders

---

### 3. Automatic Creation for Transfer In Items

**When:** When items are received from Transfer In (showroom to warehouse)

**Service:** `PutawayTaskDataService.CreatePutawayTaskFromTransferInAsync()`

**Logic:**
```
Transfer In items ALWAYS go to Putaway (no sorting step)
→ Create Putaway Task immediately
```

**Code Location:** `Services/PutawayTaskDataService.cs`

**What It Creates:**
- Creates a new `tabPutawayTask` record with:
  - `title`: Auto-generated
  - `status`: "Draft"
  - `source_type`: "TransferIn"
  - `transfer_in`: Transfer In number
  - `inbound_session`: Inbound session identifier
  - `created_by`: "SYSTEM"
- Creates `tabPutawayLine` records for each item

---

## Creation Methods

### Method 1: CreatePutawayTaskFromAsnAsync

**File:** `Services/PutawayTaskDataService.cs`

**Signature:**
```csharp
public static async Task<bool> CreatePutawayTaskFromAsnAsync(
    WmsSettings settings,
    string asnNo,
    string inboundSessionTitle,
    string createdBy = "SYSTEM")
```

**Steps:**
1. Check if putaway task already exists for this ASN
2. Generate unique task title (format: `PUT-YYYYMMDD-####`)
3. Get all items from `tabAsnItemDetails` for the ASN
4. Insert `tabPutawayTask` record
5. Insert `tabPutawayLine` records for each item (with rack/bin = "TBD")

**Returns:** `true` if successful, `false` if error

---

### Method 2: CreatePutawayTaskFromTransferInAsync

**File:** `Services/PutawayTaskDataService.cs`

**Signature:**
```csharp
public static async Task<bool> CreatePutawayTaskFromTransferInAsync(
    WmsSettings settings,
    string transferInTitle,
    string inboundSessionTitle,
    string createdBy = "SYSTEM")
```

**Steps:**
1. Check if putaway task already exists for this Transfer In
2. Generate unique task title
3. Get all items from `tabTransferInItem` for the Transfer In
4. Insert `tabPutawayTask` record with `source_type = "TransferIn"`
5. Insert `tabPutawayLine` records for each item

**Returns:** `true` if successful, `false` if error

---

## When Are These Methods Called?

### Scenario 1: ASN Receiving (No Transfer Order)

**Trigger:** After receiving items from ASN

**Flow:**
```
1. Mobile app receives items → Updates receive lines
2. Desktop app (or backend) calls: ReceivingRoutingService.RouteReceivedItemsAsync()
3. System checks: Transfer Order exists?
   └── NO → Calls CreatePutawayTaskFromAsnAsync()
4. Putaway task created automatically
```

**User Action Required:** None - fully automatic

---

### Scenario 2: ASN Receiving (With Transfer Order)

**Trigger:** After receiving items from ASN

**Flow:**
```
1. Mobile app receives items → Updates receive lines
2. Desktop app (or backend) calls: ReceivingRoutingService.RouteReceivedItemsAsync()
3. System checks: Transfer Order exists?
   └── YES → Route to Sorting (no putaway task yet)
4. After sorting completes → Calls RouteRemainingItemsToPutawayAsync()
5. System calculates remaining items
   └── If remaining > 0 → Calls CreatePutawayTaskFromAsnAsync()
```

**User Action Required:** None - fully automatic

---

### Scenario 3: Transfer In Receiving

**Trigger:** When Transfer In items are received

**Flow:**
```
1. Mobile app receives Transfer In items
2. Desktop app (or backend) calls: CreatePutawayTaskFromTransferInAsync()
3. Putaway task created automatically
```

**User Action Required:** None - fully automatic

---

## Task Title Generation

**Format:** `PUT-YYYYMMDD-####`

**Example:** `PUT-20250120-0001`

**Logic:**
```csharp
private static async Task<string> GeneratePutawayTaskTitleAsync(MySqlConnection connection)
{
    var datePrefix = DateTime.Now.ToString("yyyyMMdd");
    // Count existing tasks for today
    var count = await GetTaskCountForDateAsync(connection, datePrefix);
    var sequence = (count + 1).ToString("D4");
    return $"PUT-{datePrefix}-{sequence}";
}
```

---

## Database Tables Updated

### tabPutawayTask
```sql
INSERT INTO tabPutawayTask 
  (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
VALUES 
  (@title, 'Draft', 'ASN', @asnNo, @inboundSession, @createdBy, NOW(), NOW())
```

### tabPutawayLine
```sql
INSERT INTO tabPutawayLine 
  (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
VALUES 
  (@parentTitle, @cartonId, @itemCode, @qty, 'TBD', 'TBD', NOW(), NOW())
```

---

## Status Flow

1. **Created:** Status = "Draft"
2. **Assigned Rack/Bin:** Status remains "Draft" (rack/bin updated in lines)
3. **Completed:** Status = "Completed" (via mobile app `POST /api/putaway/complete`)

---

## Viewing Created Tasks

**Desktop App:**
- Navigate to "Putaway Tasks" menu
- Tasks are automatically loaded from database
- View refreshes when screen is opened

**Mobile App:**
- Call `GET /api/putaway/tasks?status=Open`
- Tasks are returned with all details

---

## Summary

✅ **Who Creates:** Desktop Application (automatic, no user action)

✅ **When Created:**
- After ASN receiving (if no Transfer Order)
- After sorting (for remaining items)
- After Transfer In receiving

✅ **How Created:**
- `ReceivingRoutingService` routes items
- `PutawayTaskDataService` creates tasks
- All automatic - no manual creation needed

✅ **User Action:** None required - system handles everything automatically

