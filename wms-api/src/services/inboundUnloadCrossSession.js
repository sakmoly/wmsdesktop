// Cross-session unload duplicate detection (ASN / Transfer In scope).

import { getUnloadLineOptionalMeta } from './inboundUnloadLineSchema.js';

/** When false, only (parent_title, unit_type, unit_id) duplicate is enforced per session. Default: on. */
export function globalAsnUnloadDedupeEnabled() {
  const v = process.env.WMS_INBOUND_UNLOAD_ASN_GLOBAL_DEDUPE;
  if (v === undefined || v === null || v === '') return true;
  return !(v === '0' || v === 'false' || v === 'no');
}

/**
 * If another session for the same ASN (or same Transfer In) already unloaded this unit, return that unload row.
 */
export async function findCrossSessionUnloadDuplicate(
  connection,
  sessionIdColumn,
  currentParentTitle,
  unitType,
  unitId
) {
  if (!globalAsnUnloadDedupeEnabled()) return null;

  const [sessCols] = await connection.execute(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabInboundSession'
      AND COLUMN_NAME IN ('asn_no', 'advance_shipping_notice', 'transfer_in')
  `);
  const have = new Set(sessCols.map((r) => r.COLUMN_NAME));

  const selectBits = [];
  if (have.has('asn_no')) selectBits.push('asn_no');
  if (have.has('advance_shipping_notice')) selectBits.push('advance_shipping_notice');
  if (have.has('transfer_in')) selectBits.push('transfer_in');
  if (selectBits.length === 0) return null;

  const [curRows] = await connection.execute(
    `SELECT ${selectBits.join(', ')} FROM tabInboundSession WHERE ${sessionIdColumn} = ? LIMIT 1`,
    [currentParentTitle]
  );
  if (!curRows.length) return null;

  const cur = curRows[0];
  const asnKey = have.has('asn_no') && cur.asn_no ? String(cur.asn_no).trim() : '';
  const asnLegacy =
    have.has('advance_shipping_notice') && cur.advance_shipping_notice
      ? String(cur.advance_shipping_notice).trim()
      : '';
  const tiKey = have.has('transfer_in') && cur.transfer_in ? String(cur.transfer_in).trim() : '';

  const docAsn = asnKey || asnLegacy;
  if (!docAsn && !tiKey) return null;

  const ulMeta = await getUnloadLineOptionalMeta(connection, 'ul');
  const ulSelect = `ul.id, ul.parent_title, ul.unit_type, ul.unit_id, ul.scanned_by, ul.scanned_on, ul.created_at, ul.updated_at${ulMeta.selectSuffix}`;

  if (docAsn) {
    const ors = [];
    const params = [unitType, unitId, currentParentTitle];
    if (have.has('asn_no')) {
      ors.push('(s.asn_no IS NOT NULL AND s.asn_no = ?)');
      params.push(docAsn);
    }
    if (have.has('advance_shipping_notice')) {
      ors.push('(s.advance_shipping_notice IS NOT NULL AND s.advance_shipping_notice = ?)');
      params.push(docAsn);
    }
    if (!ors.length) return null;
    const sql = `
      SELECT ${ulSelect}
      FROM tabInboundUnloadLine ul
      INNER JOIN tabInboundSession s ON s.${sessionIdColumn} = ul.parent_title
      WHERE ul.unit_type = ?
        AND ul.unit_id = ?
        AND ul.parent_title <> ?
        AND (${ors.join(' OR ')})
      LIMIT 1`;
    const [rows] = await connection.execute(sql, params);
    return rows.length
      ? { row: rows[0], sourceDoc: docAsn, sourceKind: 'ASN' }
      : null;
  }

  if (tiKey) {
    const [rows] = await connection.execute(
      `
      SELECT ${ulSelect}
      FROM tabInboundUnloadLine ul
      INNER JOIN tabInboundSession s ON s.${sessionIdColumn} = ul.parent_title
      WHERE ul.unit_type = ?
        AND ul.unit_id = ?
        AND ul.parent_title <> ?
        AND s.transfer_in IS NOT NULL
        AND s.transfer_in = ?
      LIMIT 1`,
      [unitType, unitId, currentParentTitle, tiKey]
    );
    return rows.length
      ? { row: rows[0], sourceDoc: tiKey, sourceKind: 'TransferIn' }
      : null;
  }

  return null;
}
