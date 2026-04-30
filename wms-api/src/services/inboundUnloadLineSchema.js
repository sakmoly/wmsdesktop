/**
 * Schema helpers for tabInboundUnloadLine (unique index + optional device_id).
 */

export async function ensureUnloadLineUniqueIndex(connection) {
  try {
    await connection.execute(`
      CREATE UNIQUE INDEX uq_unload_parent_type_unit
      ON tabInboundUnloadLine (parent_title, unit_type, unit_id)
    `);
  } catch (e) {
    if (e.code === 'ER_DUP_KEYNAME' || e.errno === 1061) return;
    if (String(e.message || '').includes('Duplicate key name')) return;
    if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) return;
  }
}

export async function ensureUnloadLineDeviceIdColumn(connection) {
  try {
    await connection.execute(`
      ALTER TABLE tabInboundUnloadLine
      ADD COLUMN device_id VARCHAR(200) NULL COMMENT 'Handset / scanner id for unload'
    `);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060) return;
    if (String(e.message || '').includes('Duplicate column name')) return;
  }
}

/**
 * Which optional columns exist on tabInboundUnloadLine (for SELECT / INSERT).
 * @param {string} [selectQualifier] - SQL table alias for SELECT lists, e.g. 'ul' when joining tabInboundSession (both can have device_id).
 */
export async function getUnloadLineOptionalMeta(connection, selectQualifier = '') {
  const [cols] = await connection.execute(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabInboundUnloadLine'
      AND COLUMN_NAME IN ('session_jti', 'device_id')
    ORDER BY COLUMN_NAME
  `);
  const set = new Set(cols.map((r) => r.COLUMN_NAME));
  const q = selectQualifier ? `${selectQualifier}.` : '';
  const extras = [];
  if (set.has('device_id')) extras.push(`${q}device_id`);
  if (set.has('session_jti')) extras.push(`${q}session_jti`);
  return {
    hasSessionJti: set.has('session_jti'),
    hasDeviceId: set.has('device_id'),
    selectSuffix: extras.length ? `, ${extras.join(', ')}` : '',
  };
}
