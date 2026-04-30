// POST /api/sort-box/scan — atomic SORT_TO_BOX: STORE (TO allocation) or PUTAWAY (ASN carton shipped qty).

import { getConnection } from '../../db/connection.js';
import { updateTransferOrderQuantities } from '../transfer-orders/updateTransferOrderQuantities.js';

/**
 * Prefer ASN-resolved TO title so tabWmsScanEvent.transfer_order matches
 * tabTransferOrder.title (rollup in updateTransferOrderQuantities).
 * tabSortBox.transfer_order is only a fallback when ASN has no TO row.
 */
export function resolveTransferOrderRef(box, fallbackToTitle) {
  const fromAsn =
    fallbackToTitle != null && String(fallbackToTitle).trim() !== ''
      ? String(fallbackToTitle).trim()
      : '';
  if (fromAsn) return fromAsn;
  if (box.transfer_order != null && String(box.transfer_order).trim() !== '') {
    return String(box.transfer_order).trim();
  }
  return '';
}

function reject(code, message, extra = {}) {
  return { ok: false, code, message, ...extra };
}

export async function getEventAsnColumn(connection) {
  const [rows] = await connection.execute(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabWmsScanEvent'
      AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice')
  `
  );
  const s = new Set(rows.map((r) => r.COLUMN_NAME));
  if (s.has('asn_no')) return 'asn_no';
  return 'advance_shipping_notice';
}

/**
 * Sum SORT_TO_BOX qty for ASN + store + item (STORE flow — all boxes for that store on this ASN).
 */
export async function getSortedQtyForAsnStoreItem(connection, asnNo, store, itemCode) {
  const [rows] = await connection.execute(
    `
    SELECT COALESCE(SUM(e.qty), 0) AS sorted_qty
    FROM tabWmsScanEvent e
    INNER JOIN tabSortBox b ON b.box_id = e.box_id
    WHERE e.event_type = 'SORT_TO_BOX'
      AND e.item_code = ?
      AND b.advance_shipping_notice = ?
      AND b.store = ?
  `,
    [itemCode, asnNo, store]
  );
  return Number(rows[0]?.sorted_qty) || 0;
}

/**
 * PUTAWAY: total SORT_TO_BOX qty for ASN + carton + item (all boxes).
 */
export async function getProcessedQtyPutaway(connection, asnCol, asnNo, cartonId, itemCode) {
  const [rows] = await connection.execute(
    `
    SELECT COALESCE(SUM(qty), 0) AS processed_qty
    FROM tabWmsScanEvent
    WHERE event_type = 'SORT_TO_BOX'
      AND ${asnCol} = ?
      AND carton_id = ?
      AND item_code = ?
  `,
    [asnNo, cartonId, itemCode]
  );
  return Number(rows[0]?.processed_qty) || 0;
}

async function getAsnItemParentColumn(connection) {
  const [pc] = await connection.execute(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabAsnItemDetails'
      AND COLUMN_NAME IN ('parent_title', 'parent')
  `
  );
  const names = new Set(pc.map((r) => r.COLUMN_NAME));
  if (names.has('parent_title')) return 'parent_title';
  if (names.has('parent')) return 'parent';
  return 'parent_title';
}

/** Lock ASN carton/item lines, then shipped sum (PUTAWAY concurrency). */
export async function lockAndFetchShippedQtyForAsnCartonItem(
  connection,
  asn,
  cartonId,
  itemCode
) {
  const parentCol = await getAsnItemParentColumn(connection);
  await connection.execute(
    `
    SELECT shipped_qty
    FROM tabAsnItemDetails
    WHERE ${parentCol} = ?
      AND carton_id = ?
      AND item_code = ?
    FOR UPDATE
  `,
    [asn, cartonId, itemCode]
  );
  const [rows] = await connection.execute(
    `
    SELECT COALESCE(SUM(shipped_qty), 0) AS shipped_qty,
           COUNT(*) AS line_count
    FROM tabAsnItemDetails
    WHERE ${parentCol} = ?
      AND carton_id = ?
      AND item_code = ?
  `,
    [asn, cartonId, itemCode]
  );
  return {
    shipped_qty: Number(rows[0]?.shipped_qty) || 0,
    line_count: Number(rows[0]?.line_count) || 0,
  };
}

