# tabInboundUnloadLine Table - Usage and Involvement

## 📋 Overview

`tabInboundUnloadLine` is a **child table** of `tabInboundSession` that tracks which cartons (or other units) have been **unloaded** from the truck during an inbound session.

---

## 🗂️ Table Schema

```sql
CREATE TABLE IF NOT EXISTS tabInboundUnloadLine (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,        -- Links to tabInboundSession.title
  unit_type VARCHAR(50) NOT NULL,              -- Usually "Carton"
  unit_id VARCHAR(100) NOT NULL,              -- Carton ID (e.g., "CTN-0101")
  scanned_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  scanned_by VARCHAR(100) NOT NULL,           -- User who unloaded it
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_unit_id (unit_id),
  FOREIGN KEY (parent_title) REFERENCES tabInboundSession(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 🔄 Where It's Involved

### 1. **Automatic Creation** (Primary Usage)

**When:** Carton status is updated to `"Unloaded"`

**API:** `POST /api/cartons/update-status`

**Location:** `wms-api/src/modules/cartons/cartonStatusController.js` (lines 260-274)

**Code:**
```javascript
// If status is "Unloaded", create unload line
if (currentStatus === 'Unloaded') {
  try {
    await connection.execute(`
      INSERT INTO tabInboundUnloadLine 
        (parent_title, unit_type, unit_id, scanned_by, scanned_on)
      VALUES (?, 'Carton', ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        scanned_on = NOW(),
        scanned_by = VALUES(scanned_by)
    `, [inbound_session, currentCartonId, user_id || 'SYSTEM']);
  } catch (unloadLineError) {
    console.warn(`Failed to create unload line for carton ${currentCartonId}:`, unloadLineError.message);
  }
}
```

**What Happens:**
- When mobile app calls `POST /api/cartons/update-status` with `status: "Unloaded"`
- Backend automatically creates a record in `tabInboundUnloadLine`
- Records which carton was unloaded, when, and by whom

**Example Request:**
```json
{
  "asn_no": "ASN-0001",
  "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
  "carton_id": "CTN-0101",
  "status": "Unloaded",
  "user_id": "USER-172188",
  "device_id": "DEVICE-001"
}
```

**Result:**
- `tabReceivingCarton.status` = "Unloaded"
- **AUTOMATIC:** `tabInboundUnloadLine` record created:
  - `parent_title` = "SESSION-ASN0001-DEVICE001-USER172188"
  - `unit_type` = "Carton"
  - `unit_id` = "CTN-0101"
  - `scanned_by` = "USER-172188"
  - `scanned_on` = NOW()

---

### 2. **Explicit Creation** (Optional)

**API:** `POST /api/inbound/unload-line`

**Purpose:** Explicitly create/update an unload line record (usually automatic, but can be called directly)

**Location:** `wms-api/src/modules/inbound/inboundController.js` (lines 646-735)

**Request:**
```http
POST /api/inbound/unload-line
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "parent_title": "SESSION-ASN0001-DEVICE001-USER172188",
  "unit_type": "Carton",
  "unit_id": "CTN-0101",
  "scanned_by": "USER-172188",
  "scanned_on": "2024-12-25T10:30:00Z"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Unload line created/updated successfully",
  "data": {
    "parent_title": "SESSION-ASN0001-DEVICE001-USER172188",
    "unit_type": "Carton",
    "unit_id": "CTN-0101",
    "scanned_by": "USER-172188",
    "scanned_on": "2024-12-25T10:30:00Z"
  }
}
```

**Note:** This endpoint uses UPSERT logic (creates if doesn't exist, updates if exists)

---

### 3. **Desktop App Display** (Read Only)

**Location:** `Services/InboundSessionDataService.cs` (lines 86-124)

**Purpose:** Desktop app fetches unload lines to display in Inbound Session Details screen

**Query:**
```sql
SELECT parent_title, unit_type, unit_id, scanned_on, scanned_by
FROM tabInboundUnloadLine
WHERE parent_title IN (?, ?, ...)
ORDER BY parent_title, scanned_on
```

**Usage:**
- Desktop app displays "Unload Lines" section showing which cartons were unloaded
- Shows carton ID, when unloaded, and by whom

---

### 4. **Filtering Receive Lines** (Critical Usage)

**Location:** `Services/InboundSessionDataService.cs` (lines 123-133)

**Purpose:** **Only show receive lines for cartons that have been unloaded**

**Query:**
```sql
SELECT DISTINCT r.parent_title, r.carton_id, r.item_code, r.expected_qty, 
       r.received_qty, r.condition, r.remarks
