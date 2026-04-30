// wms-api/src/modules/transfer-cartons/transferCartonController.js
// Transfer carton operations

import { logger } from "../../utils/logger.js";

import { getConnection } from "../../db/connection.js";
import { postStock } from "../stock-ledger/stockPostingService.js";

/**
 * Item codes for a transfer carton in a Material Request (same heuristics as seal;
 * for reopen, third fallback uses status = 'Sealed' so lines can be reverted after seal).
 * @param {'seal'|'reopen'} [mode] — default "seal"
 * @returns {Promise<Array<{ item_code: string }>>}
 */
async function getMaterialRequestItemCodesForTransferCarton(
  connection,
  tc_id,
  materialRequest,
  mode = "seal"
) {
  const isReopen = mode === "reopen";
  const lineStatusFilter = isReopen
    ? "AND status = 'Sealed'"
    : "AND status != 'Sealed'";

  if (isReopen) {
    const [anyByTc] = await connection.execute(
      `
      SELECT DISTINCT item_code
      FROM tabWmsScanEvent
      WHERE tc_id = ?
        AND item_code IS NOT NULL
        AND item_code != ''
    `,
      [tc_id]
    );
    if (anyByTc.length > 0) {
      return anyByTc;
    }
  }

  const [itemsByTC] = await connection.execute(
    `
    SELECT DISTINCT item_code
    FROM tabWmsScanEvent
    WHERE tc_id = ?
      AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC', 'SORT_TO_BOX')
      AND item_code IS NOT NULL
  `,
    [tc_id]
  );

  if (itemsByTC.length > 0) {
    return itemsByTC;
  }

  const [tcInfo] = await connection.execute(
    `
    SELECT created_on, sealed_on
    FROM tabTransferCarton
    WHERE tc_id = ?
  `,
    [tc_id]
  );

  if (tcInfo.length === 0) {
    return [];
  }

  const tcCreatedOn = tcInfo[0].created_on;
  const tcSealedOn = tcInfo[0].sealed_on || new Date();

  const [itemsByMR] = await connection.execute(
    `
    SELECT DISTINCT item_code
    FROM tabWmsScanEvent
    WHERE transfer_order = ?
      AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC', 'SORT_TO_BOX')
      AND item_code IS NOT NULL
      AND event_time >= DATE_SUB(?, INTERVAL 1 HOUR)
      AND event_time <= DATE_ADD(?, INTERVAL 1 HOUR)
  `,
    [materialRequest, tcCreatedOn, tcSealedOn]
  );

  if (itemsByMR.length > 0) {
    return itemsByMR;
  }

  const [fullyPickedItems] = await connection.execute(
    `
    SELECT item_code
    FROM tabMaterialRequestItem
    WHERE parent_title = ?
      AND picked_qty >= requested_qty
      AND requested_qty > 0
      ${lineStatusFilter}
  `,
    [materialRequest]
  );

  return fullyPickedItems;
}

/**
 * GET /api/transfer-cartons
 * Get transfer cartons with optional filtering by ASN, store, and transfer order
 *
 * Query Parameters:
 * - ?asn=ASN-0001 (optional) - Filter by ASN number
 * - ?store=STORE-001 (optional) - Filter by store
 * - ?material_request=MR-123460 (optional) - Filter by Material Request number (alias for to_no)
 * - ?to_no=MR-123460 (optional) - Filter by Transfer Order number (or Material Request)
 *
 * Examples:
 * GET /api/transfer-cartons?asn=ASN-0002&store=WAREHOUSE
 * GET /api/transfer-cartons?material_request=MR-123460&store=STORE-002
 * GET /api/transfer-cartons?to_no=MR-123460&store=STORE-002
 */
