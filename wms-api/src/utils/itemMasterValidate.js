/**
 * Validates item codes against tabItem (Item master).
 * Stock and ERP sync assume every moving SKU exists in master; without this, ledger rows exist but tabItem is never updated.
 */

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string[]} itemCodes
 * @returns {Promise<string[]>} Codes not present in tabItem (trimmed, deduped)
 */
export async function findMissingItemCodesInMaster(connection, itemCodes) {
  const codes = [
    ...new Set(
      (itemCodes || [])
        .map((c) => (c != null ? String(c).trim() : ""))
        .filter(Boolean)
    ),
  ];
  if (codes.length === 0) return [];

  const [tables] = await connection.execute(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabItem'`
  );
  if (!tables.length) return [];

  const [cols] = await connection.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabItem' AND COLUMN_NAME = 'code'`
  );
  if (!cols.length) return [];

  const placeholders = codes.map(() => "?").join(",");
  const [rows] = await connection.execute(
    `SELECT code FROM tabItem WHERE LOWER(code) IN (${placeholders})`,
    codes.map((c) => c.toLowerCase())
  );
  const foundLower = new Set(rows.map((r) => String(r.code).toLowerCase()));
  return codes.filter((c) => !foundLower.has(c.toLowerCase()));
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string[]} itemCodes
 * @param {string} [contextLabel] optional, appended to error message
 * @throws {Error & { code: string, missing_item_codes: string[] }}
 */
export async function assertItemsInMasterOrThrow(
  connection,
  itemCodes,
  contextLabel = ""
) {
  const missing = await findMissingItemCodesInMaster(connection, itemCodes);
  if (missing.length === 0) return;
  const suffix = contextLabel ? ` (${contextLabel})` : "";
  const msg =
    missing.length === 1
      ? `Item "${missing[0]}" is not in Item master (tabItem)${suffix}`
      : `Item code(s) not in Item master (tabItem)${suffix}: ${missing.join(", ")}`;
  const err = new Error(msg);
  err.code = "ITEM_NOT_IN_MASTER";
  err.missing_item_codes = missing;
  throw err;
}
