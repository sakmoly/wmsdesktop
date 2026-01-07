# How to Trace Putaway Item Source

## Problem

You see putaway quantities that don't match what you actually received. You need to find out where these items came from.

## Quick Diagnostic

Run the SQL script `TRACE_PUTAWAY_ITEM_SOURCE.sql` to get a complete trace of:
1. Putaway lines and their quantities
2. Source events (SORT_TO_BOX, PACK_BOX_TO_TC)
3. Actual received quantities from inbound receiving
4. Comparison between putaway and received quantities
5. Duplicate lines identification

## Common Issues

### 1. Duplicate Putaway Lines

**Symptom:** Same item, same carton, same location appears multiple times with same quantity.

**Example:**
- Line 6: `PAW-ASN12225-1767124123207`, `SKU-HAT-301-RED-OS`, `800`, `A1-R01-L1-B1`, `B1`
- Line 7: `PAW-ASN12225-1767124123207`, `SKU-HAT-301-RED-OS`, `800`, `A1-R01-L1-B1`, `B1`

**Cause:** Putaway was completed multiple times, or the same transfer carton was scanned multiple times.

**Fix:** Run `FIND_DUPLICATE_PUTAWAY_LINES.sql` to identify and remove duplicates.

### 2. Items Not Actually Received

**Symptom:** Putaway quantity > Received quantity in inbound receiving.

**Check:**
```sql
SELECT 
  pl.item_code,
  SUM(pl.qty) as putaway_qty,
  COALESCE(SUM(irl.received_qty), 0) as received_qty,
  (SUM(pl.qty) - COALESCE(SUM(irl.received_qty), 0)) as difference
FROM tabPutawayLine pl
LEFT JOIN tabInboundReceiveLine irl ON 
  irl.item_code = pl.item_code 
  AND irl.parent_title = 'SESSION-ASN12225-DEVICE001-USER786249'
WHERE pl.parent_title = 'PUT-20251230-0001'
GROUP BY pl.item_code
HAVING SUM(pl.qty) > COALESCE(SUM(irl.received_qty), 0);
```

**Possible Causes:**
- Items were sorted into boxes but never received in inbound
- Duplicate putaway processing
- Items from different ASN mixed together

### 3. Items from Wrong Source

**Symptom:** Putaway shows items that weren't in the original ASN.

**Check:**
```sql
-- Check if items in putaway match ASN
SELECT 
  pl.item_code,
  pl.carton_id,
  pl.qty,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM tabInboundReceiveLine irl
      WHERE irl.item_code = pl.item_code
        AND irl.parent_title = 'SESSION-ASN12225-DEVICE001-USER786249'
    ) THEN '✅ In ASN'
    ELSE '❌ NOT in ASN'
  END as in_asn
FROM tabPutawayLine pl
WHERE pl.parent_title = 'PUT-20251230-0001';
```

## Step-by-Step Tracing

### Step 1: Check Putaway Lines

```sql
SELECT * FROM tabPutawayLine 
WHERE parent_title = 'PUT-20251230-0001'
ORDER BY item_code, carton_id;
```

### Step 2: Trace to Source Events

**For boxes (SORT_TO_BOX events):**
```sql
SELECT 
  box_id,
  item_code,
  SUM(qty) as total_qty
FROM tabWmsScanEvent
WHERE event_type = 'SORT_TO_BOX'
  AND box_id IN (
    SELECT DISTINCT carton_id 
    FROM tabPutawayLine 
    WHERE parent_title = 'PUT-20251230-0001'
  )
GROUP BY box_id, item_code;
```

**For transfer cartons (PACK_BOX_TO_TC events):**
```sql
SELECT 
  tc_id,
  box_id,
  item_code,
  SUM(qty) as total_qty
FROM tabWmsScanEvent
WHERE event_type = 'PACK_BOX_TO_TC'
  AND tc_id IN (
    SELECT DISTINCT carton_id 
    FROM tabPutawayLine 
    WHERE parent_title = 'PUT-20251230-0001'
    AND carton_id LIKE 'PAW-%'
  )
GROUP BY tc_id, box_id, item_code;
```

### Step 3: Check Actual Received Quantities

```sql
SELECT 
  item_code,
  SUM(received_qty) as total_received
FROM tabInboundReceiveLine
WHERE parent_title = 'SESSION-ASN12225-DEVICE001-USER786249'
GROUP BY item_code;
```

### Step 4: Compare All Sources

```sql
SELECT 
  pl.item_code,
  SUM(pl.qty) as putaway_qty,
  COALESCE(sort.total_qty, 0) as sort_qty,
  COALESCE(pack.total_qty, 0) as pack_qty,
  COALESCE(irl.total_received, 0) as received_qty
FROM tabPutawayLine pl
LEFT JOIN (
  SELECT box_id, item_code, SUM(qty) as total_qty
  FROM tabWmsScanEvent
  WHERE event_type = 'SORT_TO_BOX'
  GROUP BY box_id, item_code
) sort ON sort.box_id = pl.carton_id AND sort.item_code = pl.item_code
LEFT JOIN (
  SELECT tc_id, item_code, SUM(qty) as total_qty
  FROM tabWmsScanEvent
  WHERE event_type = 'PACK_BOX_TO_TC'
  GROUP BY tc_id, item_code
) pack ON pack.tc_id = pl.carton_id AND pack.item_code = pl.item_code
LEFT JOIN (
  SELECT item_code, SUM(received_qty) as total_received
  FROM tabInboundReceiveLine
  WHERE parent_title = 'SESSION-ASN12225-DEVICE001-USER786249'
  GROUP BY item_code
) irl ON irl.item_code = pl.item_code
WHERE pl.parent_title = 'PUT-20251230-0001'
GROUP BY pl.item_code;
```

## Fixing Duplicates

If you find duplicate lines:

1. **Identify duplicates:**
   ```sql
   SELECT carton_id, item_code, rack, bin, COUNT(*) as count
   FROM tabPutawayLine
   WHERE parent_title = 'PUT-20251230-0001'
   GROUP BY carton_id, item_code, rack, bin
   HAVING COUNT(*) > 1;
   ```

2. **Sum quantities and keep first line:**
   ```sql
   -- Update first line with sum
   UPDATE tabPutawayLine pl1
   INNER JOIN (
     SELECT carton_id, item_code, rack, bin, 
            MIN(id) as first_id, SUM(qty) as total_qty
     FROM tabPutawayLine
     WHERE parent_title = 'PUT-20251230-0001'
     GROUP BY carton_id, item_code, rack, bin
     HAVING COUNT(*) > 1
   ) dup ON pl1.id = dup.first_id
   SET pl1.qty = dup.total_qty;
   
   -- Delete duplicates
   DELETE pl2 FROM tabPutawayLine pl2
   INNER JOIN (
     SELECT carton_id, item_code, rack, bin, MIN(id) as first_id
     FROM tabPutawayLine
     WHERE parent_title = 'PUT-20251230-0001'
     GROUP BY carton_id, item_code, rack, bin
     HAVING COUNT(*) > 1
   ) dup ON pl2.carton_id = dup.carton_id
     AND pl2.item_code = dup.item_code
     AND pl2.rack = dup.rack
     AND pl2.bin = dup.bin
     AND pl2.id > dup.first_id;
   ```

## Prevention

To prevent this in the future:

1. **Check for duplicates before creating putaway lines** - The API should already do this, but verify
2. **Don't complete putaway multiple times** - Check task status before completing
3. **Validate quantities** - Compare putaway quantities with source events before processing
4. **Use transactions** - Ensure atomic operations to prevent partial duplicates