export const getTransferCartons = async (req, res) => {
  const { asn, store, material_request, to_no } = req.query;

  const connection = await getConnection();

  try {
    // Detect schema by querying table structure directly
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));

    // Determine ASN column (prefer asn_no, fallback to advance_shipping_notice)
    let asnColumn;
    if (allColumns.has("asn_no")) {
      asnColumn = "asn_no";
    } else if (allColumns.has("advance_shipping_notice")) {
      asnColumn = "advance_shipping_notice";
    } else {
      throw new Error(
        "Cannot find ASN column (asn_no or advance_shipping_notice) in tabTransferCarton"
      );
    }

    // Determine TO column (prefer to_no, fallback to transfer_order)
    let toColumn;
    if (allColumns.has("to_no")) {
      toColumn = "to_no";
    } else if (allColumns.has("transfer_order")) {
      toColumn = "transfer_order";
    } else {
      throw new Error(
        "Cannot find TO column (to_no or transfer_order) in tabTransferCarton"
      );
    }

    // Optional ERP linkage columns (desktop writes these on PR/SE sync).
    const purchaseReceiptColumn = allColumns.has("purchase_receipt_no")
      ? "purchase_receipt_no"
      : allColumns.has("purchase_receipt")
      ? "purchase_receipt"
      : null;
    const stockEntryColumn = allColumns.has("warehouse_transfer_no")
      ? "warehouse_transfer_no"
      : allColumns.has("stock_entry_no")
      ? "stock_entry_no"
      : allColumns.has("stock_entry")
      ? "stock_entry"
      : null;

    // Build WHERE clause based on query parameters
    const whereConditions = [];
    const queryParams = [];

    if (asn) {
      whereConditions.push(`${asnColumn} = ?`);
      queryParams.push(asn);
    }

    if (store) {
      whereConditions.push("store = ?");
      queryParams.push(store);
    }

    // Support material_request query parameter (alias for to_no when filtering Material Requests)
    // Use material_request if provided, otherwise use to_no
    const transferOrderFilter = material_request || to_no;
    if (transferOrderFilter) {
      whereConditions.push(`${toColumn} = ?`);
      queryParams.push(transferOrderFilter);
    }

    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    // Build SELECT query with detected column names
    const selectSQL = `
      SELECT 
        tc_id,
        status,
        ${asnColumn} as asn_no,
        ${toColumn} as to_no,
        store,
        created_by,
        created_on,
        sealed_by,
        sealed_on,
        dispatched_on,
        updated_on,
        ${purchaseReceiptColumn ? `${purchaseReceiptColumn}` : "NULL"} as purchase_receipt,
        ${stockEntryColumn ? `${stockEntryColumn}` : "NULL"} as stock_entry,
        remarks
      FROM tabTransferCarton
      ${whereClause}
      ORDER BY created_on DESC, tc_id
    `;

    const [rows] = await connection.execute(selectSQL, queryParams);

    // Map results to consistent format
    const transferCartons = rows.map((row) => ({
      tc_id: row.tc_id,
      status: row.status,
      asn_no: row.asn_no,
      to_no: row.to_no,
      store: row.store,
      created_by: row.created_by || null,
      created_on: row.created_on ? row.created_on.toISOString() : null,
      sealed_by: row.sealed_by || null,
      sealed_on: row.sealed_on ? row.sealed_on.toISOString() : null,
      dispatched_on: row.dispatched_on ? row.dispatched_on.toISOString() : null,
      updated_on: row.updated_on ? row.updated_on.toISOString() : null,
      purchase_receipt: row.purchase_receipt || null,
      stock_entry: row.stock_entry || null,
      remarks: row.remarks || null,
    }));

    res.json({
      ok: true,
      data: transferCartons,
      count: transferCartons.length,
    });
  } catch (error) {
    console.error("Failed to fetch transfer cartons:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to fetch transfer cartons",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-cartons/create
 * Create transfer cartons
 *
 * Request Body - Regular Transfer Order (Mobile App Format):
 * {
 *   "tc_id": "TC-001-001",
 *   "asn_no": "ASN-0001",
 *   "to_no": "TO-0001",
 *   "store": "STORE-001",
 *   "user_id": "USER-001"
 * }
 *
 * Request Body - Material Request Transfer Carton (Mobile App Format):
 * {
 *   "tc_id": "TC-MR-0001-1234567890",
 *   "asn_no": null,                    // Must be null for Material Requests
 *   "to_no": "MR-0001",                // Material Request number
 *   "store": "SHOWROOM-001",
 *   "user_id": "USER-003",
 *   "material_request": "MR-0001"      // Optional, for reference
 * }
 *
 * OR (Desktop App Format):
 * {
 *   "tc_id": "TC-001-001",
 *   "advance_shipping_notice": "ASN-0001",
 *   "transfer_order": "TO-0001",
 *   "store": "STORE-001",
 *   "created_by": "USER-001"
 * }
 *
 * Material Request Format (Desktop):
 * {
 *   "tc_id": "TC-MR-0001-1234567890",
 *   "advance_shipping_notice": null,   // Must be null for Material Requests
 *   "transfer_order": "MR-0001",       // Material Request number
 *   "store": "SHOWROOM-001",
 *   "created_by": "USER-003"
 * }
 */
export const createTransferCarton = async (req, res) => {
  // Accept both mobile and desktop app field names
  const {
    tc_id,
    advance_shipping_notice,
    asn_no, // Mobile app format
    transfer_order,
    to_no, // Mobile app format
    store,
    created_by,
    user_id, // Mobile app format
    material_request, // Optional field for Material Request reference
  } = req.body;

  // Normalize field names (prefer mobile app format, fallback to desktop)
  const normalizedASN = asn_no !== undefined ? asn_no : advance_shipping_notice;
  const normalizedTO = to_no || transfer_order;
  const normalizedCreatedBy = user_id || created_by;

  // Basic validation
  if (!tc_id || !store || !normalizedCreatedBy) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "tc_id, store, and user_id (or created_by) are required",
      },
    });
  }

  // Check if this is a Material Request transfer carton
  const isMaterialRequest =
    material_request ||
    (normalizedTO &&
      (normalizedTO.startsWith("MR-") || normalizedTO.match(/^MR-\d+$/i)));

  // Validation for Material Request Transfer Cartons
  if (isMaterialRequest) {
    // For Material Requests: ASN must be null, TO must be Material Request number
    if (
      normalizedASN !== null &&
      normalizedASN !== undefined &&
      normalizedASN !== ""
    ) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "advance_shipping_notice (asn_no) must be null for Material Request transfer cartons",
        },
      });
    }

    if (!normalizedTO || !normalizedTO.match(/^MR-\d+$/i)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "transfer_order (to_no) must be a valid Material Request number (format: MR-XXXX) for Material Request transfer cartons",
        },
      });
    }
  } else {
    // For regular Transfer Orders: TO is required
    if (!normalizedTO) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "to_no (or transfer_order) is required for transfer cartons",
        },
      });
    }
  }

  const connection = await getConnection();

  try {
    // Detect schema by querying table structure directly (more reliable)
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));

    // Determine ASN column (prefer asn_no, fallback to advance_shipping_notice)
    let asnColumn;
    if (allColumns.has("asn_no")) {
      asnColumn = "asn_no";
    } else if (allColumns.has("advance_shipping_notice")) {
      asnColumn = "advance_shipping_notice";
    } else {
      throw new Error(
        "Cannot find ASN column (asn_no or advance_shipping_notice) in tabTransferCarton. Available columns: " +
          Array.from(allColumns).join(", ")
      );
    }

    // Determine TO column (prefer to_no, fallback to transfer_order)
    let toColumn;
    if (allColumns.has("to_no")) {
      toColumn = "to_no";
    } else if (allColumns.has("transfer_order")) {
      toColumn = "transfer_order";
    } else {
      throw new Error(
        "Cannot find TO column (to_no or transfer_order) in tabTransferCarton. Available columns: " +
          Array.from(allColumns).join(", ")
      );
    }

    console.log(
      `Transfer Carton schema detected: ASN column=${asnColumn}, TO column=${toColumn}`
    );

    // Check if ASN column is nullable
    const [asnColumnInfo] = await connection.execute(
      `
      SELECT IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabTransferCarton' 
      AND COLUMN_NAME = ?
    `,
      [asnColumn]
    );

    const asnColumnNullable =
      asnColumnInfo.length > 0 && asnColumnInfo[0].IS_NULLABLE === "YES";

    // For Material Requests, ASN must be null (already validated above)
    // For regular Transfer Orders, use the provided ASN value (could be null/undefined if column is nullable)
    const finalASN = isMaterialRequest ? null : normalizedASN;

    // Insert transfer carton using detected column names
    const insertSQL = `
      INSERT INTO tabTransferCarton 
        (tc_id, status, ${asnColumn}, ${toColumn}, store, created_by, created_on)
      VALUES (?, 'Created', ?, ?, ?, ?, NOW())
    `;

    await connection.execute(insertSQL, [
      tc_id,
      finalASN,
      normalizedTO,
      store,
      normalizedCreatedBy,
    ]);

    res.json({
      ok: true,
      message: "Transfer carton created successfully",
      data: {
        tc_id,
        status: "Created",
      },
    });
  } catch (error) {
    console.error("Failed to create transfer carton:", error);

    // Handle duplicate key error
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        ok: false,
        error: {
          code: "DUPLICATE_ENTRY",
          message: `Transfer carton ${tc_id} already exists`,
        },
      });
    }

    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to create transfer carton",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-cartons/seal
 * Seal transfer cartons
 *
 * Request Body:
 * {
 *   "tc_id": "TC-001-001",
 *   "sealed_by": "USER-001"
 * }
 */
