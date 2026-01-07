# Cycle Count - Mobile App Requirements

## 📋 Required Request Format

The mobile app **MUST** send `item_code` (or `barcode`) in the request body for cycle count line updates.

---

## POST /api/cycle-count/:title/count

### ✅ Correct Request Format (REQUIRED)

```json
{
  "counted_by": "USER-001",
  "lines": [
    {
      "id": 1,
      "item_code": "SKU-HAT-301-BLU-OS", // ✅ REQUIRED
      "actual_qty": 5,
      "counted_qty": 5,
      "discrepancy_reason": null
    },
    {
      "id": 2,
      "item_code": "SKU-JEANS-001-BLK-32", // ✅ REQUIRED
      "actual_qty": 3,
      "counted_qty": 3,
      "discrepancy_reason": null
    }
  ]
}
```

### ❌ Incorrect Request Format (Will Fail)

```json
{
  "counted_by": "USER-001",
  "lines": [
    {
      "id": 1,
      // ❌ Missing item_code - will fail
      "actual_qty": 5,
      "counted_qty": 5
    }
  ]
}
```

---

## Field Requirements

### Required Fields:

- ✅ `item_code` OR `barcode` - **MUST be provided** for each line
- ✅ `actual_qty` OR `counted_qty` - **MUST be provided** for each line

### Optional Fields:

- `id` - Sequential line number (for reference, not used for matching)
- `line_id` - Database line ID (if known)
- `bin_location` - Bin location (helps with matching)
- `expected_qty` - Expected quantity (for new lines)
- `discrepancy_reason` - Reason for variance
- `reason_code` - Alternative field for discrepancy reason
- `notes` - Alternative field for discrepancy reason

---

## Backend Matching Logic

The backend uses the following strategies (in order):

1. **Database ID Matching** (if `line_id` or `id` is provided and is a database ID)

   - Checks if the ID exists in the database
   - Only used if the ID is a valid database ID

2. **Item Code Matching** (PRIMARY METHOD) ⭐

   - Matches by `item_code` and `bin_location` (if provided)
   - This is the most reliable method
   - **Requires `item_code` to be sent by mobile app**

3. **Auto-Create** (for ad-hoc counts)
   - Creates new line if not found
   - **Requires `item_code` to be sent by mobile app**

---

## Error Response

If `item_code` is missing, the backend will return:

```json
{
  "ok": true,
  "message": "Updated X lines with Y errors",
  "data": {
    "updated_count": X,
    "errors": [
      "Line missing required field: item_code or barcode. Line data: {...}"
    ]
  }
}
```

---

## Mobile App Implementation

### Required Changes:

1. **Include `item_code` in request:**

   ```typescript
   const lines = cycleCountLines.map((line) => ({
     id: line.id, // Sequential ID (optional, for reference)
     item_code: line.item_code, // ✅ REQUIRED
     actual_qty: line.counted_qty,
     counted_qty: line.counted_qty,
     discrepancy_reason: line.discrepancy_reason || null,
   }));
   ```

2. **Alternative: Use `barcode` field:**
   ```typescript
   const lines = cycleCountLines.map((line) => ({
     id: line.id,
     barcode: line.barcode, // ✅ Also accepted (maps to item_code)
     actual_qty: line.counted_qty,
     counted_qty: line.counted_qty,
   }));
   ```

---

## Example Complete Request

```json
{
  "counted_by": "MOBILE-USER",
  "lines": [
    {
      "id": 1,
      "item_code": "SKU-HAT-301-BLU-OS",
      "barcode": "1234567890123",
      "actual_qty": 10,
      "counted_qty": 10,
      "bin_location": "A1-R01-L1-B1",
      "expected_qty": 10,
      "discrepancy_reason": null
    },
    {
      "id": 2,
      "item_code": "SKU-JEANS-001-BLK-32",
      "barcode": "1234567890124",
      "actual_qty": 5,
      "counted_qty": 5,
      "bin_location": "A1-R01-L1-B1",
      "expected_qty": 5,
      "discrepancy_reason": null
    },
    {
      "id": 3,
      "item_code": "SKU-SHIRT-001-WHT-M",
      "barcode": "1234567890125",
      "actual_qty": 0,
      "counted_qty": 0,
      "bin_location": "A1-R01-L1-B1",
      "expected_qty": 3,
      "discrepancy_reason": "Damaged - Item broken"
    }
  ]
}
```

---

## Benefits of This Approach

1. ✅ **Reliable Matching** - Item code is unique and reliable
2. ✅ **Simple Backend Logic** - No complex sequential ID mapping
3. ✅ **Works for All Scenarios** - Existing tasks, ad-hoc counts, new lines
4. ✅ **Better Error Messages** - Clear requirement for item_code
5. ✅ **Supports Auto-Create** - Can create new lines if needed

---

## Migration Notes

**For Mobile App Developers:**

1. Update the sync function to include `item_code` in each line object
2. The `item_code` should come from the cycle count line data stored locally
3. If `item_code` is not available, fetch it from the task details first
4. Test with a sample request to verify the format

---

## Testing Checklist

- [ ] Mobile app sends `item_code` in request
- [ ] Backend successfully matches lines by `item_code`
- [ ] Lines are updated correctly in database
- [ ] Error message shown if `item_code` is missing
- [ ] Works for existing tasks
- [ ] Works for ad-hoc counts (auto-creates lines if needed)
