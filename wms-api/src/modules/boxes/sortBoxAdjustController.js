// POST /api/sort-box/adjust — set net sorted qty for asn + box + carton + item.
// Writes delta as additional tabWmsScanEvent rows with event_type = 'SORT_TO_BOX' and signed qty
// (e.g. new_qty 0 vs old 1 → insert qty = -1). All rollups use SUM(qty) so net matches mobile.

import { getConnection } from '../../db/connection.js';
import { updateTransferOrderQuantities } from '../transfer-orders/updateTransferOrderQuantities.js';
import {
  getEventAsnColumn,
  getSortedQtyForAsnStoreItem,
  getProcessedQtyPutaway,
  lockAndFetchShippedQtyForAsnCartonItem,
  insertSortToBoxEvent,
  resolveTransferOrderRef,
} from './sortBoxScanController.js';

function reject(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

async function getCurrentQtyBoxLine(
  connection,
  asnCol,
  asn,
  boxId,
  cartonId,
  itemCode
) {
  const [rows] = await connection.execute(
    `
    SELECT COALESCE(SUM(qty), 0) AS q
    FROM tabWmsScanEvent
    WHERE event_type = 'SORT_TO_BOX'
      AND box_id = ?
      AND carton_id = ?
      AND item_code = ?
      AND ${asnCol} = ?
  `,
    [boxId, cartonId, itemCode, asn]
  );
  return Number(rows[0]?.q) || 0;
}

async function lookupToTitle(connection, asn) {
  const [toRows] = await connection.execute(
    `SELECT title FROM tabTransferOrder WHERE advance_shipping_notice = ? LIMIT 1`,
    [asn]
  );
  return toRows.length ? String(toRows[0].title).trim() : '';
}

/**
 * POST /api/sort-box/adjust
 * Body: { asn_no, box_id, carton_id, item_code, new_qty, user_id, device_id? }
 */
export const sortBoxAdjust = async (req, res) => {
  const {
    asn_no,
    box_id,
    carton_id,
    item_code,
    new_qty: newQtyRaw,
    user_id,
    device_id,
  } = req.body || {};

  const asn = asn_no != null ? String(asn_no).trim() : '';
  const boxId = box_id != null ? String(box_id).trim() : '';
  const cartonId = carton_id != null ? String(carton_id).trim() : '';
  const itemCode = item_code != null ? String(item_code).trim() : '';
  const userId = user_id != null ? String(user_id).trim() : '';
  const newQty = Number(newQtyRaw);

  if (!asn || !boxId || !cartonId || !itemCode || !userId) {
    return res.status(400).json(
      reject(
        'VALIDATION_ERROR',
        'asn_no, box_id, carton_id, item_code, and user_id are required',
        {}
      )
    );
  }
  if (!Number.isFinite(newQty) || newQty < 0) {
    return res.status(400).json(
      reject('VALIDATION_ERROR', 'new_qty must be a finite number >= 0', {})
    );
  }

  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const [boxRows] = await connection.execute(
      `
      SELECT *
      FROM tabSortBox
      WHERE box_id = ?
        AND advance_shipping_notice = ?
      FOR UPDATE
    `,
      [boxId, asn]
    );

    if (!boxRows.length) {
      await connection.rollback();
      return res.status(404).json(
        reject('BOX_NOT_FOUND', `Sort box ${boxId} not found for ASN ${asn}`, {})
      );
    }

    const box = boxRows[0];
    const boxPurpose = String(box.purpose || 'STORE')
      .trim()
      .toUpperCase();
    if (boxPurpose !== 'STORE' && boxPurpose !== 'PUTAWAY') {
      await connection.rollback();
      return res.status(400).json(
        reject(
          'UNSUPPORTED_BOX_PURPOSE',
          `Adjust is only supported for STORE or PUTAWAY boxes (got "${boxPurpose}")`,
          {}
        )
      );
    }

    const boxStore = String(box.store || '').trim();
    if (!boxStore) {
      await connection.rollback();
      return res.status(400).json(
        reject('BOX_STORE_MISSING', 'Sort box has no store code', {})
      );
    }

    const [wh] = await connection.execute(
      `SELECT code FROM tabWarehouse WHERE code = ? LIMIT 1`,
      [boxStore]
    );
    if (!wh.length) {
      await connection.rollback();
      return res.status(400).json(
        reject(
          'STORE_NOT_IN_WAREHOUSE_MASTER',
          `Box store "${boxStore}" is not a valid warehouse master code`,
          {}
        )
      );
    }

    const asnCol = await getEventAsnColumn(connection);
    const currentQty = await getCurrentQtyBoxLine(
      connection,
      asnCol,
      asn,
      boxId,
      cartonId,
      itemCode
    );
    const delta = newQty - currentQty;

    const toTitle = await lookupToTitle(connection, asn);
    const transferOrderRef = resolveTransferOrderRef(box, toTitle);

    if (delta < 0) {
      if (currentQty + delta < 0) {
        await connection.rollback();
        return res.status(400).json(
          reject(
            'ADJUST_EXCEEDS_SORTED',
            `Cannot reduce below 0 for this box/carton/item (current ${currentQty}, requested ${newQty})`,
            { current_qty: currentQty, new_qty: newQty }
          )
        );
      }

      const ts = Date.now();
      const rnd = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
      const offlineUuid = `ADJ-${ts}-${rnd}`;

      await insertSortToBoxEvent(connection, {
        offline_uuid: offlineUuid,
        user_id: userId,
        device_id: device_id != null ? String(device_id).trim() : null,
        asn_no: asn,
        transfer_order: transferOrderRef,
        carton_id: cartonId,
        item_code: itemCode,
        qty: delta,
        store: boxStore,
        box_id: boxId,
        purpose: boxPurpose,
        notes: `Mobile SORT_TO_BOX adjust (delta ${delta})`,
      });
    } else if (delta > 0) {
      if (boxPurpose === 'STORE') {
        if (!toTitle) {
          await connection.rollback();
          return res.status(400).json(
            reject(
              'TRANSFER_ORDER_NOT_FOUND',
              `No transfer order found for ASN ${asn}`,
              {}
            )
          );
        }

        const [allocRows] = await connection.execute(
          `
          SELECT allocated_qty
          FROM tabTransferOrderItem
          WHERE parent_title = ?
            AND store = ?
            AND item_code = ?
          FOR UPDATE
        `,
          [toTitle, boxStore, itemCode]
        );

        if (!allocRows.length) {
          await connection.rollback();
          return res.status(400).json(
            reject(
              'ITEM_NOT_IN_TRANSFER_ORDER',
              `Item ${itemCode} is not allocated to store ${boxStore} on transfer order for this ASN`,
              { allocated_qty: 0 }
            )
          );
        }

        const allocatedQty = Number(allocRows[0].allocated_qty) || 0;
        const sortedStoreBefore = await getSortedQtyForAsnStoreItem(
          connection,
          asn,
          boxStore,
          itemCode
        );
        const pendingStoreBefore = Math.max(0, allocatedQty - sortedStoreBefore);

        if (sortedStoreBefore + delta > allocatedQty) {
          await connection.rollback();
          return res.status(409).json(
            reject(
              'TO_QTY_EXCEEDED',
              `Item ${itemCode} cannot increase by ${delta} for store ${boxStore} (allocation limit).`,
              {
                allocated_qty: allocatedQty,
                sorted_qty: sortedStoreBefore,
                pending_qty: pendingStoreBefore,
              }
            )
          );
        }
      } else {
        const { shipped_qty: shippedQty, line_count: asnLineCount } =
          await lockAndFetchShippedQtyForAsnCartonItem(
            connection,
            asn,
            cartonId,
            itemCode
          );

        if (asnLineCount === 0) {
          await connection.rollback();
          return res.status(400).json(
            reject(
              'ASN_CARTON_ITEM_NOT_FOUND',
              `No ASN line for carton ${cartonId} and item ${itemCode} on ${asn}`,
              { shipped_qty: 0, processed_qty: null, pending_qty: null }
            )
          );
        }

        const processedBefore = await getProcessedQtyPutaway(
          connection,
          asnCol,
          asn,
          cartonId,
          itemCode
        );
        const pendingCartonBefore = Math.max(0, shippedQty - processedBefore);

        if (processedBefore + delta > shippedQty) {
          await connection.rollback();
          return res.status(409).json(
            reject(
              'CARTON_QTY_EXCEEDED',
              `Item ${itemCode} cannot increase by ${delta} for carton ${cartonId} (shipped limit).`,
              {
                shipped_qty: shippedQty,
                processed_qty: processedBefore,
                pending_qty: pendingCartonBefore,
              }
            )
          );
        }
      }

      const ts = Date.now();
      const rnd = Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0');
      const offlineUuid = `ADJ-${ts}-${rnd}`;

      await insertSortToBoxEvent(connection, {
        offline_uuid: offlineUuid,
        user_id: userId,
        device_id: device_id != null ? String(device_id).trim() : null,
        asn_no: asn,
        transfer_order: transferOrderRef,
        carton_id: cartonId,
        item_code: itemCode,
        qty: delta,
        store: boxStore,
        box_id: boxId,
        purpose: boxPurpose,
        notes: `Mobile SORT_TO_BOX adjust (+${delta})`,
      });
    }

    if (transferOrderRef) {
      await updateTransferOrderQuantities(transferOrderRef, connection);
    }

    const sortedLineAfter = await getCurrentQtyBoxLine(
      connection,
      asnCol,
      asn,
      boxId,
      cartonId,
      itemCode
    );

    let pendingQty;
    if (boxPurpose === 'STORE') {
      if (!toTitle) {
        pendingQty = null;
      } else {
        const [allocRows2] = await connection.execute(
          `
          SELECT allocated_qty
          FROM tabTransferOrderItem
          WHERE parent_title = ?
            AND store = ?
            AND item_code = ?
        `,
          [toTitle, boxStore, itemCode]
        );
        const allocatedQty2 =
          allocRows2.length > 0 ? Number(allocRows2[0].allocated_qty) || 0 : 0;
        const sortedStoreAfter = await getSortedQtyForAsnStoreItem(
          connection,
          asn,
          boxStore,
          itemCode
        );
        pendingQty = Math.max(0, allocatedQty2 - sortedStoreAfter);
      }
    } else {
      const { shipped_qty: shippedQty2 } =
        await lockAndFetchShippedQtyForAsnCartonItem(
          connection,
          asn,
          cartonId,
          itemCode
        );
      const processedAfter = await getProcessedQtyPutaway(
        connection,
        asnCol,
        asn,
        cartonId,
        itemCode
      );
      pendingQty = Math.max(0, shippedQty2 - processedAfter);
    }

    await connection.commit();

    return res.json({
      ok: true,
      data: {
        box_id: boxId,
        carton_id: cartonId,
        item_code: itemCode,
        old_qty: currentQty,
        new_qty: newQty,
        delta_qty: delta,
        sorted_qty: sortedLineAfter,
        pending_qty: pendingQty,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error('sortBoxAdjust error:', err);
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'Sort box adjust failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  } finally {
    connection.release();
  }
};
