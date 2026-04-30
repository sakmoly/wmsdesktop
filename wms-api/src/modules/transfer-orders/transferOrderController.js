// Transfer Order operations - Update quantities endpoint

import { getConnection } from '../../db/connection.js';
import { backfillSortToBoxTransferOrder } from '../../services/backfillScanEventTransferOrder.js';
import { updateTransferOrderQuantities, updateAllTransferOrderQuantities } from './updateTransferOrderQuantities.js';

/**
 * POST /api/transfer-orders/:to_no/update-quantities
 * Manually update sorted_qty and packed_qty for a specific Transfer Order
 */
export const updateTransferOrderQuantitiesEndpoint = async (req, res) => {
  const { to_no } = req.params;

  if (!to_no) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Transfer Order number is required'
      }
    });
  }

  try {
    await updateTransferOrderQuantities(to_no);
    
    res.json({
      ok: true,
      message: `Transfer Order ${to_no} quantities updated successfully`
    });
  } catch (error) {
    console.error(`Error updating Transfer Order ${to_no} quantities:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update Transfer Order quantities',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};

/**
 * POST /api/transfer-orders/update-all-quantities
 * Update sorted_qty and packed_qty for all Transfer Orders
 */
export const updateAllTransferOrderQuantitiesEndpoint = async (req, res) => {
  try {
    await updateAllTransferOrderQuantities();
    
    res.json({
      ok: true,
      message: 'All Transfer Order quantities updated successfully'
    });
  } catch (error) {
    console.error('Error updating all Transfer Order quantities:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update Transfer Order quantities',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  }
};

/**
 * POST /api/transfer-orders/backfill-scan-transfer-order
 * Body/query: apply=true to execute; default dry-run (counts only).
 * Sets tabWmsScanEvent.transfer_order for SORT_TO_BOX from sort box + TO; when apply is true,
 * runs update-all TO quantities afterward.
 */
export const backfillScanEventTransferOrderEndpoint = async (req, res) => {
  const apply =
    req.body?.apply === true ||
    req.query?.apply === '1' ||
    String(req.query?.apply || '').toLowerCase() === 'true';

  const connection = await getConnection();
  try {
    const data = await backfillSortToBoxTransferOrder(connection, {
      dryRun: !apply,
    });

    if (!data.ok) {
      return res.status(400).json({ ok: false, data });
    }

    if (apply) {
      await updateAllTransferOrderQuantities();
    }

    return res.json({
      ok: true,
      data: {
        ...data,
        quantities_refreshed: Boolean(apply),
      },
    });
  } catch (error) {
    console.error('backfillScanEventTransferOrder error:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'BACKFILL_ERROR',
        message: 'Backfill failed',
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

