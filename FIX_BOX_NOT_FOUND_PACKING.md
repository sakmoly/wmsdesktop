# Fix: Box Not Found in Database (Packing Error)

## Error Message
```
BOX PAW-ASN12225-176119651763 not found in database.

Please ensure:
- The box exists for ASN ASN-12225
- The box is for store WH-MAIN
- The box was created during ReceiveSort
```

## Problem Analysis

The mobile app is trying to pack a box (`PAW-ASN12225-176119651763`) into a transfer carton, but the box cannot be found or doesn't meet the validation criteria.

### Possible Causes

1. **Box doesn't exist in `tabSortBox` table**
   - The box ID `PAW-ASN12225-176119651763` is not in the database
   - It might have been deleted or never created

2. **Box exists but ASN doesn't match**
   - Box exists but `advance_shipping_notice` is not `ASN-12225`
   - ASN format mismatch (e.g., `ASN-12225` vs `ASN12225`)

3. **Box exists but store doesn't match**
   - Box exists but `store` is not `WH-MAIN`
   - Store code mismatch

4. **Box is a Putaway Box, not a Sort Box**
   - The box ID starts with `PAW-` which suggests it's a putaway box
   - Putaway boxes might not be in `tabSortBox` table
   - They might be in a different table or format

5. **Box status issue**
   - Box might be in a status that prevents packing (e.g., already closed, dispatched)

---

## Diagnostic Steps

### Step 1: Check if Box Exists

Run this SQL to check if the box exists:

```sql
-- Check if box exists
SELECT 
  box_id,
  status,
  advance_shipping_notice as asn_no,
  transfer_order as to_no,
  store,
  purpose,
  created_by,
  created_on,
  closed_by,
  closed_on
FROM tabSortBox
WHERE box_id = 'PAW-ASN12225-176119651763';
```

**If no results:** Box doesn't exist in `tabSortBox` table.

### Step 2: Check Similar Boxes

```sql
-- Check for similar boxes (same ASN, different timestamp)
SELECT 
  box_id,
  status,
  advance_shipping_notice as asn_no,
  store,
  created_on
FROM tabSortBox
WHERE advance_shipping_notice = 'ASN-12225'
  AND store = 'WH-MAIN'
ORDER BY created_on DESC;
```

### Step 3: Check All Boxes for ASN-12225

```sql
-- Check all boxes for this ASN
SELECT 
  box_id,
  status,
  advance_shipping_notice as asn_no,
  store,
  purpose,
  created_on
FROM tabSortBox
WHERE advance_shipping_notice = 'ASN-12225'
ORDER BY created_on DESC;
```

### Step 4: Check if it's a Transfer Carton Instead

The box ID `PAW-ASN12225-176119651763` looks like it might be a transfer carton ID. Check:

```sql
-- Check if it's a transfer carton
SELECT 
  tc_id,
  status,
  asn_no,
  to_no,
  store,
  created_on
FROM tabTransferCarton
WHERE tc_id = 'PAW-ASN12225-176119651763';
```

---

## Solutions

### Solution 1: Create the Box

If the box doesn't exist, create it:

**API Endpoint:**
```http
POST http://localhost:3000/api/boxes/create
Content-Type: application/json
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "box_id": "PAW-ASN12225-176119651763",
  "asn_no": "ASN-12225",
  "to_no": "",
  "store": "WH-MAIN",
  "purpose": "PUTAWAY",
  "user_id": "USER-786249"
}
```

**Note:** For warehouse boxes (WH-MAIN), `to_no` can be empty string.

### Solution 2: Use Correct Box ID

If you see a similar box in the database (from Step 2), use that box ID instead. For example, if you see:
- `PAW-ASN12225-1767119651763` (different timestamp)

Use that box ID in the mobile app.

### Solution 3: Check Box Status

If the box exists but is closed, you might need to reopen it:

**API Endpoint:**
```http
POST http://localhost:3000/api/boxes/reopen
Content-Type: application/json
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "box_id": "PAW-ASN12225-176119651763",
  "user_id": "USER-786249"
}
```

### Solution 4: Verify ASN Format

Check if the ASN format matches exactly:

```sql
-- Check ASN format in database
SELECT DISTINCT advance_shipping_notice 
FROM tabSortBox 
WHERE advance_shipping_notice LIKE '%12225%';
```

Make sure the mobile app uses the exact same format (e.g., `ASN-12225` vs `ASN12225`).

### Solution 5: Use Transfer Carton Instead

If `PAW-ASN12225-176119651763` is actually a transfer carton (not a box), you should:
1. **Create a transfer carton** instead of trying to pack a box
2. **Or** create a proper sort box first, then pack it

---

## Common Issues

### Issue 1: Box ID Format Mismatch

**Problem:** Box IDs starting with `PAW-` might be putaway-specific and not in `tabSortBox`.

**Solution:** 
- Create a proper sort box with format `BOX-{STORE}-{TIMESTAMP}`
- Or ensure putaway boxes are also stored in `tabSortBox` if needed

### Issue 2: Box Created During Putaway, Not ReceiveSort

**Problem:** The error says "box was created during ReceiveSort", but the box might have been created during putaway workflow.

**Solution:**
- Check the box's `purpose` field - it should be `STORE` or `PUTAWAY`
- If it's a putaway box, you might need to use a different workflow

### Issue 3: Box Not Closed

**Problem:** Box might need to be closed before packing.

**Solution:**
- Close the box first: `POST /api/boxes/close`
- Then try packing again

---

## Quick Fix

**If the box doesn't exist, create it:**

```bash
curl -X POST http://localhost:3000/api/boxes/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "box_id": "PAW-ASN12225-176119651763",
    "asn_no": "ASN-12225",
    "to_no": "",
    "store": "WH-MAIN",
    "purpose": "PUTAWAY",
    "user_id": "USER-786249"
  }'
```

**Then close it if needed:**

```bash
curl -X POST http://localhost:3000/api/boxes/close \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "box_id": "PAW-ASN12225-176119651763",
    "user_id": "USER-786249"
  }'
```

---

## Prevention

To avoid this error in the future:

1. **Always create boxes via API** before using them
2. **Use consistent box ID format** - prefer `BOX-{STORE}-{TIMESTAMP}` format
3. **Verify box exists** before packing: `GET /api/boxes/{box_id}`
4. **Check box status** - ensure it's in the correct status for packing
5. **Match ASN and store exactly** - use the exact format from the database

---

## Related APIs

- `GET /api/boxes/{box_id}` - Get box details
- `GET /api/boxes?asn={asn}&store={store}` - Get boxes for ASN and store
- `POST /api/boxes/create` - Create a new box
- `POST /api/boxes/close` - Close a box
- `POST /api/transfer-cartons/create` - Create transfer carton
- `POST /api/transfer-cartons/seal` - Seal transfer carton (packs boxes)

