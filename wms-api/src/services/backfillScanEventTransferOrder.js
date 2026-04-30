/**
 * Backfill tabWmsScanEvent.transfer_order for SORT_TO_BOX rows from tabSortBox + tabTransferOrder,
 * so updateTransferOrderQuantities SUM() matches canonical tabTransferOrder.title.
 */

const SORT_TO_BOX = 'SORT_TO_BOX';

/** Phase A: ASN + box + TO item line (store from event or sort box). Fixes blank/wrong transfer_order. */
function sqlPhaseAJoin() {
  return `
    FROM tabWmsScanEvent e
    INNER JOIN tabSortBox b
      ON b.box_id = e.box_id
      AND b.advance_shipping_notice IS NOT NULL
      AND TRIM(b.advance_shipping_notice) <> ''
    INNER JOIN tabTransferOrderItem ti
      ON ti.item_code = e.item_code
      AND ti.store = COALESCE(
        NULLIF(TRIM(COALESCE(e.store, '')), ''),
        NULLIF(TRIM(COALESCE(b.store, '')), '')
      )
    INNER JOIN tabTransferOrder t
      ON t.title = ti.parent_title
      AND t.advance_shipping_notice = b.advance_shipping_notice
  `;
}

function sqlPhaseAWhere() {
  return `
    WHERE e.event_type = '${SORT_TO_BOX}'
      AND e.box_id IS NOT NULL
      AND e.item_code IS NOT NULL
      AND TRIM(e.item_code) <> ''
      AND (
        e.transfer_order IS NULL
        OR TRIM(COALESCE(e.transfer_order, '')) = ''
        OR TRIM(e.transfer_order) <> t.title
      )
  `;
}

/** Phase B: rows still missing transfer_order — one TO per ASN via MIN(title). */
function sqlPhaseBJoin() {
  return `
    FROM tabWmsScanEvent e
    INNER JOIN tabSortBox b
      ON b.box_id = e.box_id
      AND b.advance_shipping_notice IS NOT NULL
      AND TRIM(b.advance_shipping_notice) <> ''
    INNER JOIN (
      SELECT advance_shipping_notice, MIN(title) AS title
      FROM tabTransferOrder
      GROUP BY advance_shipping_notice
    ) pick ON pick.advance_shipping_notice = b.advance_shipping_notice
  `;
}

function sqlPhaseBWhere() {
  return `
    WHERE e.event_type = '${SORT_TO_BOX}'
      AND e.box_id IS NOT NULL
      AND (
        e.transfer_order IS NULL
        OR TRIM(COALESCE(e.transfer_order, '')) = ''
      )
  `;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ dryRun?: boolean }} options
 */
export async function backfillSortToBoxTransferOrder(connection, options = {}) {
  const dryRun = options.dryRun !== false;

  const [hasCol] = await connection.execute(
    `
    SELECT 1 AS ok
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabWmsScanEvent'
      AND COLUMN_NAME = 'transfer_order'
    LIMIT 1
  `
  );

  if (!hasCol.length) {
    return {
      ok: false,
      supported: false,
      reason: 'NO_TRANSFER_ORDER_COLUMN',
      dryRun,
    };
  }

  const joinA = sqlPhaseAJoin();
  const whereA = sqlPhaseAWhere();
  const joinB = sqlPhaseBJoin();
  const whereB = sqlPhaseBWhere();

  const [countA] = await connection.execute(
    `SELECT COUNT(*) AS c ${joinA} ${whereA}`
  );
  const [countB] = await connection.execute(
    `SELECT COUNT(*) AS c ${joinB} ${whereB}`
  );

  const phaseA_candidates = Number(countA[0]?.c) || 0;
  const phaseB_candidates = Number(countB[0]?.c) || 0;

  if (dryRun) {
    return {
      ok: true,
      supported: true,
      dryRun: true,
      phaseA_candidates,
      phaseB_candidates,
      message:
        'Dry run: no rows updated. Pass apply (API) or --apply (CLI) to execute.',
    };
  }

  await connection.beginTransaction();
  try {
    const [updA] = await connection.execute(
      `
      UPDATE tabWmsScanEvent e
      INNER JOIN tabSortBox b
        ON b.box_id = e.box_id
        AND b.advance_shipping_notice IS NOT NULL
        AND TRIM(b.advance_shipping_notice) <> ''
      INNER JOIN tabTransferOrderItem ti
        ON ti.item_code = e.item_code
        AND ti.store = COALESCE(
          NULLIF(TRIM(COALESCE(e.store, '')), ''),
          NULLIF(TRIM(COALESCE(b.store, '')), '')
        )
      INNER JOIN tabTransferOrder t
        ON t.title = ti.parent_title
        AND t.advance_shipping_notice = b.advance_shipping_notice
      SET e.transfer_order = t.title
      ${whereA.trim()}
    `
    );

    const [updB] = await connection.execute(
      `
      UPDATE tabWmsScanEvent e
      INNER JOIN tabSortBox b
        ON b.box_id = e.box_id
        AND b.advance_shipping_notice IS NOT NULL
        AND TRIM(b.advance_shipping_notice) <> ''
      INNER JOIN (
        SELECT advance_shipping_notice, MIN(title) AS title
        FROM tabTransferOrder
        GROUP BY advance_shipping_notice
      ) pick ON pick.advance_shipping_notice = b.advance_shipping_notice
      SET e.transfer_order = pick.title
      ${whereB.trim()}
    `
    );

    await connection.commit();

    const updatedPhaseA = updA.affectedRows ?? 0;
    const updatedPhaseB = updB.affectedRows ?? 0;

    return {
      ok: true,
      supported: true,
      dryRun: false,
      phaseA_candidates,
      phaseB_candidates,
      updated_phase_a: updatedPhaseA,
      updated_phase_b: updatedPhaseB,
      updated_total: updatedPhaseA + updatedPhaseB,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  }
}
