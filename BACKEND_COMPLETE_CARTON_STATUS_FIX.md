# Backend Complete Carton Status Fix - Check for "In Receiving"

## ⚠️ Potential Issue

The `POST /api/carton/complete` endpoint might also reference `"In Receiving"` status when completing cartons. Please verify and update if needed.

## 📋 Location

**File:** `wms-api/src/modules/cartons/cartonController.js`  
**Function:** `completeCarton`  
**Table:** `tabCartonStatus` or `tabReceivingCarton`

## 🔍 Check Required

Please verify the `completeCarton` function and update any references to `"In Receiving"` to `"Receiving"` if found.

### Expected Code Pattern:

```javascript
export const completeCarton = asyncHandler(async (req, res) => {
  const { inbound_session, asn_no, carton_id, user_id, device_id } = req.body;
  
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Update carton status to Received and clear lock
    await connection.query(`
      UPDATE tabCartonStatus
      SET status = 'Received',
          locked_by = NULL,
          locked_on = NULL,
          updated_on = NOW()
      WHERE asn_no = ? AND inbound_session = ? AND carton_id = ?
    `, [asn_no, inbound_session, carton_id]);
    
    // OR if using tabReceivingCarton:
    // await connection.query(`
    //   UPDATE tabReceivingCarton
    //   SET status = 'Received',
    //       locked_by = NULL,
    //       locked_on = NULL,
    //       updated_on = NOW()
    //   WHERE advance_shipping_notice = ? AND inbound_session = ? AND carton_id = ?
    // `, [asn_no, inbound_session, carton_id]);
    
    await connection.commit();
    
    logger.info({ carton_id, user_id, asn_no }, 'Carton completed');
    
    res.json({
      ok: true,
      message: 'Carton completed successfully'
    });
    
  } catch (error) {
    await connection.rollback();
    logger.error({ error, body: req.body }, 'Failed to complete carton');
    throw error;
  } finally {
    connection.release();
  }
});
```

## ✅ Action Required

1. Check if `completeCarton` function has any references to `"In Receiving"`
2. If found, update to `"Receiving"`
3. Verify the function works correctly after the change

## 📝 Note

The `completeCarton` function typically sets status to `"Received"`, so it might not have any `"In Receiving"` references. However, it's worth checking to ensure consistency.

