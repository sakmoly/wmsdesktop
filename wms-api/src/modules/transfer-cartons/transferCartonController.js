// wms-api/src/modules/transfer-cartons/transferCartonController.js
// Transfer carton operations

import { logger } from "../../utils/logger.js";

import { getConnection } from "../../db/connection.js";

/**
 * GET /api/transfer-cartons
 * Get transfer cartons with optional filtering by ASN and store
 *
 * Query Parameters:
 * - ?asn=ASN-0001 (optional) - Filter by ASN number
 * - ?store=STORE-001 (optional) - Filter by store
 *
 * Example:
 * GET /api/transfer-cartons?asn=ASN-0002&store=WAREHOUSE
 */
export const getTransferCartons = async (req, res) => {
  const { asn, store } = req.query;

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

      // Get all items in this sealed transfer carton from scan events
      // Try multiple methods to find items:
      // 1. By tc_id (preferred)
      // 2. By transfer_order if tc_id is not available
      let cartonItems = [];

      // Method 1: Find items by tc_id
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
        cartonItems = itemsByTC;
        console.log(
          `📦 Found ${cartonItems.length} item(s) in transfer carton ${tc_id} by tc_id`
        );
      } else {
        // Method 2: Find items by transfer_order and event time (if events don't have tc_id)
        // Get transfer carton creation time to find events around that time
        const [tcInfo] = await connection.execute(
          `
          SELECT created_on, sealed_on
          FROM tabTransferCarton
          WHERE tc_id = ?
        `,
          [tc_id]
        );

        if (tcInfo.length > 0) {
          const tcCreatedOn = tcInfo[0].created_on;
          const tcSealedOn = tcInfo[0].sealed_on || new Date();

          // Find items picked for this Material Request around the time the carton was created/sealed
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
            cartonItems = itemsByMR;
            console.log(
              `📦 Found ${cartonItems.length} item(s) for Material Request ${materialRequest} by transfer_order (around TC creation/seal time)`
            );
          } else {
            // Method 3: Find all items that are fully picked for this Material Request
            // If we can't find items by events, mark all fully picked items as sealed
            const [fullyPickedItems] = await connection.execute(
              `
              SELECT item_code
              FROM tabMaterialRequestItem
              WHERE parent_title = ?
                AND picked_qty >= requested_qty
                AND requested_qty > 0
                AND status != 'Sealed'
            `,
              [materialRequest]
            );

            if (fullyPickedItems.length > 0) {
              cartonItems = fullyPickedItems;
              console.log(
                `📦 Found ${cartonItems.length} fully picked item(s) for Material Request ${materialRequest} (fallback method)`
              );
            }
          }
        }
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

    // For Material Request transfer cartons, reduce stock when dispatched
    if (isMaterialRequest) {
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
            // Get current stock from source bin
            const [currentStock] = await connection.execute(
              `
              SELECT qty, reserved_qty
              FROM tabStockLedger
              WHERE item_code = ?
                AND warehouse = ?
                AND bin_location = ?
            `,
              [itemCode, warehouse, sourceBin]
            );

            const currentQty =
              currentStock.length > 0
                ? parseFloat(currentStock[0].qty) || 0
                : 0;
            const currentReservedQty =
              currentStock.length > 0
                ? parseFloat(currentStock[0].reserved_qty) || 0
                : 0;

            if (currentQty >= qty) {
              const newQty = currentQty - qty;
              const qtyBefore = currentQty;
              const qtyReduced = -qty; // Negative for reduction

              // Update stock ledger (decrease from source bin)
              await connection.execute(
                `
                INSERT INTO tabStockLedger 
                  (item_code, warehouse, bin_location, qty, reserved_qty,
                   qty_before, qty_reduced,
                   last_transaction_date, last_transaction_type, last_transaction_ref,
                   updated_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?,
                        NOW(), 'Dispatch', ?,
                        NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                  qty = ?,
                  qty_before = ?,
                  qty_reduced = ?,
                  last_transaction_date = NOW(),
                  last_transaction_type = 'Dispatch',
                  last_transaction_ref = ?,
                  updated_at = NOW()
              `,
                [
                  itemCode,
                  warehouse,
                  sourceBin,
                  newQty,
                  currentReservedQty,
                  qtyBefore,
                  qtyReduced,
                  tc_id,
                  newQty,
                  qtyBefore,
                  qtyReduced,
                  tc_id,
                ]
              );

              // Insert stock transaction log
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

        // Group by item_code and source carton (box_id) at SQL level to prevent duplicate summing
        // CRITICAL: Group by item_code and box_id only - carton_id might vary but we want to sum all quantities
        // for the same item from the same box
        // Include both PACK_BOX_TO_TC and PACK_ITEM_TO_TC event types
        const [sortEvents] = await connection.execute(
          `
          SELECT 
            item_code,
            box_id,
            COALESCE(box_id, carton_id) as source_carton,
            SUM(qty) as total_qty,
            MAX(event_time) as latest_event_time,
            MAX(user_id) as latest_user_id
          FROM tabWmsScanEvent
          WHERE tc_id = ?
            AND event_type IN ('PACK_BOX_TO_TC', 'PACK_ITEM_TO_TC')
            AND item_code IS NOT NULL
            AND qty > 0
          GROUP BY item_code, box_id
          ORDER BY latest_event_time DESC
        `,
          [tc_id]
        );

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

        // Group by item_code + source_carton (box_id or carton_id)
        // If same item from same box appears multiple times with different carton_id, we should sum them
        // But if it's the same item+box+carton combination, SQL SUM already handled it
        const contentsMap = new Map();
        for (const event of sortEvents) {
          // Use box_id as primary source, fallback to carton_id
          const sourceCarton = event.box_id || event.carton_id || null;
          // Key: item_code + source box/carton
          // For transfer cartons, we want to sum quantities for same item from same source box
          const key = `${event.item_code}_${sourceCarton || ""}`;

          if (!contentsMap.has(key)) {
            contentsMap.set(key, {
              item_code: event.item_code,
              source_carton: sourceCarton,
              qty: parseFloat(event.total_qty) || 0,
              packed_by: event.latest_user_id,
              packed_on: event.latest_event_time
                ? new Date(event.latest_event_time).toISOString()
                : new Date().toISOString(),
            });
            logger.debug(
              `Transfer Carton ${tc_id}: Added item ${event.item_code} from ${
                sourceCarton || "NULL"
              } with qty ${event.total_qty}`
            );
          } else {
            // If we still get duplicates after SQL GROUP BY, there might be multiple box_id or carton_id values
            // This shouldn't happen, but log it
            const existing = contentsMap.get(key);
            const oldQty = existing.qty;
            existing.qty += parseFloat(event.total_qty) || 0;
            logger.warn(
              `Transfer Carton ${tc_id}: Duplicate key found after SQL grouping: ${key} (old qty: ${oldQty}, adding: ${event.total_qty}, new total: ${existing.qty})`,
              {
                event_box_id: event.box_id,
                event_carton_id: event.carton_id,
                existing_source_carton: existing.source_carton,
              }
            );
            // Use latest event time
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
        cartonContents = Array.from(contentsMap.values()).sort((a, b) =>
          a.item_code.localeCompare(b.item_code)
        );

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
            box_id,
            COALESCE(box_id, carton_id) as source_carton,
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
          GROUP BY item_code, box_id
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