FROM tabInboundReceiveLine r
INNER JOIN tabInboundUnloadLine u 
    ON r.parent_title = u.parent_title 
    AND r.carton_id = u.unit_id 
    AND u.unit_type = 'Carton'
WHERE r.parent_title IN (?, ?, ...)
ORDER BY r.parent_title, r.carton_id, r.item_code
```

**Why This Matters:**
- **Prevents receiving items from cartons that haven't been unloaded yet**
- **Data integrity:** Only unloaded cartons can have receive lines
- **Workflow enforcement:** Cartons must be unloaded before items can be received

**Example:**
- If `CTN-0101` is NOT in `tabInboundUnloadLine` → Receive lines for `CTN-0101` are **filtered out**
- If `CTN-0101` IS in `tabInboundUnloadLine` → Receive lines for `CTN-0101` are **shown**

---

### 5. **Desktop App Validation** (UI Logic)

**Location:** `ViewModels/InboundSessionDetailViewModel.cs` (lines 103-115)

**Purpose:** Desktop app validates that cartons are unloaded before allowing receive lines to be added

**Code:**
```csharp
// Get unloaded carton IDs (only cartons that have been unloaded can have receive lines)
var unloadedCartonIds = UnloadLines
    .Where(u => u.UnitType == "Carton")
    .Select(u => u.UnitId)
    .Distinct()
    .ToList();

if (!unloadedCartonIds.Any())
{
    MessageBox.Show("No cartons have been unloaded yet. Please unload cartons first.", 
        "Add Receive Line", MessageBoxButton.OK, MessageBoxImage.Information);
    return;
}
```

**What It Does:**
- Checks if any cartons have been unloaded
- Prevents adding receive lines if no cartons are unloaded
- Filters available cartons to only show unloaded ones

---

### 6. **Backend API - Session Retrieval**

**Location:** `wms-api/src/modules/inbound/inboundController.js` (in `getInboundSessions`)

**Purpose:** Backend API includes unload lines when returning sessions

**Query:**
```sql
SELECT parent_title, unit_type, unit_id, scanned_on, scanned_by
FROM tabInboundUnloadLine
WHERE parent_title = ?
ORDER BY scanned_on
```

**Response Format:**
```json
{
  "ok": true,
  "data": [
    {
      "inbound_session": "SESSION-ASN0001-DEVICE001-USER172188",
      "asn_no": "ASN-0001",
      "status": "Active",
      "unload_lines": [
        {
          "unit_type": "Carton",
          "unit_id": "CTN-0101",
          "scanned_by": "USER-172188",
          "scanned_on": "2024-12-25T10:30:00.000Z"
        },
        {
          "unit_type": "Carton",
          "unit_id": "CTN-0102",
          "scanned_by": "USER-172188",
          "scanned_on": "2024-12-25T10:31:00.000Z"
        }
      ],
      "receive_lines": [...]
    }
  ]
}
```

---

## 📊 Data Flow

```
Mobile App
    │
    │ POST /api/cartons/update-status
    │ { status: "Unloaded", carton_id: "CTN-0101" }
    ▼
Backend API
    │
    │ 1. Updates tabReceivingCarton.status = "Unloaded"
    │ 2. AUTOMATICALLY creates tabInboundUnloadLine record
    │
    ▼
tabInboundUnloadLine
    │
    │ parent_title: "SESSION-XXX"
    │ unit_type: "Carton"
    │ unit_id: "CTN-0101"
    │ scanned_by: "USER-172188"
    │ scanned_on: NOW()
    │
    ▼
Desktop App
    │
    │ GET /api/inbound/sessions
    │
    ▼
Desktop App Display
    │
    │ - Shows unload lines in "Unload Lines" section
    │ - Filters receive lines to only show unloaded cartons
    │ - Validates receive line creation (only unloaded cartons)