export async function insertSortToBoxEvent(connection, row) {
  const {
    offline_uuid,
    user_id,
    device_id,
    asn_no,
    transfer_order,
    carton_id,
    item_code,
    qty,
    store,
    box_id,
    purpose,
    notes: notesOverride,
  } = row;

  const [colRows] = await connection.execute(
    `
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabWmsScanEvent'
  `
  );
  const colSet = new Set(colRows.map((c) => c.COLUMN_NAME));
  const fields = [];
  const values = [];
  const add = (name, val) => {
    if (!colSet.has(name)) return;
    fields.push(name);
    values.push(val);
  };

  add('offline_uuid', offline_uuid);
  add('event_type', 'SORT_TO_BOX');
  add('event_time', new Date());
  if (device_id) add('device_id', device_id);
  add('user_id', user_id);
  add('source_type', 'ASN');
  if (colSet.has('asn_no')) {
    add('asn_no', asn_no);
  } else if (colSet.has('advance_shipping_notice')) {
    add('advance_shipping_notice', asn_no);
  }
  if (colSet.has('transfer_order')) {
    add('transfer_order', transfer_order != null ? String(transfer_order) : '');
  }
  add('carton_id', carton_id || null);
  add('item_code', item_code);
  add('qty', qty);
  add('store', store);
  add('box_id', box_id);
  if (colSet.has('warehouse')) add('warehouse', store);
  const noteText =
    notesOverride != null && String(notesOverride).trim() !== ''
      ? String(notesOverride).trim()
      : `Mobile SORT_TO_BOX scan (${purpose || 'STORE'})`;
  add('notes', noteText);

  if (fields.length === 0) {
    throw new Error('tabWmsScanEvent has no insertable columns');
  }

  const sql = `INSERT INTO tabWmsScanEvent (${fields.join(
    ', '
  )}) VALUES (${fields.map(() => '?').join(', ')})`;
  await connection.execute(sql, values);
}

/**
 * POST /api/sort-box/scan
 * Body: { purpose: "STORE"|"PUTAWAY", asn_no, box_id, carton_id, item_code, qty, user_id, device_id? }
 */
