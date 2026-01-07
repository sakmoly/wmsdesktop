# Analyzing Putaway Query Issue

## Problem
Duplicate lines are still being created even after fixes. Let's check the queries first.

## Queries Used in `completePutaway`

### Query 1: Exact Location Match (Line 821-830)
```sql
SELECT id, carton_id, qty FROM tabPutawayLine 
WHERE parent_title = ? 
  AND item_code = ? 
  AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
  AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
  AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
LIMIT 1
```

**Parameters:**
- `putaway_task`
- `item.item_code`
- `rackValue` (3 times for NULL handling)
- `binValue` (3 times for NULL handling)
- `itemCartonId` (2 times for NULL handling)

**Issue:** This query uses `rackValue` and `binValue` which are:
```javascript
const rackValue = rack || '';
const binValue = bin || '';
```

If `rack` or `bin` is `null`, they become empty strings `''`. But if the database has `NULL`, the comparison might not work correctly.

### Query 2: Same Item+Carton (Line 857-864)
```sql
SELECT id, rack, bin, carton_id FROM tabPutawayLine 
WHERE parent_title = ? 
  AND item_code = ? 
  AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
LIMIT 1
```

**Parameters:**
- `putaway_task`
- `item.item_code`
- `itemCartonId` (2 times for NULL handling)

**Issue:** This query doesn't check location at all - it only checks item+carton. If a line exists with different location, it will UPDATE it, which is correct. But if the UPDATE doesn't happen (maybe due to transaction issues), a new line might be inserted.

### Query 3: Final Check Before Insert (Line 901-910)
```sql
SELECT id FROM tabPutawayLine 
WHERE parent_title = ? 
  AND item_code = ? 
  AND rack = ?
  AND bin = ?
  AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
LIMIT 1
```

**Parameters:**
- `putaway_task`
- `item.item_code`
- `rack` (not `rackValue`!)
- `binValue`
- `itemCartonId` (2 times)

**Issue:** This query uses `rack` directly (not `rackValue`), which might be `null`. If `rack` is `null` and the database has an empty string `''`, they won't match!

## Potential Issues

1. **NULL vs Empty String Mismatch**
   - Query 1 uses `rackValue` and `binValue` (converted to `''` if null)
   - Query 3 uses `rack` directly (might be `null`)
   - If database has `NULL` but code uses `''`, or vice versa, queries won't match

2. **Transaction Isolation**
   - If two requests come in simultaneously, both might not find the line
   - Both might insert, creating duplicates

3. **Query 2 UPDATE might fail silently**
   - If UPDATE fails, the code continues to Query 3
   - Query 3 might not find the line (due to NULL/empty mismatch)
   - New line gets inserted

## Testing Steps

1. **Run `TEST_PUTAWAY_QUERIES_DETAILED.sql`** with your actual values
2. **Check the results:**
   - Does Query 1 find the existing line?
   - Does Query 2 find the line with different location?
   - Does Query 3 find the line before insert?
3. **Check for NULL vs empty string:**
   ```sql
   SELECT 
     id, 
     rack, 
     bin,
     CASE WHEN rack IS NULL THEN 'NULL' ELSE 'NOT NULL' END as rack_null,
     CASE WHEN bin IS NULL THEN 'NULL' ELSE 'NOT NULL' END as bin_null,
     LENGTH(COALESCE(rack, '')) as rack_length,
     LENGTH(COALESCE(bin, '')) as bin_length
   FROM tabPutawayLine
   WHERE parent_title = 'PUT-20251230-0001'
     AND item_code = 'SKU-HAT-301-BLU-OS';
   ```

## Fixes Needed

1. **Consistent NULL handling:**
   - Use `rackValue` and `binValue` consistently in ALL queries
   - Or use `COALESCE(rack, '')` in SQL

2. **Add UNIQUE constraint:**
   ```sql
   ALTER TABLE tabPutawayLine 
   ADD UNIQUE KEY unique_putaway_line (parent_title, item_code, carton_id, rack, bin);
   ```
   This will prevent duplicates at the database level.

3. **Better error handling:**
   - Check if UPDATE actually updated a row
   - If UPDATE affects 0 rows, log a warning

4. **Use INSERT ... ON DUPLICATE KEY UPDATE:**
   ```sql
   INSERT INTO tabPutawayLine 
   (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     qty = VALUES(qty),
     rack = VALUES(rack),
     bin = VALUES(bin),
     updated_at = NOW()
   ```