```

---

## 🔑 Key Points

### 1. **Automatic Creation**
- ✅ Unload lines are **automatically created** when carton status is updated to "Unloaded"
- ✅ Mobile app doesn't need to call `POST /api/inbound/unload-line` explicitly
- ✅ Happens automatically in `POST /api/cartons/update-status`

### 2. **Data Integrity**
- ✅ **Only unloaded cartons can have receive lines**
- ✅ Desktop app filters receive lines using `INNER JOIN` with `tabInboundUnloadLine`
- ✅ Prevents receiving items from cartons that haven't been unloaded

### 3. **Workflow Enforcement**
- ✅ Enforces correct workflow: Unload → Receive
- ✅ Desktop app UI prevents adding receive lines for non-unloaded cartons
- ✅ Backend API filters receive lines to only show unloaded cartons

### 4. **Audit Trail**
- ✅ Tracks which cartons were unloaded
- ✅ Records who unloaded them (`scanned_by`)
- ✅ Records when they were unloaded (`scanned_on`)

### 5. **Relationship**
- ✅ **Child table** of `tabInboundSession`
- ✅ Foreign key: `parent_title` → `tabInboundSession.title`
- ✅ Cascade delete: If session is deleted, unload lines are deleted

---

## 📝 Usage Summary

| Operation | API/Code | Creates/Updates | Reads |
|-----------|----------|-----------------|-------|
| **Unload Carton** | `POST /api/cartons/update-status` | ✅ Automatic | ❌ |
| **Explicit Create** | `POST /api/inbound/unload-line` | ✅ Explicit | ❌ |
| **Desktop Display** | `GET /api/inbound/sessions` | ❌ | ✅ |
| **Filter Receive Lines** | `Services/InboundSessionDataService.cs` | ❌ | ✅ (INNER JOIN) |
| **UI Validation** | `ViewModels/InboundSessionDetailViewModel.cs` | ❌ | ✅ |

---

## 🎯 Mobile App Implementation

### For Mobile App Developers:

**You DON'T need to:**
- ❌ Call `POST /api/inbound/unload-line` explicitly
- ❌ Manually create unload line records

**You DO need to:**
- ✅ Call `POST /api/cartons/update-status` with `status: "Unloaded"`
- ✅ The backend will automatically create the unload line record

**Example:**
```javascript
// Mobile app code
const response = await fetch('/api/cartons/update-status', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    asn_no: "ASN-0001",
    inbound_session: "SESSION-ASN0001-DEVICE001-USER172188",
    carton_id: "CTN-0101",
    status: "Unloaded",  // ← This automatically creates unload line
    user_id: "USER-172188",
    device_id: "DEVICE-001"
  })
});
```

**Result:**
- ✅ Carton status updated to "Unloaded"
- ✅ **Automatic:** Unload line record created in `tabInboundUnloadLine`
- ✅ Desktop app can now show receive lines for this carton

---

## 🔍 Verification Queries

### Check Unload Lines for a Session:
```sql
SELECT * FROM tabInboundUnloadLine 
WHERE parent_title = 'SESSION-ASN0001-DEVICE001-USER172188'
ORDER BY scanned_on;
```

### Check Which Cartons Are Unloaded:
```sql
SELECT unit_id as carton_id, scanned_by, scanned_on
FROM tabInboundUnloadLine
WHERE parent_title = 'SESSION-ASN0001-DEVICE001-USER172188'
  AND unit_type = 'Carton';
```

### Verify Receive Lines Filtering:
```sql
-- This query shows only receive lines for unloaded cartons
SELECT r.carton_id, r.item_code, r.received_qty
FROM tabInboundReceiveLine r
INNER JOIN tabInboundUnloadLine u 
    ON r.parent_title = u.parent_title 
    AND r.carton_id = u.unit_id 
    AND u.unit_type = 'Carton'
WHERE r.parent_title = 'SESSION-ASN0001-DEVICE001-USER172188';
```

---

## ⚠️ Important Notes

1. **Automatic Creation:** Unload lines are created automatically - no manual API call needed
2. **Data Integrity:** Receive lines are filtered to only show unloaded cartons
3. **Workflow Enforcement:** Cartons must be unloaded before items can be received
4. **UPSERT Logic:** If unload line already exists, it's updated (not duplicated)
5. **Cascade Delete:** If session is deleted, all unload lines are deleted automatically

---

## 📚 Related Tables

- **Parent:** `tabInboundSession` - Inbound session (parent_title references this)
- **Sibling:** `tabInboundReceiveLine` - Receive lines (filtered by unload lines)
- **Related:** `tabReceivingCarton` - Carton status (updated when unloaded)

---

## ✅ Summary

**`tabInboundUnloadLine` is involved in:**

1. ✅ **Automatic creation** when cartons are unloaded (`POST /api/cartons/update-status`)
2. ✅ **Explicit creation** via `POST /api/inbound/unload-line` (optional)
3. ✅ **Desktop app display** - Shows which cartons were unloaded
4. ✅ **Receive line filtering** - Only shows receive lines for unloaded cartons
5. ✅ **UI validation** - Prevents adding receive lines for non-unloaded cartons
6. ✅ **Backend API response** - Included in `GET /api/inbound/sessions` response

**Key Role:** **Enforces workflow** - Only unloaded cartons can have receive lines, ensuring data integrity and correct workflow sequence.

