# Verify Putaway Task Values in Database

## 📋 Expected Values for Transfer In Putaway Task

Based on the logs, here's what should be in the database:

### Putaway Task: PUT-20260106-0005

**Expected Values in `tabPutawayTask`:**

| Column | Expected Value | Notes |
|--------|---------------|-------|
| `title` | `PUT-20260106-0005` | Auto-generated |
| `status` | `Draft` | Initial status |
| `source_type` | `TransferIn` | Identifies as Transfer In task |
| `transfer_in` | `INSLIP-123466` | Transfer In number |
| `advance_shipping_notice` | `INSLIP-123466` | Stores Transfer In number (required field) |
| `warehouse` | `STORE-003` | Only if column exists (logs show `warehouse=false`) |
| `inbound_session` | `""` (empty string) | Only if column exists and NOT NULL |
| `created_by` | `SYSTEM` | Auto-created |
| `created_at` | Current timestamp | |
| `updated_at` | Current timestamp | |

### Putaway Line: For PUT-20260106-0005

**Expected Values in `tabPutawayLine`:**

| Column | Expected Value | Notes |
|--------|---------------|-------|
| `parent_title` | `PUT-20260106-0005` | Links to Putaway Task |
| `item_code` | (Item code from Transfer In) | The item that was received |
| `carton_id` | (Carton ID or NULL) | If item has carton, else NULL |
| `qty` | (Quantity received) | From `received_qty` in Transfer In |
| `rack` | `TBD` | To Be Determined (not assigned yet) |
| `bin` | `TBD` | To Be Determined (not assigned yet) |
| `status` | `Pending` | Only if column exists |
| `created_at` | Current timestamp | |
| `updated_at` | Current timestamp | |

---

## 🔍 SQL Queries to Verify

### 1. Check Putaway Task

```sql
SELECT 
  title,
  status,
  source_type,
  transfer_in,
  advance_shipping_notice,
  warehouse,
  inbound_session,
  created_by,
  created_at,
  updated_at
FROM tabPutawayTask
WHERE transfer_in = 'INSLIP-123466'
   OR title = 'PUT-20260106-0005';
```

**Expected Result:**
```
title: PUT-20260106-0005
status: Draft
source_type: TransferIn
transfer_in: INSLIP-123466
advance_shipping_notice: INSLIP-123466
warehouse: NULL (if column doesn't exist) or STORE-003 (if exists)
inbound_session: "" (empty string) or NULL
created_by: SYSTEM
```

### 2. Check Putaway Lines

```sql
SELECT 
  id,
  parent_title,
  item_code,
  carton_id,
  qty,
  rack,
  bin,
  status,
  created_at,
  updated_at
FROM tabPutawayLine
WHERE parent_title = 'PUT-20260106-0005'
ORDER BY item_code;
```

**Expected Result:**
```
parent_title: PUT-20260106-0005
item_code: (the item code from Transfer In)
carton_id: (carton ID if cartonized, else NULL)
qty: (quantity received)
rack: TBD
bin: TBD
status: Pending (if column exists)
```

### 3. Check Transfer In Status

```sql
SELECT 
  title,
  status,
  from_showroom,
  to_warehouse,
  received_by,
  received_on
FROM tabTransferIn
WHERE title = 'INSLIP-123466';
```

**Expected Result:**
```
title: INSLIP-123466
status: Received
received_by: (user who received)
received_on: (timestamp when all items received)
```

### 4. Check Transfer In Items

```sql
SELECT 
  item_code,
  qty,
  received_qty,
  carton_id
FROM tabTransferInItem
WHERE parent_title = 'INSLIP-123466'
ORDER BY item_code;
```

**Expected Result:**
```
All items should have: received_qty = qty
(All items fully received)
```

---

## ✅ Verification Checklist

- [ ] Putaway Task exists: `PUT-20260106-0005`
- [ ] Status is `Draft`
- [ ] `source_type = 'TransferIn'`
- [ ] `transfer_in = 'INSLIP-123466'`
- [ ] `advance_shipping_notice = 'INSLIP-123466'`
- [ ] Putaway Line exists with correct item
- [ ] `rack = 'TBD'` and `bin = 'TBD'`
- [ ] Transfer In status is `Received`
- [ ] All Transfer In items have `received_qty = qty`

---

## 🔧 If Values Are Missing or Incorrect

### Issue: Putaway Task Not Found

**Check:**
```sql
SELECT * FROM tabPutawayTask 
WHERE title LIKE 'PUT-20260106%'
ORDER BY created_at DESC;
```

### Issue: Wrong Transfer In Number

**Check:**
```sql
SELECT * FROM tabPutawayTask 
WHERE transfer_in = 'INSLIP-123466';
```

### Issue: Missing Putaway Lines

**Check:**
```sql
SELECT * FROM tabPutawayLine 
WHERE parent_title = 'PUT-20260106-0005';
```

If no lines found, the Putaway Task was created but lines weren't. Check server logs for errors.

---

## 📊 Complete Verification Query

```sql
-- Complete verification
SELECT 
  pt.title as putaway_task,
  pt.status as task_status,
  pt.source_type,
  pt.transfer_in,
  pt.advance_shipping_notice,
  pt.warehouse,
  COUNT(pl.id) as line_count,
  GROUP_CONCAT(pl.item_code) as items
FROM tabPutawayTask pt
LEFT JOIN tabPutawayLine pl ON pt.title = pl.parent_title
WHERE pt.transfer_in = 'INSLIP-123466'
   OR pt.title = 'PUT-20260106-0005'
GROUP BY pt.title;
```

**Expected Result:**
```
putaway_task: PUT-20260106-0005
task_status: Draft
source_type: TransferIn
transfer_in: INSLIP-123466
advance_shipping_notice: INSLIP-123466
warehouse: NULL or STORE-003
line_count: 1
items: (item code)
```

---

**Status:** ✅ Ready for Verification  
**Date:** 2026-01-06

