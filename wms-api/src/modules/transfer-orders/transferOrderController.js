// Transfer Order operations - Update quantities endpoint

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

