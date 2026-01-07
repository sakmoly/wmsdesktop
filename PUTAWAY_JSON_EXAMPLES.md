# Putaway JSON Payloads - Examples

This document contains JSON payloads for testing Putaway API endpoints. **Replace placeholder values with actual data from your database.**

## Quick Start

1. **Get your item codes:**
   ```sql
   SELECT code, name FROM tabItem LIMIT 10;
   ```

2. **Replace `ITEM001`, `ITEM002`, etc.** in the JSON below with your actual item codes

3. **Use these payloads** in Postman, curl, or your API client

---

## 1. POST /api/putaway/assign-rack

Assign rack/bin location for putaway items.

### Example 1: Single Item Assignment

```json
{
  "putaway_task": "PUT-TEST-001",
  "carton_id": "BOX-ITEM001-001",
  "item_code": "ITEM001",
  "rack": "A1-R01",
  "bin": "L1-B1",
  "qty": 50.00,
  "user_id": "USER-001"
}
```

### Example 2: Different Location Format

```json
{
  "putaway_task": "PUT-TEST-001",
  "carton_id": "BOX-ITEM002-001",
  "item_code": "ITEM002",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "qty": 75.00,
  "user_id": "USER-001"
}
```

### Example 3: Multiple Assignments (Batch)

```json
// Request 1
{
  "putaway_task": "PUT-TEST-001",
  "carton_id": "BOX-ITEM001-001",
  "item_code": "ITEM001",
  "rack": "A1-R01",
  "bin": "L1-B1",
  "qty": 50.00,
  "user_id": "USER-001"
}

// Request 2
{
  "putaway_task": "PUT-TEST-001",
  "carton_id": "BOX-ITEM002-001",
  "item_code": "ITEM002",
  "rack": "A1-R01",
  "bin": "L1-B2",
  "qty": 75.00,
  "user_id": "USER-001"
}

// Request 3
{
  "putaway_task": "PUT-TEST-001",
  "carton_id": "BOX-ITEM003-001",
  "item_code": "ITEM003",
  "rack": "A2-R02",
  "bin": "L2-B1",
  "qty": 100.00,
  "user_id": "USER-001"
}
```

---

## 2. POST /api/putaway/complete

Complete putaway task and update stock ledger.

### Example 1: Single Item

```json
{
  "putaway_task": "PUT-TEST-001",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "ITEM001",
      "qty": 50.00,
      "source_bin": "DOCK-01",
      "target_bin": "A1-R01-L1-B1",
      "completed": true
    }
  ]
}
```

### Example 2: Multiple Items

```json
{
  "putaway_task": "PUT-TEST-001",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "ITEM001",
      "qty": 50.00,
      "source_bin": "DOCK-01",
      "target_bin": "A1-R01-L1-B1",
      "completed": true
    },
    {
      "item_code": "ITEM002",
      "qty": 75.00,
      "source_bin": "DOCK-01",
      "target_bin": "A1-R01-L1-B2",
      "completed": true
    },
    {
      "item_code": "ITEM003",
      "qty": 100.00,
      "source_bin": "DOCK-01",
      "target_bin": "A2-R02-L2-B1",
      "completed": true
    }
  ]
}
```

### Example 3: Different Location Formats

```json
{
  "putaway_task": "PUT-TEST-001",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "ITEM001",
      "qty": 25.00,
      "source_bin": "DOCK-01",
      "target_bin": "RACK-A-BIN-01",
      "completed": true
    },
    {
      "item_code": "ITEM002",
      "qty": 30.00,
      "source_bin": "DOCK-01",
      "target_bin": "RACK-B-BIN-02",
      "completed": true
    }
  ]
}
```

---

## 3. POST /api/putaway/scan-transfer-carton

Scan transfer carton and location to automatically create/update putaway task.

### Example 1: Basic Scan

```json
{
  "tc_id": "TC-TEST-001",
  "rack": "A1-R01",
  "bin": "L1-B1",
  "user_id": "USER-001"
}
```

### Example 2: With Box ID

