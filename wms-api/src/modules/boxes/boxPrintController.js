// wms-api/src/modules/boxes/boxPrintController.js
// Box printing operations

import { getConnection } from '../../db/connection.js';

/**
 * POST /api/boxes/print
 * Print a box label
 * 
 * Request Body:
 * {
 *   "box_id": "BOX-001",
 *   "printer_id": "PRINTER-001",  // Optional
 *   "copies": 1  // Optional
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "ok": true,
 *   "message": "Print job queued successfully",
 *   "job_id": "PRINT-1234567890",
 *   "box_id": "BOX-001"
 * }
 */
export const printBox = async (req, res) => {
  const { box_id, printer_id, copies = 1 } = req.body;

  // Validation
  if (!box_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'box_id is required'
      }
    });
  }

  const connection = await getConnection();

  try {
    // Get box details from database
    const [boxes] = await connection.execute(`
      SELECT 
        box_id,
        status,
        advance_shipping_notice as asn_no,
        transfer_order,
        store,
        purpose,
        created_by,
        created_on
      FROM tabSortBox
      WHERE box_id = ?
    `, [box_id]);

    if (boxes.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: 'BOX_NOT_FOUND',
          message: `Box ${box_id} not found`
        }
      });
    }

    const box = boxes[0];

    // Generate label content (text format matching desktop app)
    const labelContent = generateLabelText(box);

    // Generate print job ID
    const jobId = `PRINT-${Date.now()}`;

    // Log print job (in production, this would queue the job to a printer service)
    console.log(`📄 Print job queued for box ${box_id}:`, {
      job_id: jobId,
      box_id: box.box_id,
      store: box.store,
      asn: box.asn_no,
      transfer_order: box.transfer_order,
      copies,
      printer_id: printer_id || 'default',
      label_content: labelContent.substring(0, 100) + '...' // Log first 100 chars
    });

    // TODO: In production, implement actual printing:
    // 1. Send to configured printer (via printer driver, CUPS, or network print protocol)
    // 2. Queue print job if printer is unavailable
    // 3. Support different printer types (thermal, laser, etc.)
    // 4. Generate PDF/image if needed for print service
    // 
    // Example implementation:
    // if (printer_id) {
    //   await sendToPrinter(printer_id, labelContent, copies);
    // } else {
    //   await sendToDefaultPrinter(labelContent, copies);
    // }

    // Return success response
    res.json({
      success: true,
      ok: true,
      message: 'Print job queued successfully',
      job_id: jobId,
      box_id: box.box_id
    });

  } catch (error) {
    console.error('Failed to print box label:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to print box label',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * Generate label text content matching desktop app format
 * Format matches the desktop PrintService.PrintSortBoxLabel output
 */
function generateLabelText(box) {
  const createdDate = box.created_on 
    ? new Date(box.created_on).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(',', '')
    : new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(',', '');

  return `
SORT BOX / TRANSFER CARTON

Box ID: ${box.box_id}
Store: ${box.store}
Status: ${box.status}

ASN: ${box.asn_no}
TO: ${box.transfer_order}

CONTENTS:
(No contents)

Created: ${createdDate}

[BARCODE - Code128: ${box.box_id}]
${box.box_id}
`.trim();
}

