# Backend Lock Carton Status Fix - "In Receiving" → "Receiving"

## ⚠️ Issue

The `POST /api/carton/lock` endpoint in the backend is still using `"In Receiving"` (with space) when locking cartons in the `tabCartonStatus` table. This needs to be changed to `"Receiving"` (no space) to match the updated status format.

## 📋 Location

**File:** `wms-api/src/modules/cartons/cartonController.js`  
**Function:** `lockCarton`  
**Table:** `tabCartonStatus`  
**Status Column:** `status`

## 🔧 Required Changes

### Current Code (Likely):

```javascript
export const lockCarton = asyncHandler(async (req, res) => {
  const { inbound_session, asn_no, carton_id, user_id, device_id } = req.body;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Check if carton is already locked by another user
    const [existing] = await connection.query(`
      SELECT locked_by, status
      FROM tabCartonStatus
      WHERE asn_no = ? AND inbound_session = ? AND carton_id = ?
    `, [asn_no, inbound_session, carton_id]);
    
    if (existing.length > 0) {
      const carton = existing[0];
      
      // If locked by different user and still in "In Receiving" status
      if (carton.locked_by && carton.locked_by !== user_id && carton.status === 'In Receiving') {
        await connection.rollback();
        
        return res.json({
          locked: false,
          message: `Carton is already being processed by ${carton.locked_by}`
        });
      }
    }
    
    // Insert or update carton status
    await connection.query(`
      INSERT INTO tabCartonStatus 
      (asn_no, inbound_session, carton_id, status, locked_by, locked_on, updated_on)
      VALUES (?, ?, ?, 'In Receiving', ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        status = 'In Receiving',
        locked_by = VALUES(locked_by),
        locked_on = NOW(),
        updated_on = NOW()
    `, [asn_no, inbound_session, carton_id, user_id]);
    
    await connection.commit();
    
    logger.info({ carton_id, user_id, asn_no }, 'Carton locked');
    
    res.json({
      locked: true,
      message: 'Carton locked successfully'
    });
    
  } catch (error) {
    await connection.rollback();
    logger.error({ error, body: req.body }, 'Failed to lock carton');
    throw error;
  } finally {
    connection.release();
  }
});
```

### Updated Code (Fixed):

```javascript
export const lockCarton = asyncHandler(async (req, res) => {
  const { inbound_session, asn_no, carton_id, user_id, device_id } = req.body;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Check if carton is already locked by another user
    const [existing] = await connection.query(`
      SELECT locked_by, status
      FROM tabCartonStatus
      WHERE asn_no = ? AND inbound_session = ? AND carton_id = ?
    `, [asn_no, inbound_session, carton_id]);
    
    if (existing.length > 0) {
      const carton = existing[0];
      
      // If locked by different user and still in "Receiving" status
      if (carton.locked_by && carton.locked_by !== user_id && carton.status === 'Receiving') {
        await connection.rollback();
        
        return res.json({
          locked: false,
          message: `Carton is already being processed by ${carton.locked_by}`
        });
      }
    }
    
    // Insert or update carton status
    await connection.query(`
      INSERT INTO tabCartonStatus 
      (asn_no, inbound_session, carton_id, status, locked_by, locked_on, updated_on)
      VALUES (?, ?, ?, 'Receiving', ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        status = 'Receiving',
        locked_by = VALUES(locked_by),
        locked_on = NOW(),
        updated_on = NOW()
    `, [asn_no, inbound_session, carton_id, user_id]);
    
    await connection.commit();
    
    logger.info({ carton_id, user_id, asn_no }, 'Carton locked');
    
    res.json({
      locked: true,
      message: 'Carton locked successfully'
    });
    
  } catch (error) {
    await connection.rollback();
    logger.error({ error, body: req.body }, 'Failed to lock carton');
    throw error;
  } finally {
    connection.release();
  }
});
```

## 🔍 Changes Summary

1. **Status Check:** `carton.status === 'In Receiving'` → `carton.status === 'Receiving'`
2. **INSERT Status:** `'In Receiving'` → `'Receiving'`
3. **UPDATE Status:** `status = 'In Receiving'` → `status = 'Receiving'`

## 📝 Database Migration (Optional)

If you have existing records with `"In Receiving"` status in `tabCartonStatus`, you may want to migrate them:

```sql
-- Update existing "In Receiving" status to "Receiving" in tabCartonStatus
UPDATE tabCartonStatus
SET status = 'Receiving',
    updated_on = NOW()
WHERE status = 'In Receiving';
```

## ✅ Verification

After making the changes:

1. **Test Lock Carton:**
   ```bash
   curl -X POST http://localhost:3000/api/carton/lock \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "asn_no": "ASN-00002",
       "inbound_session": "SESSION-ASN0002-DEVICE001-USER172188",
       "carton_id": "CTN-0101",
       "user_id": "USER-172188",
       "device_id": "DEVICE-001"
     }'
   ```

2. **Check Database:**
   ```sql
   SELECT carton_id, status, locked_by, locked_on
   FROM tabCartonStatus
   WHERE carton_id = 'CTN-0101' AND asn_no = 'ASN-00002';
   ```
   
   **Expected Result:** `status` should be `'Receiving'` (not `'In Receiving'`)

## 📋 Complete Status Update Checklist

- [ ] Update `lockCarton` function in `cartonController.js`
- [ ] Change status check from `'In Receiving'` to `'Receiving'`
- [ ] Change INSERT status value from `'In Receiving'` to `'Receiving'`
- [ ] Change UPDATE status value from `'In Receiving'` to `'Receiving'`
- [ ] (Optional) Run database migration script to update existing records
- [ ] Test the lock carton endpoint
- [ ] Verify database shows `'Receiving'` status

## 🎯 Summary

The `lockCarton` function needs to be updated to use `'Receiving'` instead of `'In Receiving'` in all places:
- Status comparison checks
- INSERT statements
- UPDATE statements

This ensures consistency with the updated status format across the entire system.

