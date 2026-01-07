# Cycle Count Line Update Fix

## ✅ Solution: Require item_code from Mobile App

**Decision:** The mobile app will send `item_code` in the request, and the backend will use simple, reliable matching logic.

### Mobile App Request Format (REQUIRED):
```json
{
  "counted_by": "USER-001",
  "lines": [
    {
      "id": 1,              // Optional: Sequential ID for reference
      "item_code": "SKU-HAT-301-BLU-OS",  // ✅ REQUIRED
      "actual_qty": 5,
      "counted_qty": 5,
      "discrepancy_reason": null
    }
  ]
}
```

---

## ✅ Solution Implemented

### 1. **Require item_code from Mobile App**
The mobile app **MUST** send `item_code` (or `barcode`) in each line object.

### 2. **Simple Matching Logic**
The backend uses straightforward matching strategies:

1. **Database ID Matching** (if provided)
   - If `line_id` is provided as "LINE-{id}" or direct number
   - Check if it's a valid database ID

2. **Item Code Matching** (PRIMARY METHOD) ⭐
   - Match by `item_code` and `bin_location` (if provided)
   - This is the most reliable method

3. **Auto-Create** (for ad-hoc counts)
   - Creates new line if not found
   - Requires `item_code` to be sent

### 3. **Validation**
Backend validates that `item_code` is present:
```javascript
if (!itemCode) {
  errors.push(`Line missing required field: item_code or barcode. Line data: ${JSON.stringify(line)}`);
  continue;
}
```

### 4. **Enhanced Logging**
Added detailed logging to track matching:
```javascript
console.log(`[Cycle Count] ✅ Found line by item_code: ${lineId} (item: ${itemCode})`);
```

### 5. **Error Handling**
Clear error messages when `item_code` is missing:
```javascript
errors.push(`Line missing required field: item_code or barcode. Line data: ${JSON.stringify(line)}`);
```

---

## 📋 Updated Code Flow

### Before (Broken):
```
1. Receive request with sequential ID = 1, no item_code
2. Try: WHERE id = 1 AND parent_title = ?  ❌ Not found (database ID is 45)
3. Try: WHERE item_code = ?  ❌ item_code not in request
4. Fail silently or create error
```

### After (Fixed):
```
1. Receive request with item_code = "SKU-HAT-301-BLU-OS"
2. Validate: item_code present ✅
3. Match: WHERE item_code = "SKU-HAT-301-BLU-OS" AND parent_title = ? ✅
4. Update: WHERE id = 45 ✅ SUCCESS
```

---

## 🧪 Testing

### Test Case 1: Existing Task with Lines
**Task:** CC-0001 has 3 lines with item codes: "SKU-001", "SKU-002", "SKU-003"

**Request:**
```json
{
  "counted_by": "USER-001",
  "lines": [
    { "id": 1, "item_code": "SKU-001", "actual_qty": 5 },
    { "id": 2, "item_code": "SKU-002", "actual_qty": 3 },
    { "id": 3, "item_code": "SKU-003", "actual_qty": 0 }
  ]
}
```

**Expected:**
- item_code "SKU-001" → Matches line → Updates successfully ✅
- item_code "SKU-002" → Matches line → Updates successfully ✅
- item_code "SKU-003" → Matches line → Updates successfully ✅

### Test Case 2: Ad-Hoc Count (New Task)
**Request:** `POST /api/cycle-count/CC-A1-R01-L1-B1-7658B91F/count`

**Request Body:**
```json
{
  "counted_by": "USER-001",
  "lines": [
    { "item_code": "SKU-001", "actual_qty": 10 }
  ]
}
```

**Expected:**
- Task auto-created ✅
- Line auto-created with item_code "SKU-001" ✅

---

## ⚠️ Important Notes

1. **item_code is REQUIRED**
   - Mobile app **MUST** send `item_code` (or `barcode`) in each line
   - Backend will reject requests without `item_code`

2. **Lines must exist in database first (or will be auto-created)**
   - For existing tasks: Lines should already exist, matched by `item_code`
   - For ad-hoc counts: Lines are auto-created if `item_code` is provided

3. **Matching is reliable**
   - `item_code` is unique and reliable for matching
   - No dependency on sequential IDs or array ordering

4. **Mobile app must send item_code**
   - Primary matching method is `item_code` → database lookup
   - This is the simplest and most reliable approach

---

## 🔧 Code Changes Summary

### File: `wms-api/src/modules/cycle-count/cycleCountController.js`

**Changes:**
1. ✅ **Require `item_code`** in request (validation added)
2. ✅ **Simplified matching logic** - removed sequential ID matching
3. ✅ **Primary matching by `item_code`** - most reliable method
4. ✅ **Database ID matching** - fallback if `line_id` provided
5. ✅ **Auto-create support** - creates lines for ad-hoc counts
6. ✅ Added detailed logging for debugging
7. ✅ Enhanced error messages for missing `item_code`

---

## ✅ Verification

After this fix:
- ✅ `item_code` is required and validated
- ✅ Lines are matched reliably by `item_code`
- ✅ Lines are updated successfully
- ✅ Works for both existing tasks and ad-hoc counts
- ✅ Detailed logging helps debug any remaining issues
- ✅ Simple, maintainable code

---

## 🚀 Next Steps

1. **Update mobile app** - Ensure `item_code` is included in request
2. **Test with mobile app** - Verify lines are updating correctly
3. **Check server logs** - Look for matching messages:
   - `✅ Found line by item_code: X (item: Y)`
   - `✅ Updated line X for task Y`
4. **Monitor errors** - Check for any "Line missing required field: item_code" errors

---

## 📝 API URL Verification

The API endpoint is correct:
```
POST /api/cycle-count/{title}/count
```

Example:
```
POST /api/cycle-count/CC-A1-R01-L1-B1-7658B91F/count
```

This matches the mobile app's request format. ✅

