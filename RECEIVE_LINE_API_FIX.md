# Receive Line API Fix - Issue Resolved ✅

## 🐛 Problem Identified

The API was not inserting data because it relied on `ON DUPLICATE KEY UPDATE`, which **only works if a unique key constraint exists** on the table. Without the unique key constraint, the `ON DUPLICATE KEY UPDATE` clause is ignored, and the code would still try to insert, potentially causing errors or silently failing.

## ✅ Solution Implemented

Changed the code to use **explicit INSERT/UPDATE logic** based on an existence check, which works reliably regardless of whether the unique key constraint exists.

### Before (WRONG):
```javascript
// This only works if unique key constraint exists
await connection.query(`
  INSERT INTO tabInboundReceiveLine (...) VALUES (...)
  ON DUPLICATE KEY UPDATE ...
`, [...]);
```

### After (CORRECT):
```javascript
// Check if record exists first
const [existing] = await connection.query(
  `SELECT * FROM tabInboundReceiveLine 
   WHERE parent_title = ? AND carton_id = ? AND item_code = ?`,
  [parent_title.trim(), carton_id.trim().toUpperCase(), item_code.trim()]
);

const isUpdate = existing && existing.length > 0;

if (isUpdate) {
  // Update existing record
  await connection.query(
    `UPDATE tabInboundReceiveLine SET ... WHERE ...`,
    [...]
  );
} else {
  // Insert new record
  await connection.query(
    `INSERT INTO tabInboundReceiveLine (...) VALUES (...)`,
    [...]
  );
}
```

## 🔧 Changes Made

### 1. **Single Receive Line Endpoint** (`createOrUpdateReceiveLine`)
- ✅ Changed from `ON DUPLICATE KEY UPDATE` to explicit INSERT/UPDATE
- ✅ Removed unnecessary error handling fallback
- ✅ Simplified error handling

### 2. **Batch Receive Lines Endpoint** (`createOrUpdateReceiveLines`)
- ✅ Changed from `ON DUPLICATE KEY UPDATE` to explicit INSERT/UPDATE
- ✅ Improved error handling and logging
- ✅ Simplified error handling for each line

## ✅ Benefits

1. **Works without unique key constraint** - No database setup required
2. **Prevents duplicates** - Checks existence before inserting
3. **More reliable** - Explicit logic is easier to debug
4. **Better error handling** - Clearer error messages

## 🧪 Testing

The API should now work correctly. Test with:

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

## 📋 Next Steps

1. **Restart backend server** to apply the changes
2. **Test the API endpoints** using the examples above
3. **Verify data is inserted** by checking the database:
   ```sql
   SELECT * FROM tabInboundReceiveLine WHERE parent_title = 'SESSION-MOCK-002';
   ```

## ⚠️ Optional: Add Unique Key Constraint

While the API now works without it, adding a unique key constraint is still **recommended** for database-level protection:

```sql
ALTER TABLE tabInboundReceiveLine
ADD UNIQUE KEY uq_receive_line (parent_title, carton_id, item_code);
```

**Script provided:** `ADD_RECEIVE_LINE_UNIQUE_KEY.sql`

---

**Status:** ✅ **Fix Complete - Ready for Testing**