export const sortBoxScan = async (req, res) => {
  const {
    purpose: purposeRaw,
    asn_no,
    box_id,
    carton_id,
    item_code,
    qty: qtyRaw,
    user_id,
    device_id,
  } = req.body || {};

  const purpose = String(purposeRaw || 'STORE')
    .trim()
    .toUpperCase();
  const asn = asn_no != null ? String(asn_no).trim() : '';
  const boxId = box_id != null ? String(box_id).trim() : '';
  const cartonId = carton_id != null ? String(carton_id).trim() : '';
  const itemCode = item_code != null ? String(item_code).trim() : '';
  const userId = user_id != null ? String(user_id).trim() : '';
  const qty = Number(qtyRaw);

  if (purpose !== 'STORE' && purpose !== 'PUTAWAY') {
    return res.status(400).json(
      reject('VALIDATION_ERROR', 'purpose must be "STORE" or "PUTAWAY"', {})
    );
  }

  if (!asn || !boxId || !cartonId || !itemCode || !userId) {
    return res.status(400).json(
      reject(
        'VALIDATION_ERROR',
        'asn_no, box_id, carton_id, item_code, and user_id are required',
        {}
      )
    );
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json(
      reject('VALIDATION_ERROR', 'qty must be a positive number', {})
    );
  }

  const connection = await getConnection();
  try {
    const { findMissingItemCodesInMaster } = await import('../../utils/itemMasterValidate.js');
    const missSort = await findMissingItemCodesInMaster(connection, [itemCode]);
    if (missSort.length > 0) {
      return res.status(400).json(
        reject(
          'ITEM_NOT_IN_MASTER',
          `Item code(s) not in Item master (tabItem): ${missSort.join(', ')}`,
          { missing_item_codes: missSort }
        )
      );
    }

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
    if (boxPurpose !== purpose) {
      await connection.rollback();
      return res.status(400).json(
        reject(
          'PURPOSE_MISMATCH',
          `Box purpose is "${boxPurpose}" but request purpose is "${purpose}"`,
          { box_purpose: boxPurpose, request_purpose: purpose }
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
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const offlineUuid = `SORT-${timestamp}-${random}`;

    if (purpose === 'STORE') {
      const [toRows] = await connection.execute(
        `SELECT title FROM tabTransferOrder WHERE advance_shipping_notice = ? LIMIT 1`,
        [asn]
      );
      if (!toRows.length) {
        await connection.rollback();
        return res.status(400).json(
          reject(
            'TRANSFER_ORDER_NOT_FOUND',
            `No transfer order found for ASN ${asn}`,
            {}
          )
        );
      }
      const toTitle = toRows[0].title;

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
      const sortedBefore = await getSortedQtyForAsnStoreItem(
        connection,
        asn,
        boxStore,
        itemCode
      );
      const pendingBefore = Math.max(0, allocatedQty - sortedBefore);

      if (sortedBefore + qty > allocatedQty) {
        await connection.rollback();
        return res.status(409).json(
          reject(
            'TO_QTY_EXCEEDED',
            `Item ${itemCode} already fully sorted for store ${boxStore}.`,
            {
              allocated_qty: allocatedQty,
              sorted_qty: sortedBefore,
              pending_qty: pendingBefore,
            }
          )
        );
      }

      await insertSortToBoxEvent(connection, {
        offline_uuid: offlineUuid,
        user_id: userId,
        device_id: device_id != null ? String(device_id).trim() : null,
        asn_no: asn,
        transfer_order: resolveTransferOrderRef(box, toTitle),
        carton_id: cartonId,
        item_code: itemCode,
        qty,
        store: boxStore,
        box_id: boxId,
        purpose: 'STORE',
      });

      const toRef = resolveTransferOrderRef(box, toTitle);
      if (toRef) {
        await updateTransferOrderQuantities(toRef, connection);
      }

      const sortedAfter = sortedBefore + qty;
      const pendingAfter = Math.max(0, allocatedQty - sortedAfter);

      await connection.commit();

      return res.json({
        ok: true,
        data: {
          accepted: true,
          purpose: 'STORE',
          offline_uuid: offlineUuid,
          box_id: boxId,
          asn_no: asn,
          carton_id: cartonId,
          store: boxStore,
          item_code: itemCode,
          scan_qty: qty,
          allocated_qty: allocatedQty,
          sorted_qty: sortedAfter,
          pending_qty: pendingAfter,
        },
      });
    }

    // purpose === 'PUTAWAY'
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
    const pendingBefore = Math.max(0, shippedQty - processedBefore);

    if (processedBefore + qty > shippedQty) {
      await connection.rollback();
      return res.status(409).json(
        reject(
          'CARTON_QTY_EXCEEDED',
          `Item ${itemCode} already fully processed for carton ${cartonId}.`,
          {
            shipped_qty: shippedQty,
            processed_qty: processedBefore,
            pending_qty: pendingBefore,
          }
        )
      );
    }

    const [toLookup] = await connection.execute(
      `SELECT title FROM tabTransferOrder WHERE advance_shipping_notice = ? LIMIT 1`,
      [asn]
    );
    const toTitle = toLookup.length > 0 ? toLookup[0].title : '';

    await insertSortToBoxEvent(connection, {
      offline_uuid: offlineUuid,
      user_id: userId,
      device_id: device_id != null ? String(device_id).trim() : null,
      asn_no: asn,
      transfer_order: resolveTransferOrderRef(box, toTitle),
      carton_id: cartonId,
      item_code: itemCode,
      qty,
      store: boxStore,
      box_id: boxId,
      purpose: 'PUTAWAY',
    });

    const toRefPutaway = resolveTransferOrderRef(box, toTitle);
    if (toRefPutaway) {
      await updateTransferOrderQuantities(toRefPutaway, connection);
    }

    const processedAfter = processedBefore + qty;
    const pendingAfter = Math.max(0, shippedQty - processedAfter);

    await connection.commit();

    return res.json({
      ok: true,
      data: {
        accepted: true,
        purpose: 'PUTAWAY',
        offline_uuid: offlineUuid,
        box_id: boxId,
        asn_no: asn,
        carton_id: cartonId,
        store: boxStore,
        item_code: itemCode,
        scan_qty: qty,
        shipped_qty: shippedQty,
        processed_qty: processedAfter,
        pending_qty: pendingAfter,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error('sortBoxScan error:', err);
    return res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: 'Sort scan failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  } finally {
    connection.release();
  }
};