export const sealTransferCarton = async (req, res) => {
  const { tc_id, sealed_by } = req.body;

  // Validation
  if (!tc_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "tc_id is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    // Get transfer carton details to check if it's a Material Request
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));

    let toColumn;
    if (allColumns.has("to_no")) {
      toColumn = "to_no";
    } else if (allColumns.has("transfer_order")) {
      toColumn = "transfer_order";
    }

    // Get transfer carton to check for Material Request
    const [tcRows] = await connection.execute(
      `
      SELECT ${toColumn || "transfer_order"} as transfer_order
      FROM tabTransferCarton
      WHERE tc_id = ?
    `,
      [tc_id]
    );

    if (tcRows.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "TRANSFER_CARTON_NOT_FOUND",
          message: `Transfer carton ${tc_id} not found`,
        },
      });
    }

    const transferOrder = tcRows[0].transfer_order;
    const isMaterialRequest =
      transferOrder &&
      (transferOrder.startsWith("MR-") || transferOrder.match(/^MR-\d+$/i));

    // Update transfer carton status to Sealed
    const [result] = await connection.execute(
      `
      UPDATE tabTransferCarton 
      SET status = 'Sealed',
          sealed_by = ?,
          sealed_on = NOW(),
          updated_on = NOW()
      WHERE tc_id = ?
    `,
      [sealed_by || null, tc_id]
    );

    // Update Material Request status when transfer carton is sealed
    // Status "Picked" should only be set when ALL items are fully picked AND ALL transfer cartons are sealed
    if (isMaterialRequest) {
      const materialRequest = transferOrder;

      const cartonItems = await getMaterialRequestItemCodesForTransferCarton(
        connection,
        tc_id,
        materialRequest
      );
      if (cartonItems.length > 0) {
        console.log(
          `📦 Resolved ${cartonItems.length} item(s) for Material Request / transfer carton ${tc_id}`
        );
      }

      // Update status of Material Request items in this sealed transfer carton to "Sealed"
      if (cartonItems.length > 0) {
        const itemCodes = cartonItems.map((item) => item.item_code);
        const placeholders = itemCodes.map(() => "?").join(",");

        const [updateResult] = await connection.execute(
          `
          UPDATE tabMaterialRequestItem
          SET status = 'Sealed',
              updated_at = NOW()
          WHERE parent_title = ?
            AND item_code IN (${placeholders})
            AND status != 'Sealed'
        `,
          [materialRequest, ...itemCodes]
        );

        console.log(
          `✅ Updated ${updateResult.affectedRows} Material Request item(s) to "Sealed" status for transfer carton ${tc_id}`
        );
      } else {
        console.warn(
          `⚠️  No items found for transfer carton ${tc_id}. Items may not be updated to "Sealed" status.`
        );
      }

      // Check if all items are fully picked
      const [itemStatus] = await connection.execute(
        `
        SELECT 
          COUNT(*) as total_items,
          SUM(CASE WHEN picked_qty >= requested_qty AND requested_qty > 0 THEN 1 ELSE 0 END) as fully_picked_items,
          SUM(CASE WHEN picked_qty > 0 THEN 1 ELSE 0 END) as partially_picked_items
        FROM tabMaterialRequestItem
        WHERE parent_title = ?
      `,
        [materialRequest]
      );

      const totalItems = itemStatus[0].total_items || 0;
      const fullyPickedItems = itemStatus[0].fully_picked_items || 0;
      const partiallyPickedItems = itemStatus[0].partially_picked_items || 0;

      // Check if all transfer cartons for this Material Request are sealed
      const [tcStatus] = await connection.execute(
        `
        SELECT 
          COUNT(*) as total_tcs,
          SUM(CASE WHEN status = 'Sealed' OR status = 'Dispatched' THEN 1 ELSE 0 END) as sealed_tcs
        FROM tabTransferCarton
        WHERE ${toColumn || "transfer_order"} = ?
      `,
        [materialRequest]
      );

      const totalTCs = tcStatus[0].total_tcs || 0;
      const sealedTCs = tcStatus[0].sealed_tcs || 0;

      // Get current Material Request status
      const [mrStatus] = await connection.execute(
        `
        SELECT status
        FROM tabMaterialRequest
        WHERE title = ?
      `,
        [materialRequest]
      );

      if (mrStatus.length > 0) {
        const currentStatus = mrStatus[0].status;
        let newStatus = currentStatus;

        // Status "Picked" only when ALL items are fully picked AND ALL transfer cartons are sealed
        if (
          fullyPickedItems === totalItems &&
          totalItems > 0 &&
          sealedTCs === totalTCs &&
          totalTCs > 0
        ) {
          // All items are fully picked AND all transfer cartons are sealed
          newStatus = "Picked";
        } else if (partiallyPickedItems > 0 && currentStatus === "Submitted") {
          // Some items are picked, but not all (or not all sealed)
          newStatus = "In Progress";
        }
        // If all items are picked but not all sealed, keep status as "In Progress"
        // If some items are picked but not all, keep status as "In Progress"

        // Update status if it changed
        if (newStatus !== currentStatus) {
          await connection.execute(
            `
            UPDATE tabMaterialRequest
            SET status = ?,
                updated_at = NOW()
            WHERE title = ?
          `,
            [newStatus, materialRequest]
          );

          console.log(
            `✅ Updated Material Request ${materialRequest} status from "${currentStatus}" to "${newStatus}" after sealing transfer carton ${tc_id} (${fullyPickedItems}/${totalItems} items picked, ${sealedTCs}/${totalTCs} TCs sealed)`
          );
        } else {
          console.log(
            `ℹ️  Transfer carton ${tc_id} sealed for Material Request ${materialRequest}. Status remains "${currentStatus}" (${fullyPickedItems}/${totalItems} items fully picked, ${sealedTCs}/${totalTCs} TCs sealed).`
          );
        }
      }
    }

    res.json({
      ok: true,
      message: "Transfer carton sealed successfully",
    });
  } catch (error) {
    console.error("Failed to seal transfer carton:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to seal transfer carton",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-cartons/reopen
 * Unseal: status Sealed → Open. Dispatched (or Completed) is not allowed.
 *
 * Request body:
 * { "tc_id", "reopened_by", "reason" (optional) }
 */
export const reopenTransferCarton = async (req, res) => {
  const { tc_id, reopened_by, reason } = req.body;

  if (!tc_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "tc_id is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));

    let toColumn;
    if (allColumns.has("to_no")) {
      toColumn = "to_no";
    } else if (allColumns.has("transfer_order")) {
      toColumn = "transfer_order";
    }

    const [tcRows] = await connection.execute(
      `
      SELECT ${
        toColumn || "transfer_order"
      } as transfer_order, status, sealed_by, sealed_on
      FROM tabTransferCarton
      WHERE tc_id = ?
    `,
      [tc_id]
    );

    if (tcRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "TRANSFER_CARTON_NOT_FOUND",
          message: `Transfer carton ${tc_id} not found`,
        },
      });
    }

    const transferOrder = tcRows[0].transfer_order;
    const tcStatus = tcRows[0].status;
    const isMaterialRequest =
      transferOrder &&
      (transferOrder.startsWith("MR-") || transferOrder.match(/^MR-\d+$/i));

    if (tcStatus === "Dispatched") {
      return res.status(409).json({
        ok: false,
        error: {
          code: "TRANSFER_CARTON_CANNOT_REOPEN",
          message:
            "Cannot reopen a transfer carton that has been dispatched.",
        },
      });
    }

    if (tcStatus === "Completed") {
      return res.status(409).json({
        ok: false,
        error: {
          code: "TRANSFER_CARTON_CANNOT_REOPEN",
          message:
            "Cannot reopen a transfer carton in Completed status.",
        },
      });
    }

    if (tcStatus !== "Sealed") {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_STATUS_FOR_REOPEN",
          message: `Only Sealed transfer cartons can be reopened. Current status: ${tcStatus}`,
        },
      });
    }

    const setClauses = [
      "status = 'Open'",
      "sealed_by = NULL",
      "sealed_on = NULL",
      "updated_on = NOW()",
    ];
    const updateParams = [];

    if (allColumns.has("reopened_by")) {
      setClauses.push("reopened_by = ?");
      updateParams.push(reopened_by ?? null);
    }
    if (allColumns.has("reopened_on")) {
      setClauses.push("reopened_on = NOW()");
    }
    if (allColumns.has("reopen_reason")) {
      setClauses.push("reopen_reason = ?");
      updateParams.push(reason ?? null);
    }

    updateParams.push(tc_id);

    const [result] = await connection.execute(
      `
      UPDATE tabTransferCarton
      SET ${setClauses.join(", ")}
      WHERE tc_id = ?
        AND status = 'Sealed'
    `,
      updateParams
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({
        ok: false,
        error: {
          code: "REOPEN_CONFLICT",
          message:
            "Transfer carton was not Sealed (it may have changed). Retry after refresh.",
        },
      });
    }

    // Material Request: reverse line "Sealed" and refresh MR header (aligned with seal / dispatch)
    if (isMaterialRequest) {
      const materialRequest = transferOrder;
      const cartonItems = await getMaterialRequestItemCodesForTransferCarton(
        connection,
        tc_id,
        materialRequest,
        "reopen"
      );

      if (cartonItems.length > 0) {
        const itemCodes = cartonItems.map((item) => item.item_code);
        const placeholders = itemCodes.map(() => "?").join(",");

        const [revertResult] = await connection.execute(
          `
          UPDATE tabMaterialRequestItem
          SET status = CASE
            WHEN picked_qty >= requested_qty AND requested_qty > 0 THEN 'Picked'
            ELSE 'In Progress'
          END,
              updated_at = NOW()
          WHERE parent_title = ?
            AND item_code IN (${placeholders})
            AND status = 'Sealed'
        `,
          [materialRequest, ...itemCodes]
        );

        console.log(
          `↩️ Reopen ${tc_id}: reverted ${revertResult.affectedRows} Material Request line(s) from Sealed`
        );
      } else {
        console.warn(
          `⚠️  Reopen ${tc_id}: no MR line items resolved to revert (scan/MR heuristics).`
        );
      }

      const [itemStatus] = await connection.execute(
        `
        SELECT
          COUNT(*) as total_items,
          SUM(CASE WHEN picked_qty >= requested_qty AND requested_qty > 0 THEN 1 ELSE 0 END) as fully_picked_items,
          SUM(CASE WHEN picked_qty > 0 THEN 1 ELSE 0 END) as partially_picked_items
        FROM tabMaterialRequestItem
        WHERE parent_title = ?
      `,
        [materialRequest]
      );

      const totalItems = itemStatus[0].total_items || 0;
      const fullyPickedItems = itemStatus[0].fully_picked_items || 0;
      const partiallyPickedItems = itemStatus[0].partially_picked_items || 0;

      const [tcStatusCounts] = await connection.execute(
        `
        SELECT
          COUNT(*) as total_tcs,
          SUM(CASE WHEN status = 'Sealed' OR status = 'Dispatched' THEN 1 ELSE 0 END) as sealed_tcs
        FROM tabTransferCarton
        WHERE ${toColumn || "transfer_order"} = ?
      `,
        [materialRequest]
      );

      const totalTCs = tcStatusCounts[0].total_tcs || 0;
      const sealedTCs = tcStatusCounts[0].sealed_tcs || 0;

      const [mrStatus] = await connection.execute(
        `
        SELECT status
        FROM tabMaterialRequest
        WHERE title = ?
      `,
        [materialRequest]
      );

      if (mrStatus.length > 0) {
        const currentStatus = mrStatus[0].status;
        let newStatus = currentStatus;

        if (
          fullyPickedItems === totalItems &&
          totalItems > 0 &&
          sealedTCs === totalTCs &&
          totalTCs > 0
        ) {
          newStatus = "Picked";
        } else if (currentStatus === "Picked" && sealedTCs < totalTCs) {
          newStatus = "In Progress";
        } else if (partiallyPickedItems > 0 && currentStatus === "Submitted") {
          newStatus = "In Progress";
        }

        if (newStatus !== currentStatus) {
          await connection.execute(
            `
            UPDATE tabMaterialRequest
            SET status = ?,
                updated_at = NOW()
            WHERE title = ?
          `,
            [newStatus, materialRequest]
          );

          console.log(
            `✅ Material Request ${materialRequest}: "${currentStatus}" → "${newStatus}" after reopening ${tc_id}`
          );
        }
      }
    }

    return res.json({
      ok: true,
      message: "Transfer carton reopened (unsealed) successfully",
      data: {
        tc_id,
        status: "Open",
        reopened_by: reopened_by ?? null,
        reason: reason ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to reopen transfer carton:", error);
    return res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to reopen transfer carton",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-cartons/dispatch
 * Dispatch transfer cartons
 *
 * Request Body:
 * {
 *   "tc_id": "TC-001-001",
 *   "dispatched_by": "USER-001"
 * }
 */
export const dispatchTransferCarton = async (req, res) => {
  const { tc_id, dispatched_by } = req.body;

  // Validation
  if (!tc_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "tc_id is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Get transfer carton details to check if it's a Material Request
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));

    let toColumn;
    if (allColumns.has("to_no")) {
      toColumn = "to_no";
    } else if (allColumns.has("transfer_order")) {
      toColumn = "transfer_order";
    }

    // Get transfer carton to check for Material Request
    const [tcRows] = await connection.execute(
      `
      SELECT ${
        toColumn || "transfer_order"
      } as transfer_order, status, store, created_on
      FROM tabTransferCarton
      WHERE tc_id = ?
    `,
      [tc_id]
    );

    if (tcRows.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "TRANSFER_CARTON_NOT_FOUND",
          message: `Transfer carton ${tc_id} not found`,
        },
      });
    }

    const transferOrder = tcRows[0].transfer_order;
    const tcStatus = tcRows[0].status;
    const isMaterialRequest =
      transferOrder &&
      (transferOrder.startsWith("MR-") || transferOrder.match(/^MR-\d+$/i));

    // Only allow dispatching Sealed transfer cartons
    if (tcStatus !== "Sealed") {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Transfer carton must be Sealed before dispatch. Current status: ${tcStatus}`,
        },
      });
    }

    // Update transfer carton status to Dispatched
    const [result] = await connection.execute(
      `
      UPDATE tabTransferCarton 
      SET status = 'Dispatched',
          dispatched_by = ?,
          dispatched_on = NOW(),
          updated_on = NOW()
      WHERE tc_id = ?
    `,
      [dispatched_by || null, tc_id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "TRANSFER_CARTON_NOT_FOUND",
          message: `Transfer carton ${tc_id} not found`,
        },
      });
    }

    // Get item codes from packing events for this Transfer Carton
    // This is needed for stock posting regardless of whether it's a Material Request or not
    const [eventItems] = await connection.execute(
      `
      SELECT DISTINCT item_code
      FROM tabWmsScanEvent
      WHERE tc_id = ?
        AND event_type IN ('PACK_ITEM_TO_TC', 'PACK_BOX_TO_TC')
        AND item_code IS NOT NULL
        AND item_code != ''
      `,
      [tc_id]
    );
    
    const itemCodes = eventItems.map(row => row.item_code).filter(Boolean);
    console.log(`📦 Dispatch: Found ${itemCodes.length} unique item(s) in transfer carton ${tc_id}`);
    
    // Get warehouse from transfer carton or Material Request
    // Note: tabWmsScanEvent doesn't have a warehouse column
    let warehouse = null;
    if (itemCodes.length > 0) {
      // For Material Request transfer cartons, get warehouse from Material Request
      if (isMaterialRequest && transferOrder) {
        const [mrRows] = await connection.execute(
          `SELECT from_warehouse FROM tabMaterialRequest WHERE title = ?`,
          [transferOrder]
        );
        if (mrRows.length > 0 && mrRows[0].from_warehouse) {
          warehouse = mrRows[0].from_warehouse;
        }
      }
      
      // Fallback: get warehouse from transfer carton store
      if (!warehouse && tcRows[0].store) {
        warehouse = tcRows[0].store;
      }
      
      // Final fallback: use default warehouse
      if (!warehouse) {
        const [defaultWarehouse] = await connection.execute(
          `SELECT code FROM tabWarehouse WHERE warehouse_type = 'Warehouse' ORDER BY code LIMIT 1`
        );
        warehouse = defaultWarehouse.length > 0 ? defaultWarehouse[0].code : 'WH-MAIN';
      }
      
      console.log(`📦 Dispatch: Using warehouse: ${warehouse} for transfer carton ${tc_id}`);
    }

    // For Material Request transfer cartons, DO NOT reduce stock when dispatched
    // Stock was already reduced during picking (POST /api/material-requests/:title/pick-items)
    // Dispatch is just a status change to indicate the carton was physically sent out
    // Reducing stock again would cause DOUBLE REDUCTION
    // 
    // NOTE: Stock reduction for Material Requests happens during picking, not dispatch
    // This is different from regular Transfer Orders where stock is reduced during dispatch
    if (false && isMaterialRequest) { // DISABLED: Stock already reduced during picking
      const materialRequest = transferOrder;

      // Get Material Request details
      const [mrRows] = await connection.execute(
        `
        SELECT title, from_warehouse, to_showroom
        FROM tabMaterialRequest
        WHERE title = ?
      `,
        [materialRequest]
      );

      if (mrRows.length > 0) {
        const materialRequestData = mrRows[0];
        const warehouse = materialRequestData.from_warehouse;

        // Get items from transfer carton with source bins
        // Try to get items from events with source location information
        const [eventColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabWmsScanEvent' 
          AND COLUMN_NAME IN ('rack', 'bin', 'location_id', 'source_bin')
        `);
        const eventColumnNames = new Set(
          eventColumns.map((row) => row.COLUMN_NAME)
        );
        const hasRack = eventColumnNames.has("rack");
        const hasBin = eventColumnNames.has("bin");
        const hasLocationId = eventColumnNames.has("location_id");
        const hasSourceBin = eventColumnNames.has("source_bin");

        // Build query to get items with source bins
        // Note: If rack and bin contain the same value (full location), use just 'bin' to avoid duplication
        let sourceBinExpr = "NULL as source_bin";
        if (hasSourceBin) {
          sourceBinExpr = "source_bin";
        } else if (hasLocationId) {
          sourceBinExpr = "location_id";
        } else if (hasRack && hasBin) {
          // Use just 'bin' as it often contains the full location (rack and bin are the same)
          sourceBinExpr = "bin";
        } else if (hasRack) {
          sourceBinExpr = "rack";
        } else if (hasBin) {
          sourceBinExpr = "bin";
        }

        // Get items from transfer carton with quantities and source bins
        // Use time window around TC creation time (events might not have tc_id)
        const tcCreatedOn = tcRows[0].created_on;
        const startTime = new Date(tcCreatedOn);
        startTime.setHours(startTime.getHours() - 6); // Look back 6 hours
        const endTime = new Date();

        // Get items from events - need to get each item with its source bin
        // Group by item_code and source_bin to handle cases where same item comes from different bins
        const [cartonItemsByBin] = await connection.execute(
          `
          SELECT 
            item_code,
            ${sourceBinExpr} as source_bin,
            SUM(qty) as total_qty
          FROM tabWmsScanEvent
          WHERE (tc_id = ? OR (transfer_order = ? AND event_time >= ? AND event_time <= ?))
            AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
            AND item_code IS NOT NULL
            AND qty > 0
          GROUP BY item_code, ${sourceBinExpr.replace(" as source_bin", "")}
        `,
          [tc_id, materialRequest, startTime, endTime]
        );

        console.log(
          `📦 Dispatch: Found ${cartonItemsByBin.length} item-bin combination(s) in transfer carton ${tc_id} for Material Request ${materialRequest}`
        );

        // Collect all item codes for stock posting
        const itemCodes = [...new Set(cartonItemsByBin.map(item => item.item_code).filter(Boolean))];
        
        // For each item-bin combination, reduce stock from source bin
        for (const item of cartonItemsByBin) {
          const itemCode = item.item_code;
          const qty = parseFloat(item.total_qty) || 0;
          let sourceBin = item.source_bin;

          // If source_bin is not available from events, try to get it from Material Request picking events
          if (!sourceBin) {
            // Look for source bin from earlier picking events
            const sourceBinCol = sourceBinExpr.replace(" as source_bin", "");
            const [pickingEvents] = await connection.execute(
              `
              SELECT ${sourceBinExpr} as source_bin
              FROM tabWmsScanEvent
              WHERE transfer_order = ?
                AND item_code = ?
                AND event_type IN ('PICK_ITEM', 'SORT_TO_BOX', 'PACK_BOX_TO_TC')
                AND event_time <= ?
                AND ${sourceBinCol} IS NOT NULL
              ORDER BY event_time DESC
              LIMIT 1
            `,
              [materialRequest, itemCode, endTime]
            );

            if (pickingEvents.length > 0) {
              sourceBin = pickingEvents[0].source_bin;
            }
          }

          if (sourceBin && qty > 0) {
            // Check if carton_id column exists in tabStockLedger
            const [stockLedgerCartonIdColumn] = await connection.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = 'tabStockLedger' 
              AND COLUMN_NAME = 'carton_id'
            `);
            const hasStockLedgerCartonIdColumn =
              stockLedgerCartonIdColumn.length > 0;

            // Get current stock from source bin (including carton_id if available)
            let stockQuery = `
              SELECT qty, reserved_qty
            `;
            if (hasStockLedgerCartonIdColumn) {
              stockQuery += `, carton_id`;
            }
            stockQuery += `
              FROM tabStockLedger
              WHERE item_code = ?
                AND warehouse = ?
                AND bin_location = ?
            `;

            const [currentStock] = await connection.execute(stockQuery, [
              itemCode,
              warehouse,
              sourceBin,
            ]);

            const currentQty =
              currentStock.length > 0
                ? parseFloat(currentStock[0].qty) || 0
                : 0;
            const currentReservedQty =
              currentStock.length > 0
                ? parseFloat(currentStock[0].reserved_qty) || 0
                : 0;
            const cartonId =
              hasStockLedgerCartonIdColumn && currentStock.length > 0
                ? currentStock[0].carton_id || null
                : null;

            if (currentQty >= qty) {
              const newQty = currentQty - qty;
              const qtyBefore = currentQty;
              const qtyReduced = -qty; // Negative for reduction

              // Build stock ledger update query with optional carton_id
              let insertFields = `item_code, warehouse, bin_location, qty, reserved_qty, qty_before, qty_reduced, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at`;
              let insertValues = `?, ?, ?, ?, ?, ?, ?, NOW(), 'Dispatch', ?, NOW(), NOW()`;
              let insertParams = [
                itemCode,
                warehouse,
                sourceBin,
                newQty,
                currentReservedQty,
                qtyBefore,
                qtyReduced,
                tc_id,
              ];

              let updateFields = `qty = ?, qty_before = ?, qty_reduced = ?, last_transaction_date = NOW(), last_transaction_type = 'Dispatch', last_transaction_ref = ?, updated_at = NOW()`;
              let updateParams = [newQty, qtyBefore, qtyReduced, tc_id];

              // Include carton_id if column exists
              if (hasStockLedgerCartonIdColumn && cartonId) {
                insertFields += `, carton_id`;
                insertValues += `, ?`;
                insertParams.push(cartonId);
                updateFields += `, carton_id = ?`;
                updateParams.push(cartonId);
              }

              // Update stock ledger (decrease from source bin)
              // NOTE: tabStockLedger has UNIQUE KEY on (item_code, warehouse, bin_location)
              // This means it will UPDATE the existing record for that bin, not create a new one
              // This is CORRECT - tabStockLedger shows CURRENT stock at each bin
              // Transaction history is stored in tabStockTransaction table
              await connection.execute(
                `
                INSERT INTO tabStockLedger 
                  (${insertFields})
                VALUES (${insertValues})
                ON DUPLICATE KEY UPDATE
                  ${updateFields}
              `,
                [...insertParams, ...updateParams]
              );
              
              // ALWAYS create a transaction log entry (for history/audit trail)
              await connection.execute(`
                INSERT INTO tabStockTransaction 
                  (transaction_date, transaction_type, reference_doc_type, reference_doc,
                   item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                   source_bin, target_bin, performed_by, created_at)
                VALUES 
                  (NOW(), 'Dispatch', 'Transfer Carton', ?,
                   ?, ?, ?, ?, ?, ?,
                   ?, NULL, ?, NOW())
              `, [
                tc_id,
                itemCode,
                warehouse,
                sourceBin,
                qtyReduced, // qty_change (negative for dispatch)
                qtyBefore, // qty_before
                newQty, // qty_after
                sourceBin, // source_bin
                dispatched_by || null // performed_by
              ]);

              // Update tabCartonStock if carton_id exists and tabCartonStock table exists
              if (cartonId) {
                const [cartonStockTable] = await connection.execute(`
                  SELECT TABLE_NAME 
                  FROM INFORMATION_SCHEMA.TABLES 
                  WHERE TABLE_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'tabCartonStock'
                `);

                if (cartonStockTable.length > 0) {
                  try {
                    // Get current carton stock
                    const [currentCartonStock] = await connection.execute(
                      `SELECT qty FROM tabCartonStock 
                       WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?`,
                      [cartonId, itemCode, warehouse, sourceBin]
                    );

                    const currentCartonQty =
                      currentCartonStock.length > 0
                        ? parseFloat(currentCartonStock[0].qty) || 0
                        : 0;
                    const newCartonQty = Math.max(0, currentCartonQty - qty); // Don't go below 0

                    // Update carton stock
                    await connection.execute(
                      `
                      UPDATE tabCartonStock
                      SET qty = ?,
                          updated_at = NOW()
                      WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?
                    `,
                      [newCartonQty, cartonId, itemCode, warehouse, sourceBin]
                    );

                    console.log(
                      `[Dispatch] 📦 Updated tabCartonStock: carton_id=${cartonId}, item=${itemCode}, qty=${currentCartonQty} → ${newCartonQty}, bin=${sourceBin}`
                    );
                  } catch (cartonStockError) {
                    console.warn(
                      `[Dispatch] ⚠️ Could not update tabCartonStock: ${cartonStockError.message}`
                    );
                    // Don't fail the transaction - stock ledger is already updated
                  }
                }
              }

              // Insert stock transaction log
              // Check if carton_id column exists in tabStockTransaction
              const [stockTransactionColumns] = await connection.execute(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabStockTransaction' 
                AND COLUMN_NAME = 'carton_id'
              `);
              const hasStockTransactionCartonId =
                stockTransactionColumns.length > 0;

              if (hasStockTransactionCartonId && cartonId) {
                // Include carton_id in stock transaction log
                await connection.execute(
                  `
                  INSERT INTO tabStockTransaction 
                    (transaction_date, transaction_type, reference_doc_type, reference_doc,
                     item_code, warehouse, bin_location, carton_id, qty_change, qty_before, qty_after,
                     source_bin, target_bin, performed_by, created_at)
                  VALUES 
                    (NOW(), 'Dispatch', 'Transfer Carton', ?,
                     ?, ?, ?, ?, ?, ?, ?,
                     ?, NULL, ?, NOW())
                `,
                  [
                    tc_id,
                    itemCode,
                    warehouse,
                    sourceBin,
                    cartonId,
                    -qty, // Negative (decrease)
                    currentQty,
                    newQty,
                    sourceBin,
                    dispatched_by || null,
                  ]
                );
              } else {
                // Standard stock transaction log without carton_id
                await connection.execute(
                  `
                  INSERT INTO tabStockTransaction 
                    (transaction_date, transaction_type, reference_doc_type, reference_doc,
                     item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
                     source_bin, target_bin, performed_by, created_at)
                  VALUES 
                    (NOW(), 'Dispatch', 'Transfer Carton', ?,
                     ?, ?, ?, ?, ?, ?,
                     ?, NULL, ?, NOW())
                `,
                  [
                    tc_id,
                    itemCode,
                    warehouse,
                    sourceBin,
                    -qty, // Negative (decrease)
                    currentQty,
                    newQty,
                    sourceBin,
                    dispatched_by || null,
                  ]
                );
              }

              // Update tabItem.stock_qty
              const [stockSum] = await connection.execute(
                `
                SELECT COALESCE(SUM(qty), 0) as total_qty
                FROM tabStockLedger
                WHERE item_code = ? AND warehouse = ?
              `,
                [itemCode, warehouse]
              );

              const totalStockQty = parseFloat(stockSum[0].total_qty) || 0;

              await connection.execute(
                `
                UPDATE tabItem
                SET stock_qty = ?,
                    updated_at = NOW()
                WHERE code = ?
              `,
                [totalStockQty, itemCode]
              );

              console.log(
                `✅ Dispatched: Reduced stock for ${itemCode} at ${sourceBin}: ${currentQty} → ${newQty} (Transfer Carton: ${tc_id})`
              );
            } else {
              console.warn(
                `⚠️  Insufficient stock for ${itemCode} at ${sourceBin}. Available: ${currentQty}, Required: ${qty}`
              );
            }
          } else {
            console.warn(
              `⚠️  Cannot reduce stock for ${itemCode}: source_bin not found or qty is 0`
            );
          }
        }
      }
    }

    // Post stock updates (rebuild summaries from ledger)
    if (itemCodes && itemCodes.length > 0) {
      try {
        const postingResult = await postStock('TC_DISPATCH', tc_id, {
          itemCodes,
          warehouse: warehouse,
          postedBy: dispatched_by || null,
          connection // Use existing transaction
        });
        
        if (postingResult.posted) {
          console.log(`✅ Stock posted for Transfer Carton ${tc_id}: ${postingResult.affectedItems.length} items updated`);
        } else {
          console.log(`⏭️  Stock posting skipped for ${tc_id}: ${postingResult.reason}`);
        }
      } catch (postingError) {
        console.error(`⚠️  Stock posting failed for Transfer Carton ${tc_id}:`, postingError);
        // Don't fail the entire operation, but log the error
      }
    }

    await connection.commit();

    res.json({
      ok: true,
      message: "Transfer carton dispatched successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to dispatch transfer carton:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to dispatch transfer carton",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/transfer-cartons/:tc_id
 * Get a single transfer carton by ID with contents
 *
 * Example:
 * GET /api/transfer-cartons/TC-001-001
 */
export const getTransferCartonById = async (req, res) => {
  const { tc_id } = req.params;
  const connection = await getConnection();

  try {
    // Detect schema for tabTransferCarton
    const [tableInfo] = await connection.execute(`DESCRIBE tabTransferCarton`);
    const allColumns = new Set(tableInfo.map((row) => row.Field));

    let asnColumn;
    if (allColumns.has("asn_no")) {
      asnColumn = "asn_no";
    } else if (allColumns.has("advance_shipping_notice")) {
      asnColumn = "advance_shipping_notice";
    } else {
      throw new Error(
        "Cannot find ASN column (asn_no or advance_shipping_notice) in tabTransferCarton"
      );
    }

    let toColumn;
    if (allColumns.has("to_no")) {
      toColumn = "to_no";
    } else if (allColumns.has("transfer_order")) {
      toColumn = "transfer_order";
    } else {
      throw new Error(
        "Cannot find TO column (to_no or transfer_order) in tabTransferCarton"
      );
    }

    const purchaseReceiptColumn = allColumns.has("purchase_receipt_no")
      ? "purchase_receipt_no"
      : allColumns.has("purchase_receipt")
      ? "purchase_receipt"
      : null;
    const stockEntryColumn = allColumns.has("warehouse_transfer_no")
      ? "warehouse_transfer_no"
      : allColumns.has("stock_entry_no")
      ? "stock_entry_no"
      : allColumns.has("stock_entry")
      ? "stock_entry"
      : null;

    // Get transfer carton
    const [rows] = await connection.execute(
      `
      SELECT 
        tc_id,
        status,
        ${asnColumn} as asn_no,
        ${toColumn} as to_no,
        store,
        created_by,
        created_on,
        sealed_by,
        sealed_on,
        dispatched_on,
        updated_on,
        ${purchaseReceiptColumn ? `${purchaseReceiptColumn}` : "NULL"} as purchase_receipt,
        ${stockEntryColumn ? `${stockEntryColumn}` : "NULL"} as stock_entry,
        remarks
      FROM tabTransferCarton
      WHERE tc_id = ?
    `,
      [tc_id]
    );

    if (rows.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer carton ${tc_id} not found`,
        },
      });
    }

    const transferCarton = rows[0];

    // Get carton contents from WMS Scan Events
    // Query PACK_BOX_TO_TC events (primary method) - events created when boxes are packed into transfer carton
    let cartonContents = [];
    try {
      // First check if tc_id column exists
      const [columnCheck] = await connection.execute(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabWmsScanEvent'
        AND COLUMN_NAME = 'tc_id'
      `);

      if (columnCheck[0].count === 0) {
        console.warn(`Column 'tc_id' does not exist in tabWmsScanEvent table`);
      } else {
        const [boxColCheck] = await connection.execute(`
          SELECT COUNT(*) as count
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabWmsScanEvent'
          AND COLUMN_NAME = 'box_id'
        `);
        const hasBoxIdCol = boxColCheck[0].count > 0;

        // Count total events for this tc_id (for debugging)
        const [countResult] = await connection.execute(
          `
          SELECT COUNT(*) as total
          FROM tabWmsScanEvent
          WHERE tc_id = ?
        `,
          [tc_id]
        );
        console.log(
          `Transfer Carton ${tc_id}: Found ${countResult[0].total} total events with tc_id`
        );

        // Count PACK_BOX_TO_TC events
        const [packCountResult] = await connection.execute(
          `
          SELECT COUNT(*) as total
          FROM tabWmsScanEvent
          WHERE tc_id = ?
          AND event_type = 'PACK_BOX_TO_TC'
        `,
          [tc_id]
        );
        console.log(
          `Transfer Carton ${tc_id}: Found ${packCountResult[0].total} PACK_BOX_TO_TC events`
        );

        // Group by item_code and carton_id at SQL level to properly sum all quantities
        // CRITICAL: When the same item is scanned multiple times with the same carton_id and tc_id,
        // we need to SUM all the qty values from all events, not just use the latest value
        // Query matches user requirement: GROUP BY item_code, carton_id (without tc_id)
        // Include both PACK_BOX_TO_TC and PACK_ITEM_TO_TC event types for backward compatibility
        const sortEventsSql = hasBoxIdCol
          ? `
          SELECT 
            item_code,
            carton_id AS source_carton,
            MAX(NULLIF(TRIM(box_id), '')) AS sort_box_id,
            SUM(qty) AS quantity,
            MAX(user_id) AS packed_by,
            MAX(event_time) AS packed_on
          FROM tabWmsScanEvent
          WHERE tc_id = ?
            AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
            AND item_code IS NOT NULL
            AND item_code != ''
            AND qty > 0
          GROUP BY item_code, carton_id
          ORDER BY packed_on DESC
        `
          : `
          SELECT 
            item_code,
            carton_id AS source_carton,
            SUM(qty) AS quantity,
            MAX(user_id) AS packed_by,
            MAX(event_time) AS packed_on
          FROM tabWmsScanEvent
          WHERE tc_id = ?
            AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
            AND item_code IS NOT NULL
            AND item_code != ''
            AND qty > 0
          GROUP BY item_code, carton_id
          ORDER BY packed_on DESC
        `;
        const [sortEvents] = await connection.execute(sortEventsSql, [tc_id]);

        // Debug: Log all events to identify duplicates
        const [allEvents] = await connection.execute(
          `
          SELECT item_code, box_id, carton_id, qty, event_time, offline_uuid
          FROM tabWmsScanEvent
          WHERE tc_id = ?
            AND event_type = 'PACK_BOX_TO_TC'
            AND item_code IS NOT NULL
          ORDER BY event_time DESC
        `,
          [tc_id]
        );

        if (allEvents.length > 0) {
          logger.info(
            `Transfer Carton ${tc_id}: Found ${allEvents.length} total PACK_BOX_TO_TC events`,
            {
              events: allEvents.map((e) => ({
                item_code: e.item_code,
                box_id: e.box_id,
                carton_id: e.carton_id,
                qty: e.qty,
                event_time: e.event_time,
              })),
            }
          );
        }

        console.log(
          `Transfer Carton ${tc_id}: Found ${sortEvents.length} unique items (grouped by SQL)`
        );

        // SQL query already groups and sums by item_code and carton_id
        // Map results directly to cartonContents (no additional grouping needed)
        cartonContents = sortEvents
          .map((event) => ({
            item_code: event.item_code,
            source_carton: event.source_carton || null,
            box_id: hasBoxIdCol ? event.sort_box_id || null : null,
            qty: parseFloat(event.quantity) || 0,
            packed_by: event.packed_by || null,
            packed_on: event.packed_on
              ? new Date(event.packed_on).toISOString()
              : new Date().toISOString(),
          }))
          .sort((a, b) => a.item_code.localeCompare(b.item_code));

        console.log(
          `Transfer Carton ${tc_id}: Returning ${cartonContents.length} unique items`
        );
      }

      // If no items found with tc_id, try fallback for Material Request transfer cartons
      if (
        cartonContents.length === 0 &&
        transferCarton.to_no &&
        transferCarton.to_no.match(/^MR-\d+$/i)
      ) {
        console.log(
          `Transfer Carton ${tc_id}: No items found with tc_id. Trying fallback for Material Request ${transferCarton.to_no}`
        );

        const materialRequest = transferCarton.to_no;
        const tcCreatedOn = transferCarton.created_on;
        const tcSealedOn = transferCarton.sealed_on;

        // Build time window
        let startTime = new Date(tcCreatedOn);
        startTime.setHours(startTime.getHours() - 6); // Look back 6 hours
        let endTime = tcSealedOn ? new Date(tcSealedOn) : new Date();
        if (tcSealedOn) {
          endTime.setHours(endTime.getHours() + 2); // 2 hours after sealing
        }

        // Check if material_request column exists
        const [eventTableInfo] = await connection.execute(
          `DESCRIBE tabWmsScanEvent`
        );
        const eventColumns = new Set(eventTableInfo.map((row) => row.Field));
        const hasMaterialRequest = eventColumns.has("material_request");

        // Get items by Material Request number and time window
        let mrWhereClause = "transfer_order = ?";
        if (hasMaterialRequest) {
          mrWhereClause = "(transfer_order = ? OR material_request = ?)";
        }

        const mrParams = hasMaterialRequest
          ? [materialRequest, materialRequest, tc_id, startTime, endTime]
          : [materialRequest, tc_id, startTime, endTime];

        const [mrEvents] = await connection.execute(
          `
          SELECT 
            item_code,
            carton_id,
            tc_id,
            COALESCE(MAX(box_id), carton_id) as source_carton,
            SUM(qty) as total_qty,
            MAX(event_time) as latest_event_time,
            MAX(user_id) as latest_user_id
          FROM tabWmsScanEvent
          WHERE ${mrWhereClause}
            AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
            AND item_code IS NOT NULL
            AND qty > 0
            AND (tc_id IS NULL OR tc_id = ?)
            AND event_time >= ? AND event_time <= ?
          GROUP BY item_code, carton_id, tc_id
          ORDER BY latest_event_time DESC
        `,
          mrParams
        );

        if (mrEvents.length > 0) {
          console.log(
            `Transfer Carton ${tc_id}: Found ${mrEvents.length} items via Material Request fallback`
          );

          const mrContentsMap = new Map();
          for (const event of mrEvents) {
            const sourceCarton = event.box_id || event.carton_id || null;
            const key = `${event.item_code}_${sourceCarton || ""}`;

            if (!mrContentsMap.has(key)) {
              mrContentsMap.set(key, {
                item_code: event.item_code,
                source_carton: sourceCarton,
                qty: parseFloat(event.total_qty) || 0,
                packed_by: event.latest_user_id,
                packed_on: event.latest_event_time
                  ? new Date(event.latest_event_time).toISOString()
                  : new Date().toISOString(),
              });
            } else {
              const existing = mrContentsMap.get(key);
              existing.qty += parseFloat(event.total_qty) || 0;
              if (
                new Date(event.latest_event_time) > new Date(existing.packed_on)
              ) {
                existing.packed_on = new Date(
                  event.latest_event_time
                ).toISOString();
                existing.packed_by = event.latest_user_id;
              }
            }
          }

          cartonContents = Array.from(mrContentsMap.values()).sort((a, b) =>
            a.item_code.localeCompare(b.item_code)
          );

          console.log(
            `Transfer Carton ${tc_id}: Returning ${cartonContents.length} unique items via fallback`
          );
        }
      }
    } catch (contentsError) {
      console.error(
        `Failed to fetch transfer carton contents for ${tc_id}:`,
        contentsError
      );
      // Don't fail the entire request if contents can't be loaded
    }

    // Format response
    const transferCartonData = {
      tc_id: transferCarton.tc_id,
      status: transferCarton.status,
      asn_no: transferCarton.asn_no,
      to_no: transferCarton.to_no,
      store: transferCarton.store,
      created_by: transferCarton.created_by || null,
      created_on: transferCarton.created_on
        ? transferCarton.created_on.toISOString()
        : null,
      sealed_by: transferCarton.sealed_by || null,
      sealed_on: transferCarton.sealed_on
        ? transferCarton.sealed_on.toISOString()
        : null,
      dispatched_on: transferCarton.dispatched_on
        ? transferCarton.dispatched_on.toISOString()
        : null,
      updated_on: transferCarton.updated_on
        ? transferCarton.updated_on.toISOString()
        : null,
      purchase_receipt: transferCarton.purchase_receipt || null,
      stock_entry: transferCarton.stock_entry || null,
      remarks: transferCarton.remarks || null,
      contents: cartonContents, // Transfer carton contents from WMS Scan Events
    };

    res.json({
      ok: true,
      data: transferCartonData,
    });
  } catch (error) {
    console.error("Failed to fetch transfer carton:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to fetch transfer carton",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-cartons/:tc_id/add-items
 * Add items to an existing Transfer Carton
 * 
 * Request Body:
 * {
 *   "items": [
 *     {
 *       "item_code": "SKU-HAT-301-BLU-OS",
 *       "qty": 2.0,
 *       "carton_id": "PAW-ASN365425473-1768138301111",
 *       "source_bin": "A1-R02-L1-B2"
 *     }
 *   ],
 *   "user_id": "USER-150526"
 * }
 * 
 * This endpoint creates PACK_ITEM_TO_TC events for the items, which will appear
 * in the Transfer Carton contents when queried.
 */
export const addItemsToTransferCarton = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { tc_id } = req.params;
    const { items, user_id } = req.body;
    
    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'items array is required and must not be empty'
        }
      });
    }
    
    if (!user_id) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'user_id is required'
        }
      });
    }
    
    // Check if transfer carton exists
    const [tcRows] = await connection.execute(`
      SELECT tc_id, status, store, to_no, asn_no
      FROM tabTransferCarton
      WHERE tc_id = ?
    `, [tc_id]);
    
    if (tcRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Transfer Carton ${tc_id} not found`
        }
      });
    }
    
    const transferCarton = tcRows[0];
    
    // Check transfer carton status - cannot add items if sealed or dispatched
    if (transferCarton.status === 'Sealed' || transferCarton.status === 'Dispatched' || transferCarton.status === 'Completed') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot add items to Transfer Carton ${tc_id}. Current status: ${transferCarton.status}`
        }
      });
    }

    const { findMissingItemCodesInMaster } = await import('../../utils/itemMasterValidate.js');
    const missTc = await findMissingItemCodesInMaster(
      connection,
      items.map((i) => i.item_code)
    );
    if (missTc.length > 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'ITEM_NOT_IN_MASTER',
          message: `Item code(s) not in Item master (tabItem): ${missTc.join(', ')}`,
          missing_item_codes: missTc,
        },
      });
    }
    
    await connection.beginTransaction();
    
    const addedItems = [];
    const errors = [];
    
    // Get to_no from transfer carton
    const transferOrder = transferCarton.to_no || null;
    const asnNo = transferCarton.asn_no || null;
    
    // Check which columns exist in tabWmsScanEvent
    const [eventTableInfo] = await connection.execute(`DESCRIBE tabWmsScanEvent`);
    const eventColumns = new Set(eventTableInfo.map((row) => row.Field));
    
    const hasMaterialRequestColumn = eventColumns.has('material_request');
    const hasSourceBinColumn = eventColumns.has('source_bin');
    const hasToNoColumn = eventColumns.has('to_no');
    
    for (const item of items) {
      const { item_code, qty, carton_id, source_bin } = item;
      
      // Validate required fields
      if (!item_code || qty === undefined || qty <= 0) {
        errors.push({
          item_code: item_code || 'MISSING',
          error: 'Missing or invalid required fields: item_code, qty (must be > 0)'
        });
        continue;
      }
      
      try {
        // Validate carton_id if carton-level inventory is enabled
        if (carton_id) {
          const [cartonStockTable] = await connection.execute(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabCartonStock'
          `);
          
          const isCartonLevelMode = cartonStockTable.length > 0;
          
          if (isCartonLevelMode && source_bin) {
            // Validate carton exists at source_bin
            const [cartonStock] = await connection.execute(`
              SELECT carton_id, item_code, bin_location, qty
              FROM tabCartonStock
              WHERE carton_id = ? 
                AND item_code = ?
                AND bin_location = ?
                AND qty > 0
                AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
              LIMIT 1
            `, [carton_id, item_code, source_bin]);
            
            if (cartonStock.length === 0) {
              errors.push({
                item_code,
                error: `Carton ${carton_id} not found in bin ${source_bin} for item ${item_code}. Please verify the carton exists at this location.`
              });
              continue;
            }
          }
        }
        
        // Create PACK_ITEM_TO_TC event
        const offlineUuid = `add-item-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        
        // Build INSERT statement dynamically based on available columns
        const insertFields = ['offline_uuid', 'event_type', 'event_time', 'device_id', 'user_id',
                              'carton_id', 'item_code', 'qty', 'tc_id', 'store'];
        const insertValues = ['?', '?', 'NOW()', '?', '?', '?', '?', '?', '?', '?'];
        const insertParams = [offlineUuid, 'PACK_ITEM_TO_TC', 'SYSTEM', user_id, carton_id || null, 
                              item_code, qty, tc_id, transferCarton.store || null];
        
        // Add to_no column if column exists and value is available
        if (hasToNoColumn && transferOrder) {
          insertFields.push('to_no');
          insertValues.push('?');
          insertParams.push(transferOrder);
        }
        
        if (hasMaterialRequestColumn && transferOrder) {
          insertFields.push('material_request');
          insertValues.push('?');
          insertParams.push(transferOrder);
        }
        
        if (hasSourceBinColumn && source_bin) {
          insertFields.push('source_bin');
          insertValues.push('?');
          insertParams.push(source_bin);
        }
        
        // Check if asn_no column exists in tabWmsScanEvent and add if available
        const hasAsnNoColumn = eventColumns.has('asn_no');
        if (hasAsnNoColumn && asnNo) {
          insertFields.push('asn_no');
          insertValues.push('?');
          insertParams.push(asnNo);
        }
        
        await connection.execute(`
          INSERT INTO tabWmsScanEvent 
            (${insertFields.join(', ')})
          VALUES (${insertValues.join(', ')})
        `, insertParams);
        
        addedItems.push({
          item_code,
          qty,
          carton_id: carton_id || null
        });
        
        console.log(`✅ Added item ${item_code} (qty: ${qty}) to Transfer Carton ${tc_id}`);
        
      } catch (itemError) {
        errors.push({
          item_code: item_code || 'MISSING',
          error: itemError.message
        });
      }
    }
    
    await connection.commit();
    
    res.json({
      ok: true,
      message: 'Items added to transfer carton successfully',
      added_count: addedItems.length,
      failed_count: errors.length,
      total_count: items.length,
      added_items: addedItems,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Failed to add items to transfer carton:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to add items to transfer carton',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