```json
{
  "tc_id": "TC-TEST-001",
  "box_id": "BOX-WHMAIN-514364",
  "rack": "A1-R01",
  "bin": "L1-B1",
  "user_id": "USER-001"
}
```

### Example 3: Update Existing Task

```json
{
  "putaway_task": "PUT-TEST-001",
  "rack": "A1-R01",
  "bin": "L1-B1",
  "user_id": "USER-001"
}
```

### Example 4: Different Location Format

```json
{
  "tc_id": "TC-TEST-001",
  "rack": "RACK-A",
  "bin": "BIN-01",
  "user_id": "USER-001"
}
```

---

## Location Format Examples

The system supports multiple location formats:

### Format 1: 4-Part Format
- **Rack:** `A1-R01`
- **Bin:** `L1-B1`
- **Full Location:** `A1-R01-L1-B1`

### Format 2: 2-Part Format
- **Rack:** `RACK-A`
- **Bin:** `BIN-01`
- **Full Location:** `RACK-A-BIN-01`

### Format 3: Rack Only
- **Rack:** `RACK-A`
- **Bin:** `null` or omitted
- **Full Location:** `RACK-A`

---

## Testing Workflow

### Step 1: Create Putaway Task (via scan-transfer-carton)
```json
POST /api/putaway/scan-transfer-carton
{
  "tc_id": "TC-TEST-001",
  "rack": "A1-R01",
  "bin": "L1-B1",
  "user_id": "USER-001"
}
```

### Step 2: Assign Additional Items (optional)
```json
POST /api/putaway/assign-rack
{
  "putaway_task": "PUT-20250120-0001",
  "carton_id": "BOX-ITEM001-001",
  "item_code": "ITEM001",
  "rack": "A1-R01",
  "bin": "L1-B2",
  "qty": 50.00,
  "user_id": "USER-001"
}
```

### Step 3: Complete Putaway (updates stock)
```json
POST /api/putaway/complete
{
  "putaway_task": "PUT-20250120-0001",
  "performed_by": "USER-001",
  "items": [
    {
      "item_code": "ITEM001",
      "qty": 50.00,
      "source_bin": "DOCK-01",
      "target_bin": "A1-R01-L1-B1",
      "completed": true
    }
  ]
}
```

---

## cURL Examples

### Assign Rack
```bash
curl -X POST http://localhost:3000/api/putaway/assign-rack \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "putaway_task": "PUT-TEST-001",
    "carton_id": "BOX-ITEM001-001",
    "item_code": "ITEM001",
    "rack": "A1-R01",
    "bin": "L1-B1",
    "qty": 50.00,
    "user_id": "USER-001"
  }'
```

### Complete Putaway
```bash
curl -X POST http://localhost:3000/api/putaway/complete \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "putaway_task": "PUT-TEST-001",
    "performed_by": "USER-001",
    "items": [
      {
        "item_code": "ITEM001",
        "qty": 50.00,
        "source_bin": "DOCK-01",
        "target_bin": "A1-R01-L1-B1",
        "completed": true
      }
    ]
  }'
```

### Scan Transfer Carton
```bash
curl -X POST http://localhost:3000/api/putaway/scan-transfer-carton \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "tc_id": "TC-TEST-001",
    "rack": "A1-R01",
    "bin": "L1-B1",
    "user_id": "USER-001"
  }'
```

---

## Notes

1. **Replace Placeholders:**
   - `ITEM001`, `ITEM002`, etc. → Your actual item codes
   - `PUT-TEST-001` → Actual putaway task ID (or let API create it)
   - `TC-TEST-001` → Actual transfer carton ID
   - `USER-001` → Actual user ID

2. **Location Formats:**
   - Use consistent format within a task
   - System supports multiple formats (A1-R01-L1-B1, RACK-A-BIN-01, etc.)

3. **Stock Update:**
   - Stock ledger is updated when you call `/api/putaway/complete`
   - Items become visible in "Location Breakdown" after stock is updated

4. **Testing:**
   - First run `TEST_PUTAWAY_DATA_SIMPLE.sql` to create test data
   - Then use these JSON payloads to test the API endpoints
   - View results in desktop app using "Show Location Breakdown"

