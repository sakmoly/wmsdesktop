# Receive Line API - Mobile App Fix Guide

## 🐛 Error Explanation

**Error:** `VALIDATION_ERROR` - `"parent_title" is required`

**Cause:** The mobile app is calling the receive line API endpoint but **not sending `parent_title`** in the request body, or it's sending it with a different field name.

---

## ✅ Correct API Request Format

### For Single Receive Line: `POST /api/inbound/receive-line`

```json
{
  "parent_title": "SESSION-MOCK-002", // ← REQUIRED: Session ID
  "carton_id": "CTN-0201", // ← REQUIRED
  "item_code": "SKU-JEANS-001-BLK-32", // ← REQUIRED
  "expected_qty": 50.0, // ← REQUIRED
  "received_qty": 50.0, // ← REQUIRED
  "condition": "Good", // ← Optional (default: "Good")
  "remarks": null // ← Optional
}
```

### For Batch Receive Lines: `POST /api/inbound/receive-lines`

```json
{
  "parent_title": "SESSION-MOCK-002", // ← REQUIRED: Session ID (once for all lines)
  "receive_lines": [
    // ← REQUIRED: Array of receive lines
    {
      "carton_id": "CTN-0201", // ← REQUIRED (in each line)
      "item_code": "SKU-JEANS-001-BLK-32", // ← REQUIRED (in each line)
      "expected_qty": 50.0, // ← REQUIRED (in each line)
      "received_qty": 50.0, // ← REQUIRED (in each line)
      "condition": "Good", // ← Optional (in each line)
      "remarks": null // ← Optional (in each line)
    },
    {
      "carton_id": "CTN-0202",
      "item_code": "SKU-JEANS-001-BLU-32",
      "expected_qty": 50.0,
      "received_qty": 50.0,
      "condition": "Good",
      "remarks": null
    }
  ]
}
```

---

## 🔍 Common Issues & Solutions

### Issue 1: Using `inbound_session` instead of `parent_title`

**Problem:** Mobile app might be using field name `inbound_session` instead of `parent_title`.

**Solution:** Change the field name from `inbound_session` to `parent_title`:

```javascript
// ❌ WRONG
{
  "inbound_session": "SESSION-MOCK-002",  // Wrong field name
  "carton_id": "CTN-0201",
  ...
}

// ✅ CORRECT
{
  "parent_title": "SESSION-MOCK-002",     // Correct field name
  "carton_id": "CTN-0201",
  ...
}
```

### Issue 2: Missing `parent_title` in request

**Problem:** Mobile app is not including `parent_title` in the request at all.

**Solution:** Make sure to include `parent_title` with the session ID:

```javascript
// ❌ WRONG - Missing parent_title
{
  "carton_id": "CTN-0201",
  "item_code": "SKU-001",
  "expected_qty": 50.00,
  "received_qty": 50.00
}

// ✅ CORRECT - Includes parent_title
{
  "parent_title": "SESSION-MOCK-002",  // ← Add this!
  "carton_id": "CTN-0201",
  "item_code": "SKU-001",
  "expected_qty": 50.00,
  "received_qty": 50.00
}
```

### Issue 3: Empty or null `parent_title`

**Problem:** Mobile app is sending `parent_title` but it's empty or null.

**Solution:** Ensure `parent_title` has a valid session ID value:

```javascript
// ❌ WRONG - Empty or null
{
  "parent_title": "",      // Empty string
  // or
  "parent_title": null,    // Null value
  ...
}

// ✅ CORRECT - Valid session ID
{
  "parent_title": "SESSION-MOCK-002",  // Valid session ID
  ...
}
```

---

## 📱 Mobile App Code Example

### React Native / TypeScript Example

```typescript
// Single Receive Line
const saveReceiveLine = async (
  sessionId: string,
  cartonId: string,
  itemCode: string,
  expectedQty: number,
  receivedQty: number
) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/inbound/receive-line`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        parent_title: sessionId, // ← Use parent_title, not inbound_session
        carton_id: cartonId,
        item_code: itemCode,
        expected_qty: expectedQty,
        received_qty: receivedQty,
        condition: "Good",
      }),
    });

    const result = await response.json();
    if (result.ok) {
      console.log("Receive line saved:", result.data);
    } else {
      console.error("Error:", result.message);
    }
  } catch (error) {
    console.error("API Error:", error);
  }
};

// Batch Receive Lines
const saveReceiveLines = async (
  sessionId: string,
  receiveLines: Array<{
    carton_id: string;
    item_code: string;
    expected_qty: number;
    received_qty: number;
    condition?: string;
  }>
) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/inbound/receive-lines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        parent_title: sessionId, // ← Use parent_title for batch too
        receive_lines: receiveLines,
      }),
    });

    const result = await response.json();
    if (result.ok) {
      console.log(`Saved ${result.successful} receive lines`);
    } else {
      console.error("Error:", result.message);
    }
  } catch (error) {
    console.error("API Error:", error);
  }
};
```

---

## 🔑 Key Points

1. **Field Name:** Use `parent_title` (NOT `inbound_session`)
2. **Required:** `parent_title` is **mandatory** - cannot be omitted, empty, or null
3. **Value:** `parent_title` must be the **session ID** (e.g., "SESSION-MOCK-002")
4. **Location:**
   - **Single endpoint:** `parent_title` is at the root level
   - **Batch endpoint:** `parent_title` is at the root level (once for all lines)

---

## ✅ Validation Rules

The backend validation requires:

- ✅ `parent_title` - **Required**, must be a non-empty string
- ✅ `carton_id` - **Required**, must be a non-empty string
- ✅ `item_code` - **Required**, must be a non-empty string
- ✅ `expected_qty` - **Required**, must be >= 0
- ✅ `received_qty` - **Required**, must be >= 0
- ⚪ `condition` - Optional, must be one of: "Good", "Damaged", "Missing", "Short" (default: "Good")
- ⚪ `remarks` - Optional, can be null or empty string

---

## 🧪 Test with cURL

```bash
# Test single receive line
curl -X POST http://localhost:3000/api/inbound/receive-line \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parent_title": "SESSION-MOCK-002",
    "carton_id": "CTN-0201",
    "item_code": "SKU-JEANS-001-BLK-32",
    "expected_qty": 50.00,
    "received_qty": 50.00,
    "condition": "Good"
  }'

# Test batch receive lines
curl -X POST http://localhost:3000/api/inbound/receive-lines \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parent_title": "SESSION-MOCK-002",
    "receive_lines": [
      {
        "carton_id": "CTN-0201",
        "item_code": "SKU-JEANS-001-BLK-32",
        "expected_qty": 50.00,
        "received_qty": 50.00,
        "condition": "Good"
      }
    ]
  }'
```

---

**Fix:** Update your mobile app code to include `parent_title` (with the session ID) in the request body.
