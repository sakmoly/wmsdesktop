// wms-api/src/modules/putaway/putawayController.js
// Putaway operations

import { getConnection } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";

/**
 * Helper function to check if a store is a warehouse
 * CRITICAL: Uses ONLY tabwarehouse.warehouse_type = 'Warehouse' - NO hardcoded values
 * @param {Object} connection - Database connection
 * @param {string} storeCode - Store code to check
 * @returns {Promise<boolean>} - True if store has warehouse_type = 'Warehouse'
 */
async function isWarehouseStore(connection, storeCode) {
  if (!storeCode) {
    return false;
  }

  try {
    const [rows] = await connection.execute(
      `SELECT warehouse_type FROM tabWarehouse WHERE code = ?`,
      [storeCode]
    );

    if (rows.length === 0) {
      // Store not found in tabwarehouse - treat as non-warehouse
      return false;
    }

    // CRITICAL: Use ONLY warehouse_type = 'Warehouse' to determine if store is warehouse
    return rows[0].warehouse_type === "Warehouse";
  } catch (error) {
    console.error(
      `Error checking warehouse type for store ${storeCode}:`,
      error
    );
    // On error, treat as non-warehouse to be safe
    return false;
  }
}

/**
 * GET /api/putaway/tasks
 * Get list of putaway tasks with optional filters
 *
 * Query Parameters:
 * - status (optional) - Filter by status (Draft, Open, In Progress, Completed, Cancelled)
 * - source_type (optional) - Filter by source type (ASN, TransferIn)
 * - advance_shipping_notice (optional) - Filter by ASN number
 * - transfer_in (optional) - Filter by Transfer In number
 */
export const getTasks = async (req, res) => {
  const { status, source_type, advance_shipping_notice, transfer_in } =
    req.query;

  // Log the request for debugging
  console.log('📋 GET /api/putaway/tasks - Query params:', {
    status,
    source_type,
    advance_shipping_notice,
    transfer_in
  });

  const connection = await getConnection();

  try {
    // Check if source_type and transfer_in columns exist FIRST
    // This must be done before building WHERE clause
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('source_type', 'transfer_in')
    `);

    const hasSourceType = columns.some(
      (col) => col.COLUMN_NAME === "source_type"
    );
    const hasTransferIn = columns.some(
      (col) => col.COLUMN_NAME === "transfer_in"
    );

    // Build WHERE clause dynamically
    const conditions = [];
    const params = [];

    // Handle status filter - support comma-separated values (e.g., "Draft,In Progress")
    if (status) {
      const statusValues = status.split(',').map(s => s.trim()).filter(s => s);
      if (statusValues.length > 0) {
        const placeholders = statusValues.map(() => '?').join(',');
        conditions.push(`pt.status IN (${placeholders})`);
        params.push(...statusValues);
      }
    }

    // Only use source_type in WHERE clause if column exists
    if (source_type) {
      if (hasSourceType) {
        conditions.push('COALESCE(pt.source_type, "ASN") = ?');
        params.push(source_type);
      } else {
        // If source_type column doesn't exist and filter is "ASN", allow it (default behavior)
        // If filter is not "ASN", this won't match anything (no TransferIn tasks exist yet)
        if (source_type !== "ASN") {
          // Return empty result if filtering for TransferIn but column doesn't exist
          res.json({
            ok: true,
            data: [],
          });
          connection.release();
          return;
        }
        // If filtering for ASN and column doesn't exist, don't add condition (all tasks are ASN by default)
      }
    }

    if (advance_shipping_notice) {
      conditions.push("pt.advance_shipping_notice = ?");
      params.push(advance_shipping_notice);
    }

    // Only use transfer_in in WHERE clause if column exists
    if (transfer_in) {
      if (hasTransferIn) {
        conditions.push("pt.transfer_in = ?");
        params.push(transfer_in);
      } else {
        // If transfer_in column doesn't exist, return empty result
        res.json({
          ok: true,
          data: [],
        });
        connection.release();
        return;
      }
    }

    // Build WHERE clause (must be defined after all early returns)
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sourceTypeSelect = hasSourceType
      ? 'COALESCE(pt.source_type, "ASN") as source_type'
      : '"ASN" as source_type';
    const transferInSelect = hasTransferIn
      ? "pt.transfer_in"
      : "NULL as transfer_in";

    // Check if box_id, tc_id, rack, bin, and location_id columns exist
    const [taskColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('box_id', 'tc_id', 'rack', 'bin', 'location_id')
    `);
    const hasBoxId = taskColumns.some((col) => col.COLUMN_NAME === "box_id");
    const hasTcId = taskColumns.some((col) => col.COLUMN_NAME === "tc_id");
    const hasRack = taskColumns.some((col) => col.COLUMN_NAME === "rack");
    const hasBin = taskColumns.some((col) => col.COLUMN_NAME === "bin");
    const hasLocationId = taskColumns.some(
      (col) => col.COLUMN_NAME === "location_id"
    );

    // Build SELECT statement with conditional columns
    const boxIdSelect = hasBoxId ? "pt.box_id," : "NULL as box_id,";
    const tcIdSelect = hasTcId ? "pt.tc_id," : "NULL as tc_id,";
    const rackSelect = hasRack ? "pt.rack," : "NULL as rack,";
    const binSelect = hasBin ? "pt.bin," : "NULL as bin,";
    const locationIdSelect = hasLocationId
      ? "pt.location_id,"
      : "NULL as location_id,";

    // Get putaway tasks
    // Note: To optimize with lines_count in SQL (instead of JavaScript grouping), you could use:
    // SELECT
    //   pt.title as putaway_task,
    //   pt.advance_shipping_notice as asn_no,
    //   pt.created_at as created_on,
    //   pt.updated_at as updated_on,
    //   pt.box_id, pt.tc_id, pt.status, pt.location_id, pt.source_type,
    //   pt.created_by, pt.inbound_session,
    //   COUNT(pl.id) as lines_count
    // FROM tabPutawayTask pt
    // LEFT JOIN tabPutawayLine pl ON pl.parent_title = pt.title
    // WHERE pt.status = ? AND (pt.advance_shipping_notice = ? OR ? = '' OR ? IS NULL)
    // GROUP BY pt.title, pt.advance_shipping_notice, pt.created_at, pt.updated_at,
    //          pt.box_id, pt.tc_id, pt.status, pt.location_id, pt.source_type,
    //          pt.created_by, pt.inbound_session
    // ORDER BY pt.created_at DESC
    // However, the current implementation gets lines separately to include full item details
    const [tasks] = await connection.execute(
      `
      SELECT 
        pt.title,
        pt.status,
        ${sourceTypeSelect},
        pt.advance_shipping_notice,
        ${transferInSelect},
        ${boxIdSelect}
        ${tcIdSelect}
        ${rackSelect}
        ${binSelect}
        ${locationIdSelect}
        pt.inbound_session,
        pt.created_by,
        pt.created_at,
        pt.updated_at
      FROM tabPutawayTask pt
      ${whereClause}
      ORDER BY pt.created_at DESC, pt.title
    `,
      params
    );

    // Get putaway lines for each task
    if (tasks.length > 0) {
      const taskTitles = tasks.map((t) => t.title);
      const placeholders = taskTitles.map(() => "?").join(",");

      // Check if location_id column exists in tabPutawayLine
      const [lineColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayLine' 
        AND COLUMN_NAME = 'location_id'
      `);
      const hasLineLocationId = lineColumns.length > 0;
      const locationIdColumn = hasLineLocationId
        ? "pl.location_id"
        : "NULL as location_id";

      const [lines] = await connection.execute(
        `
        SELECT 
          pl.parent_title,
          pl.carton_id,
          pl.item_code,
          pl.qty,
          pl.rack,
          pl.bin,
          ${locationIdColumn}
        FROM tabPutawayLine pl
        WHERE pl.parent_title IN (${placeholders})
        ORDER BY pl.parent_title, pl.item_code
      `,
        taskTitles
      );

      // Group lines by parent_title
      const linesByTask = {};
      lines.forEach((line) => {
        if (!linesByTask[line.parent_title]) {
          linesByTask[line.parent_title] = [];
        }
        linesByTask[line.parent_title].push({
          item_code: line.item_code,
          qty: parseFloat(line.qty) || 0,
          carton_id: line.carton_id || null,
          rack: line.rack || null,
          bin: line.bin || null,
          location_id: line.location_id || null,
        });
      });

      // Attach lines to tasks and format response
      const formattedTasks = tasks.map((task) => {
        const taskLines = linesByTask[task.title] || [];

        // Get rack and bin from task (available for return statement)
        const taskRack = task.rack || null;
        const taskBin = task.bin || null;

        // Priority for header location_id:
        // 1. Use location_id from tabPutawayTask if available
        // 2. Reconstruct from rack+bin if available
        // 3. Use location_id from lines if all lines have the same location_id
        let headerLocationId = task.location_id || null;

        // If no location_id from task table, try to reconstruct from rack+bin
        if (!headerLocationId) {
          if (taskRack && taskBin) {
            headerLocationId = `${taskRack}-${taskBin}`;
          } else if (taskRack) {
            headerLocationId = taskRack;
          } else if (taskBin) {
            headerLocationId = taskBin;
          }
        }

        // If still no header location_id, check if all lines have the same location_id
        if (!headerLocationId && taskLines.length > 0) {
          const firstLocationId = taskLines[0].location_id;
          if (
            firstLocationId &&
            taskLines.every((line) => line.location_id === firstLocationId)
          ) {
            headerLocationId = firstLocationId;
          }
        }

        // Build response object with all fields for mobile app compatibility
        const responseTask = {
          putaway_task: task.title,
          title: task.title, // Add title field for mobile app compatibility
          box_id: task.box_id || null,
          tc_id: task.tc_id || null,
          asn_no: task.advance_shipping_notice || null,
          rack: taskRack,
          bin: taskBin,
          location_id: headerLocationId, // Location ID at header level
          status: task.status,
          source_type: task.source_type || "ASN",
          created_on: task.created_at ? task.created_at.toISOString() : null,
          created_at: task.created_at ? task.created_at.toISOString() : null, // Add created_at for compatibility
          created_by: task.created_by || null,
          lines_count: taskLines.length,
          item_count: taskLines.length, // Add item_count alias for mobile app
          items: taskLines, // Items already include location_id at line level
        };

        // Add Transfer In specific fields
        if (task.source_type === 'TransferIn' && task.transfer_in) {
          responseTask.transfer_in = task.transfer_in;
          responseTask.transfer_in_number = task.transfer_in; // Alias for mobile app
        }

        return responseTask;
      });

      // Log the response for debugging
      console.log(`✅ GET /api/putaway/tasks - Returning ${formattedTasks.length} task(s)`);
      if (source_type === 'TransferIn') {
        console.log(`   Transfer In tasks: ${formattedTasks.length}`);
        formattedTasks.forEach((task, index) => {
          console.log(`   ${index + 1}. ${task.title} - Transfer In: ${task.transfer_in || 'N/A'} - Status: ${task.status}`);
        });
      }

      res.json({
        ok: true,
        data: formattedTasks,
      });
    } else {
      // No tasks found - return empty array
      console.log(`⚠️ GET /api/putaway/tasks - No tasks found with filters:`, {
        status,
        source_type,
        advance_shipping_notice,
        transfer_in
      });
      res.json({
        ok: true,
        data: [],
      });
    }
  } catch (error) {
    logger.error("Failed to get putaway tasks", {
      errorType: error?.constructor?.name,
      message: error?.message,
      stack: error?.stack,
      code: error?.code,
      sqlMessage: error?.sqlMessage,
    });

    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get putaway tasks",
        details:
          process.env.NODE_ENV === "development"
            ? {
                message: error?.message,
                code: error?.code,
                sqlMessage: error?.sqlMessage,
              }
            : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/putaway/remaining-items
 * Get remaining items for putaway (items not sorted to transfer orders)
 *
 * Query Parameters:
 * - asn (required) - ASN number
 */
export const getRemainingItems = async (req, res) => {
  const { asn } = req.query;

  if (!asn) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "asn query parameter is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    // Get ASN items
    const [asnItems] = await connection.execute(
      `
      SELECT 
        item_code,
        carton_id,
        shipped_qty,
        parent_title
      FROM tabAsnItemDetails
      WHERE parent_title = ?
    `,
      [asn]
    );

    if (asnItems.length === 0) {
      return res.json({
        ok: true,
        data: [],
      });
    }

    // Get items that have been sorted to transfer orders
    const [sortedItems] = await connection.execute(
      `
      SELECT DISTINCT
        item_code,
        carton_id,
        SUM(qty) as sorted_qty
      FROM tabWmsScanEvent
      WHERE advance_shipping_notice = ?
        AND event_type = 'SORT_TO_BOX'
        AND item_code IS NOT NULL
        AND qty IS NOT NULL
      GROUP BY item_code, carton_id
    `,
      [asn]
    );

    // Calculate remaining quantities
    const sortedMap = {};
    sortedItems.forEach((item) => {
      const key = `${item.item_code}|${item.carton_id || "NULL"}`;
      sortedMap[key] = parseFloat(item.sorted_qty) || 0;
    });

    const remainingItems = [];
    asnItems.forEach((item) => {
      const key = `${item.item_code}|${item.carton_id || "NULL"}`;
      const shippedQty = parseFloat(item.shipped_qty) || 0;
      const sortedQty = sortedMap[key] || 0;
      const remainingQty = shippedQty - sortedQty;

      if (remainingQty > 0) {
        remainingItems.push({
          item_code: item.item_code,
          carton_id: item.carton_id || null,
          remaining_qty: remainingQty,
          asn_no: asn,
        });
      }
    });

    res.json({
      ok: true,
      data: remainingItems,
    });
  } catch (error) {
    console.error("Failed to get remaining items:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get remaining items",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/putaway/create-task-for-remaining-items
 * Create putaway task for remaining items (items not sorted to transfer orders)
 *
 * Request Body:
 * {
 *   "asn_no": "ASN-AAA"
 * }
 */
export const createTaskForRemainingItems = async (req, res) => {
  const { asn_no } = req.body;

  if (!asn_no) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "asn_no is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Get ASN items
    const [asnItems] = await connection.execute(
      `
      SELECT 
        item_code,
        carton_id,
        shipped_qty
      FROM tabAsnItemDetails
      WHERE parent_title = ?
    `,
      [asn_no]
    );

    if (asnItems.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "ASN_NOT_FOUND",
          message: `ASN ${asn_no} not found or has no items`,
        },
      });
    }

    // Get items that have been sorted to transfer orders
    const [sortedItems] = await connection.execute(
      `
      SELECT 
        item_code,
        carton_id,
        SUM(qty) as sorted_qty
      FROM tabWmsScanEvent
      WHERE advance_shipping_notice = ?
        AND event_type = 'SORT_TO_BOX'
        AND item_code IS NOT NULL
        AND qty IS NOT NULL
      GROUP BY item_code, carton_id
    `,
      [asn_no]
    );

    // Calculate remaining quantities
    const sortedMap = {};
    sortedItems.forEach((item) => {
      const key = `${item.item_code}|${item.carton_id || "NULL"}`;
      sortedMap[key] = parseFloat(item.sorted_qty) || 0;
    });

    const remainingItems = [];
    asnItems.forEach((item) => {
      const key = `${item.item_code}|${item.carton_id || "NULL"}`;
      const shippedQty = parseFloat(item.shipped_qty) || 0;
      const sortedQty = sortedMap[key] || 0;
      const remainingQty = shippedQty - sortedQty;

      if (remainingQty > 0) {
        remainingItems.push({
          item_code: item.item_code,
          carton_id: item.carton_id || null,
          remaining_qty: remainingQty,
        });
      }
    });

    if (remainingItems.length === 0) {
      await connection.rollback();
      connection.release();
      return res.json({
        ok: true,
        message:
          "No remaining items found. All items were sorted to transfer orders.",
        data: {
          asn_no: asn_no,
          remaining_items_count: 0,
          putaway_task: null,
        },
      });
    }

    // Get inbound session
    const [sessionRows] = await connection.execute(
      `
      SELECT inbound_session
      FROM tabInboundSession
      WHERE asn_no = ?
      ORDER BY started_at DESC
      LIMIT 1
    `,
      [asn_no]
    );

    const inboundSession =
      sessionRows.length > 0 ? sessionRows[0].inbound_session : null;

    if (!inboundSession) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "NO_INBOUND_SESSION",
          message: `No inbound session found for ASN ${asn_no}`,
        },
      });
    }

    // Check if putaway task already exists
    const [existingTasks] = await connection.execute(
      `
      SELECT title, status
      FROM tabPutawayTask
      WHERE advance_shipping_notice = ?
        AND status IN ('Draft', 'Open', 'In Progress')
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [asn_no]
    );

    let putawayTaskTitle;
    let isNewTask = false;

    if (existingTasks.length > 0) {
      // Use existing task
      putawayTaskTitle = existingTasks[0].title;
    } else {
      // Create new putaway task
      const datePrefix = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");
      const [countRows] = await connection.execute(
        `
        SELECT COUNT(*) as count
        FROM tabPutawayTask
        WHERE title LIKE ?
      `,
        [`PUT-${datePrefix}%`]
      );
      const count = countRows[0].count || 0;
      const sequence = (count + 1).toString().padStart(4, "0");
      putawayTaskTitle = `PUT-${datePrefix}-${sequence}`;

      // Check if source_type column exists
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayTask' 
        AND COLUMN_NAME = 'source_type'
      `);
      const hasSourceType = columns.length > 0;

      if (hasSourceType) {
        await connection.execute(
          `
          INSERT INTO tabPutawayTask 
            (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
          VALUES 
            (?, 'Draft', 'ASN', ?, ?, ?, NOW(), NOW())
        `,
          [putawayTaskTitle, asn_no, inboundSession, "SYSTEM"]
        );
      } else {
        await connection.execute(
          `
          INSERT INTO tabPutawayTask 
            (title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
          VALUES 
            (?, 'Draft', ?, ?, ?, NOW(), NOW())
        `,
          [putawayTaskTitle, asn_no, inboundSession, "SYSTEM"]
        );
      }

      isNewTask = true;
    }

    // Create putaway lines for remaining items only
    const createdLines = [];
    for (const item of remainingItems) {
      // Check if line already exists
      const [existingLines] = await connection.execute(
        `
        SELECT id
        FROM tabPutawayLine
        WHERE parent_title = ?
          AND item_code = ?
          AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
      `,
        [putawayTaskTitle, item.item_code, item.carton_id, item.carton_id]
      );

      if (existingLines.length === 0) {
        // Insert new line
        // Use empty string if carton_id is null, and 'TBD' for rack/bin (both are NOT NULL)
        await connection.execute(
          `
          INSERT INTO tabPutawayLine 
            (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
          VALUES 
            (?, ?, ?, ?, 'TBD', 'TBD', NOW(), NOW())
        `,
          [
            putawayTaskTitle,
            item.carton_id || null,
            item.item_code,
            item.remaining_qty,
          ]
        );

        createdLines.push({
          item_code: item.item_code,
          carton_id: item.carton_id,
          qty: item.remaining_qty,
        });
      }
    }

    await connection.commit();

    res.json({
      ok: true,
      message: isNewTask
        ? "Putaway task created for remaining items"
        : "Remaining items added to existing putaway task",
      data: {
        putaway_task: putawayTaskTitle,
        asn_no: asn_no,
        remaining_items_count: remainingItems.length,
        items_added: createdLines.length,
        items: createdLines,
        is_new_task: isNewTask,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to create putaway task for remaining items:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to create putaway task for remaining items",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/putaway/assign-rack
 * Assign rack/bin for putaway
 *
 * Request Body:
 * {
 *   "putaway_task": "PUTAWAY-001",
 *   "carton_id": "CTN-0101",
 *   "item_code": "SKU-001",
 *   "rack": "RACK-A",
 *   "bin": "BIN-01",
 *   "qty": 50.00,
 *   "user_id": "USER-001"
 * }
 */
export const assignRack = async (req, res) => {
  const { putaway_task, carton_id, item_code, rack, bin, qty, user_id } =
    req.body;

  // Validation
  if (!putaway_task || !rack) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "putaway_task and rack are required",
      },
    });
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Verify putaway task exists
    const [tasks] = await connection.execute(
      `SELECT title FROM tabPutawayTask WHERE title = ?`,
      [putaway_task]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: `Putaway task ${putaway_task} not found`,
        },
      });
    }

    // Update or insert putaway line
    if (carton_id && item_code && qty !== undefined) {
      // Use empty string if bin is null (database column is NOT NULL)
      const binValue = bin || "";
      await connection.execute(
        `
        INSERT INTO tabPutawayLine 
          (parent_title, carton_id, item_code, qty, rack, bin)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          rack = VALUES(rack),
          bin = VALUES(bin),
          qty = VALUES(qty),
          updated_at = CURRENT_TIMESTAMP
      `,
        [putaway_task, carton_id, item_code, qty, rack, binValue]
      );
    } else {
      // Just update rack for the task (if no specific line)
      await connection.execute(
        `
        UPDATE tabPutawayTask 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE title = ?
      `,
        [putaway_task]
      );
    }

    await connection.commit();

    res.json({
      ok: true,
      message: "Rack assigned successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to assign rack:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to assign rack",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/putaway/complete
 * Complete putaway task
 *
 * Request Body:
 * {
 *   "putaway_task": "PUT-20250120-0001",
 *   "performed_by": "USER-002",
 *   "items": [
 *     {
 *       "item_code": "SKU-001",
 *       "qty": 50.00,
 *       "source_bin": "DOCK-01",
 *       "target_bin": "RACK-A-01-BIN-05",
 *       "completed": true
 *     }
 *   ]
 * }
 */
export const completePutaway = async (req, res) => {
  const { putaway_task, performed_by, items, location_id } = req.body; // Added location_id at header level

  // Validation
  if (!putaway_task) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "putaway_task is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Verify putaway task exists
    const [tasks] = await connection.execute(
      `SELECT title, status FROM tabPutawayTask WHERE title = ?`,
      [putaway_task]
    );

    if (tasks.length === 0) {
      // Try to find similar tasks or recent tasks to help user
      const datePrefix =
        putaway_task.length >= 11
          ? putaway_task.substring(0, 11)
          : putaway_task.substring(0, Math.min(11, putaway_task.length));
      const sequence =
        putaway_task.length >= 4
          ? putaway_task.substring(putaway_task.length - 4)
          : putaway_task;

      const [similarTasks] = await connection.execute(
        `SELECT title, status, advance_shipping_notice, created_at 
         FROM tabPutawayTask 
         WHERE title LIKE ? OR title LIKE ?
         ORDER BY created_at DESC 
         LIMIT 5`,
        [`${datePrefix}%`, `%${sequence}%`]
      );

      await connection.rollback();
      connection.release();

      let suggestion = "";
      if (similarTasks.length > 0) {
        const suggestions = similarTasks.map((t) => t.title).join(", ");
        suggestion = ` Similar tasks found: ${suggestions}.`;
      } else {
        // Get recent tasks
        const [recentTasks] = await connection.execute(
          `SELECT title, status FROM tabPutawayTask 
           ORDER BY created_at DESC LIMIT 5`
        );
        if (recentTasks.length > 0) {
          const recent = recentTasks.map((t) => t.title).join(", ");
          suggestion = ` Recent tasks: ${recent}.`;
        }
      }

      return res.status(404).json({
        ok: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: `Putaway task ${putaway_task} not found.${suggestion}`,
          suggestions:
            similarTasks.length > 0 ? similarTasks.map((t) => t.title) : [],
        },
      });
    }

    const currentStatus = tasks[0].status;

    // Prevent re-processing if task is already completed
    // This prevents duplicate stock additions when API is called multiple times
    if (currentStatus === "Completed") {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "TASK_ALREADY_COMPLETED",
          message: `Putaway task ${putaway_task} is already completed. Stock has already been updated.`,
        },
      });
    }

    // Update task status to Completed
    await connection.execute(
      `
      UPDATE tabPutawayTask 
      SET status = 'Completed',
          updated_at = CURRENT_TIMESTAMP
      WHERE title = ?
    `,
      [putaway_task]
    );

    // Check if location_id column exists in tabPutawayLine
    const [lineLocationColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayLine' 
      AND COLUMN_NAME = 'location_id'
    `);
    const hasLineLocationIdColumn = lineLocationColumns.length > 0;

    // Get all putaway lines with locations
    const locationIdSelect = hasLineLocationIdColumn 
      ? "pl.location_id"
      : "NULL as location_id";
    
    const [putawayLines] = await connection.execute(
      `
      SELECT 
        pl.item_code,
        pl.qty,
        pl.rack,
        pl.bin,
        pl.carton_id,
        ${locationIdSelect}
      FROM tabPutawayLine pl
      WHERE pl.parent_title = ?
        AND pl.item_code IS NOT NULL
        AND pl.qty > 0
    `,
      [putaway_task]
    );

    // Support header-level location_id: if provided, apply to all items
    // This allows scanning location once for entire box instead of per item
    let headerLocationInfo = null;
    if (location_id && location_id.trim() !== "") {
      try {
        headerLocationInfo = await lookupLocationFromId(
          connection,
          location_id
        );
        console.log(
          `[Putaway] Header-level location scanned: ${location_id} -> rack="${headerLocationInfo.rack}", bin="${headerLocationInfo.bin}"`
        );
      } catch (error) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "LOCATION_NOT_FOUND",
            message:
              error.message ||
              `Header location ID "${location_id}" not found or not available`,
          },
        });
      }
    }

    // If items are provided in request body, use them to create/update putaway lines and process for stock
    // This allows completing putaway even if lines don't exist in database yet
    // IMPORTANT: Check if items already exist in putawayLines to prevent duplicate processing
    if (items && Array.isArray(items) && items.length > 0) {
      // Validate that all items that should be processed have proper locations
      // Accept either header-level location_id, item-level location_id (preferred), or item-level target_bin (backward compatibility)
      // Check ALL items with qty > 0, not just completed ones, to catch missing locations early
      const itemsWithoutLocation = items.filter((item) => {
        // Skip items with zero or negative quantity
        if (!item.qty || item.qty <= 0) return false;

        // If header location is provided, all items are valid
        if (headerLocationInfo) return false;

        // Check if item has location_id or target_bin
        const hasItemLocationId =
          item.location_id && item.location_id.trim() !== "";
        const hasTargetBin = item.target_bin && item.target_bin.trim() !== "";

        // Item is missing location if it has neither
        return !hasItemLocationId && !hasTargetBin;
      });

      if (itemsWithoutLocation.length > 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Cannot complete putaway: some items are missing location",
            details: `Items without location: ${itemsWithoutLocation
              .map((i) => i.item_code)
              .join(
                ", "
              )}. Please scan location (location_id) at header level or for each item before completing putaway.`,
          },
        });
      }

      // Create a Set to track existing items (item_code + rack + bin + carton_id combination)
      // Use same key format as itemKey below to ensure proper matching
      const existingItemsKey = new Set(
        putawayLines.map(
          (line) =>
            `${line.item_code}|${line.rack || ""}|${line.bin || ""}|${
              line.carton_id || ""
            }`
        )
      );

      for (const item of items) {
        // Priority: 1) Header-level location_id, 2) Item-level location_id, 3) Item-level target_bin
        const hasHeaderLocation = headerLocationInfo !== null;
        const hasItemLocationId =
          item.location_id && item.location_id.trim() !== "";
        const hasTargetBin = item.target_bin && item.target_bin.trim() !== "";

        // Process item if it has a valid location and quantity > 0
        // If header location is provided, we can process items even if they don't have completed: true
        // (This handles cases where mobile app sends items without the completed flag)
        const shouldProcess =
          item.item_code &&
          item.qty > 0 &&
          (hasHeaderLocation || hasItemLocationId || hasTargetBin);
        const isCompleted =
          item.completed === true ||
          item.completed === "true" ||
          item.completed === 1;

        if (shouldProcess) {
          // If item is not marked as completed but has location, treat it as completed
          // This ensures items get processed when header location is provided
          if (!isCompleted && hasHeaderLocation) {
            console.log(
              `[Putaway] Item ${item.item_code} not marked as completed, but header location provided - treating as completed`
            );
            item.completed = true;
          }
          let rack = null;
          let bin = null;
          let itemLocationId = null;

          // Priority 1: Use header-level location_id if provided
          if (hasHeaderLocation) {
            rack = headerLocationInfo.rack;
            bin = headerLocationInfo.bin;
            itemLocationId = headerLocationInfo.location_id;
            console.log(
              `[Putaway] Item ${item.item_code}: Using header-level location ${itemLocationId}: rack="${rack}", bin="${bin}"`
            );
          }
          // Priority 2: Use item-level location_id (preferred method for item-specific locations)
          else if (hasItemLocationId) {
            try {
              const locationInfo = await lookupLocationFromId(
                connection,
                item.location_id
              );
              rack = locationInfo.rack;
              bin = locationInfo.bin;
              itemLocationId = locationInfo.location_id;
              console.log(
                `[Putaway] Item ${item.item_code}: Looked up item-level location ${itemLocationId}: rack="${rack}", bin="${bin}"`
              );
            } catch (error) {
              console.error(
                `[Putaway] ERROR looking up location_id "${item.location_id}" for item ${item.item_code}:`,
                error.message
              );
              await connection.rollback();
              connection.release();
              return res.status(400).json({
                ok: false,
                error: {
                  code: "LOCATION_NOT_FOUND",
                  message:
                    error.message ||
                    `Location ID "${item.location_id}" not found or not available`,
                  details: `Item: ${item.item_code}`,
                },
              });
            }
          } else if (hasTargetBin) {
            // Backward compatibility: Parse target_bin to extract rack and bin
            // Format: "rack-bin" where the last part after the last '-' is the bin
            // Examples:
            //   "A1-R01-L1-B1-B1" -> rack = "A1-R01-L1-B1", bin = "B1"
            //   "A1-R01-L1-B1" -> rack = "A1-R01-L1", bin = "B1"
            //   "A1-R01" -> rack = "A1", bin = "R01"
            const targetBin = item.target_bin;

            if (targetBin) {
              const parts = targetBin.split("-");
              if (parts.length >= 2) {
                // Last part is the bin, everything before is the rack
                bin = parts[parts.length - 1];
                rack = parts.slice(0, parts.length - 1).join("-");
              } else if (parts.length === 1) {
                // Only one part - treat as bin only (common case like "B1")
                rack = null;
                bin = parts[0];
              }
            }

            // Validate that after parsing, at least rack or bin has a non-empty value
            const rackTrimmed = (rack || "").trim();
            const binTrimmed = (bin || "").trim();
            if (!rackTrimmed && !binTrimmed) {
              console.warn(
                `[Putaway] WARNING: Item ${item.item_code} has target_bin "${targetBin}" but parsed to empty location. Skipping.`
              );
              continue;
            }

            // Update rack and bin to trimmed values
            rack = rackTrimmed || null;
            bin = binTrimmed || null;

            // Use target_bin as location_id (fallback)
            itemLocationId = targetBin;
          } else {
            // Should not reach here due to validation above, but skip just in case
            continue;
          }

          // Check if this item+location+carton combination already exists
          const itemCartonIdForKey = item.box_id || item.carton_id || null;
          const itemKey = `${item.item_code}|${rack || ""}|${bin || ""}|${
            itemCartonIdForKey || ""
          }`;
          if (existingItemsKey.has(itemKey)) {
            // Item already exists in database lines, skip to prevent duplicate processing
            continue;
          }

          // Extract box_id/carton_id from item if provided
          // Check multiple possible field names: box_id, carton_id
          let itemCartonId = item.box_id || item.carton_id || null;

          // Check if location_id column exists in tabPutawayLine
          const [lineLocationColumns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabPutawayLine' 
            AND COLUMN_NAME = 'location_id'
          `);
          const hasLineLocationIdColumn = lineLocationColumns.length > 0;

          // Check if a putaway line already exists for this item+location+carton combination
          // Include carton_id in the check to prevent duplicates from same carton
          // Handle NULL rack properly - if rack is NULL/empty, check for NULL/empty rack
          // Use empty strings if null to satisfy NOT NULL constraints
          const rackValue = rack || "";
          const binValue = bin || "";
          
          // Build WHERE clause - check by location_id if available, otherwise by rack+bin
          let existingLineQuery = `SELECT id, carton_id, qty`;
          if (hasLineLocationIdColumn) {
            existingLineQuery += `, location_id`;
          }
          existingLineQuery += ` FROM tabPutawayLine 
             WHERE parent_title = ? 
               AND item_code = ?`;
          
          const existingLineParams = [putaway_task, item.item_code];
          
          if (hasLineLocationIdColumn && itemLocationId) {
            // If location_id column exists and we have a location_id, check by location_id first
            existingLineQuery += ` AND (location_id = ? OR (location_id IS NULL AND ? IS NULL))`;
            existingLineParams.push(itemLocationId, itemLocationId);
          } else {
            // Fallback to rack+bin check
            existingLineQuery += ` AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
               AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))`;
            existingLineParams.push(rackValue, rackValue, rackValue, binValue, binValue, binValue);
          }
          
          existingLineQuery += ` AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
             LIMIT 1`;
          existingLineParams.push(itemCartonId, itemCartonId);
          
          const [existingLine] = await connection.execute(
            existingLineQuery,
            existingLineParams
          );

          if (existingLine.length > 0) {
            // Line exists - update it, but preserve carton_id if new value is null
            const existingCartonId = existingLine[0].carton_id;
            if (!itemCartonId && existingCartonId) {
              itemCartonId = existingCartonId; // Preserve existing carton_id
            }

            console.log(
              `[Putaway] Updating existing line ID ${existingLine[0].id}: ${
                item.item_code
              } @ ${rackValue || ""}/${binValue || ""} (qty: ${
                existingLine[0].qty
              } -> ${item.qty})`
            );

            // Use rackValue and binValue (both are empty string if null) to satisfy NOT NULL constraints
            let updateQuery = `UPDATE tabPutawayLine 
               SET qty = ?, rack = ?, bin = ?, 
                   carton_id = COALESCE(?, carton_id)`;
            const updateParams = [item.qty, rackValue, binValue, itemCartonId];
            
            // Include location_id in UPDATE if column exists
            if (hasLineLocationIdColumn && itemLocationId) {
              updateQuery += `, location_id = ?`;
              updateParams.push(itemLocationId);
            }
            
            updateQuery += `, updated_at = NOW()
               WHERE id = ?`;
            updateParams.push(existingLine[0].id);
            
            await connection.execute(updateQuery, updateParams);

            // Use existing line's rack/bin for putawayLines array (don't add duplicate)
            // The existing line is already in putawayLines from the initial query
            console.log(
              `[Putaway] Skipping adding to putawayLines (already exists in DB with ID ${existingLine[0].id})`
            );
          } else {
            // Double-check: Maybe the line exists but with different rack/bin format
            // Check if any line exists for this item+carton (regardless of location)
            const [anyExistingLine] = await connection.execute(
              `SELECT id, rack, bin, carton_id FROM tabPutawayLine 
               WHERE parent_title = ? 
                 AND item_code = ? 
                 AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
               LIMIT 1`,
              [putaway_task, item.item_code, itemCartonId, itemCartonId]
            );

            if (anyExistingLine.length > 0) {
              console.warn(
                `[Putaway] WARNING: Line exists for ${
                  item.item_code
                } with carton ${
                  itemCartonId || "NULL"
                } but different location. Existing: ${
                  anyExistingLine[0].rack || "NULL"
                }/${anyExistingLine[0].bin || "NULL"}, New: ${rack || "NULL"}/${
                  bin || "NULL"
                }. Updating location.`
              );

              // Update the existing line with new location
              const existingCartonId = anyExistingLine[0].carton_id;
              if (!itemCartonId && existingCartonId) {
                itemCartonId = existingCartonId;
              }
              
              // Use rackValue and binValue for consistent NULL handling
              let updateExistingQuery = `UPDATE tabPutawayLine 
                 SET qty = ?, rack = ?, bin = ?, 
                     carton_id = COALESCE(?, carton_id)`;
              const updateExistingParams = [item.qty, rackValue, binValue, itemCartonId];
              
              // Include location_id in UPDATE if column exists
              if (hasLineLocationIdColumn && itemLocationId) {
                updateExistingQuery += `, location_id = ?`;
                updateExistingParams.push(itemLocationId);
              }
              
              updateExistingQuery += `, updated_at = NOW()
                 WHERE id = ?`;
              updateExistingParams.push(anyExistingLine[0].id);
              
              await connection.execute(updateExistingQuery, updateExistingParams);

              console.log(
                `[Putaway] Updated existing line ID ${anyExistingLine[0].id} with new location`
              );
            } else {
              // New line - if no carton_id in item, try to get it from another line for same item
              if (!itemCartonId) {
                const [otherLine] = await connection.execute(
                  `SELECT carton_id FROM tabPutawayLine 
                   WHERE parent_title = ? AND item_code = ? AND carton_id IS NOT NULL 
                   LIMIT 1`,
                  [putaway_task, item.item_code]
                );
                if (otherLine.length > 0 && otherLine[0].carton_id) {
                  itemCartonId = otherLine[0].carton_id;
                  console.log(
                    `[Putaway] Found carton_id from another line: ${itemCartonId}`
                  );
                }
              }

              // Final check: Make absolutely sure this line doesn't exist
              // Use rackValue and binValue for consistent NULL handling
              const [finalCheck] = await connection.execute(
                `SELECT id FROM tabPutawayLine 
                 WHERE parent_title = ? 
                   AND item_code = ? 
                   AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
                   AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
                   AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
                 LIMIT 1`,
                [
                  putaway_task,
                  item.item_code,
                  rackValue,
                  rackValue,
                  rackValue,
                  binValue,
                  binValue,
                  binValue,
                  itemCartonId,
                  itemCartonId,
                ]
              );

              if (finalCheck.length > 0) {
                console.log(
                  `[Putaway] Line already exists (final check), skipping insert. ID: ${finalCheck[0].id}`
                );
              } else {
                // Insert new line only if it truly doesn't exist
                console.log(
                  `[Putaway] Inserting new line: ${item.item_code} @ ${
                    rackValue || ""
                  }/${binValue || ""} (carton: ${itemCartonId || "NULL"})`
                );
                // Use rackValue and binValue (both are empty string if null) to satisfy NOT NULL constraints
                let insertQuery = `INSERT INTO tabPutawayLine 
                   (parent_title, carton_id, item_code, qty, rack, bin`;
                const insertParams = [
                  putaway_task,
                  itemCartonId,
                  item.item_code,
                  item.qty,
                  rackValue,
                  binValue,
                ];
                
                // Include location_id in INSERT if column exists
                if (hasLineLocationIdColumn && itemLocationId) {
                  insertQuery += `, location_id`;
                  insertParams.push(itemLocationId);
                }
                
                insertQuery += `, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?`;
                if (hasLineLocationIdColumn && itemLocationId) {
                  insertQuery += `, ?`;
                }
                insertQuery += `, NOW(), NOW())`;
                
                await connection.execute(insertQuery, insertParams);
              }
            }
          }

          // Check if this item+location+carton is already in putawayLines before adding
          // This prevents duplicates when the same item exists in both DB and request
          const alreadyInLines = putawayLines.some(
            (line) =>
              line.item_code === item.item_code &&
              (line.rack || "") === (rack || "") &&
              (line.bin || "") === (bin || "") &&
              (line.carton_id || "") === (itemCartonId || "")
          );

          if (!alreadyInLines) {
            // Add to putawayLines array for stock processing
            putawayLines.push({
              item_code: item.item_code,
              qty: item.qty,
              rack: rack,
              bin: bin,
              carton_id: itemCartonId, // Include carton_id if available
              location_id: itemLocationId, // Include location_id
            });
            console.log(
              `[Putaway] Added item to putawayLines: ${item.item_code} @ ${
                itemLocationId || rack || "" + "/" + bin || ""
              } (qty: ${item.qty})`
            );
          } else {
            console.log(
              `[Putaway] Skipping duplicate item (already in putawayLines): ${
                item.item_code
              } @ ${itemLocationId || rack || "" + "/" + bin || ""} (carton: ${
                itemCartonId || "NULL"
              })`
            );
          }

          // Add to existing items set to prevent duplicates within the same request
          existingItemsKey.add(itemKey);
        }
      }
    }

    // Deduplicate putawayLines array to prevent processing same item+location+carton twice
    // Use a Map to keep the first occurrence of each item_code+rack+bin+carton_id combination
    // CRITICAL: Use MAX quantity, not SUM, because duplicates represent the same physical items
    const uniqueLinesMap = new Map();
    for (const line of putawayLines) {
      const key = `${line.item_code}|${line.rack || ""}|${line.bin || ""}|${
        line.carton_id || ""
      }`;
      if (!uniqueLinesMap.has(key)) {
        uniqueLinesMap.set(key, line);
      } else {
        // If duplicate found, use MAX quantity (not sum) because they represent the same physical items
        // Duplicates can occur when items are in both DB lines and request body
        const existing = uniqueLinesMap.get(key);
        const existingQty = parseFloat(existing.qty) || 0;
        const newQty = parseFloat(line.qty) || 0;
        existing.qty = Math.max(existingQty, newQty);
        console.log(
          `[Putaway] Deduplicating line: ${line.item_code} @ ${
            line.rack || ""
          }/${line.bin || ""} - Using max qty: ${
            existing.qty
          } (was: ${existingQty} and ${newQty})`
        );
      }
    }
    // Replace putawayLines with deduplicated array
    const originalLength = putawayLines.length;
    putawayLines.length = 0;
    putawayLines.push(...Array.from(uniqueLinesMap.values()));

    if (originalLength > putawayLines.length) {
      console.log(
        `[Putaway] Deduplicated ${originalLength} lines to ${putawayLines.length} unique items`
      );
    }

    // Get warehouse from ASN or use default
    const [taskInfo] = await connection.execute(
      `SELECT advance_shipping_notice FROM tabPutawayTask WHERE title = ?`,
      [putaway_task]
    );

    let warehouse = "Main Warehouse"; // Default warehouse
    if (taskInfo.length > 0 && taskInfo[0].advance_shipping_notice) {
      // Check if warehouse column exists in tabAdvanceShippingNotice
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabAdvanceShippingNotice' 
        AND COLUMN_NAME = 'warehouse'
      `);
      const hasWarehouseColumn = columns.length > 0;

      if (hasWarehouseColumn) {
        // Try to get warehouse from ASN
        const [warehouseRows] = await connection.execute(
          `SELECT warehouse FROM tabAdvanceShippingNotice WHERE title = ? LIMIT 1`,
          [taskInfo[0].advance_shipping_notice]
        );
        if (warehouseRows.length > 0 && warehouseRows[0].warehouse) {
          warehouse = warehouseRows[0].warehouse;
        }
      }

      // If no warehouse from ASN, try to get default warehouse from tabWarehouse
      if (warehouse === "Main Warehouse") {
        const [defaultWarehouse] = await connection.execute(
          `SELECT name FROM tabWarehouse WHERE warehouse_type = 'Warehouse' OR name LIKE '%Main%' OR name LIKE '%WH-MAIN%' LIMIT 1`
        );
        if (defaultWarehouse.length > 0) {
          warehouse = defaultWarehouse[0].name;
        }
      }
    }

    // Validate that all putaway lines have proper locations before processing stock
    const linesWithoutLocation = putawayLines.filter((line) => {
      const rack = (line.rack || "").trim();
      const bin = (line.bin || "").trim();
      // At least one of rack or bin must be non-empty
      return rack === "" && bin === "";
    });

    if (linesWithoutLocation.length > 0) {
      await connection.rollback();
      connection.release();
      console.error(
        `[Putaway] Validation failed: ${
          linesWithoutLocation.length
        } items missing location: ${linesWithoutLocation
          .map((l) => l.item_code)
          .join(", ")}`
      );
      console.error(
        `[Putaway] Header location_id provided: ${
          location_id || "NO"
        }, headerLocationInfo: ${headerLocationInfo ? "YES" : "NO"}`
      );
      if (items && items.length > 0) {
        console.error(
          `[Putaway] Items in request: ${
            items.length
          }, items with location_id: ${
            items.filter((i) => i.location_id).length
          }, items with target_bin: ${items.filter((i) => i.target_bin).length}`
        );
      }
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Cannot complete putaway: some items are missing location",
          details: `Items without location: ${linesWithoutLocation
            .map((l) => l.item_code)
            .join(
              ", "
            )}. Please scan location (location_id) at header level or for each item before completing putaway.`,
        },
      });
    }

    // Check if qty_before and qty_reduced columns exist (check once, outside loop)
    const [stockLedgerColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
    `);
    const hasQtyBefore = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_before');
    const hasQtyReduced = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_reduced');

    // Update stock ledger for each putaway line
    // CRITICAL: Use a Set to track processed item+location combinations to prevent duplicate stock updates
    const processedStockKeys = new Set();
    const stockUpdates = [];
    for (const line of putawayLines) {
      const itemCode = line.item_code;
      const qty = parseFloat(line.qty) || 0;
      const rack = (line.rack || "").trim() || null;
      const bin = (line.bin || "").trim() || null;

      // Validate location is present (at least rack or bin must be non-empty)
      if (!rack && !bin) {
        console.warn(`[Putaway] Skipping line without location: ${itemCode}`);
        continue; // Skip lines without location (should not happen due to validation above, but safety check)
      }

      // Use location_id as bin_location (preferred) or combine rack and bin
      let binLocation = line.location_id || null;
      if (!binLocation) {
        // Fallback: combine rack and bin if location_id not available
        if (rack && bin) {
          binLocation = `${rack}-${bin}`;
        } else if (rack) {
          binLocation = rack;
        } else if (bin) {
          binLocation = bin;
        }
      }

      // Create a unique key for this item+location combination
      const stockKey = `${itemCode}|${binLocation || ""}`;
      if (processedStockKeys.has(stockKey)) {
        console.warn(
          `[Putaway] SKIPPING duplicate stock update: ${itemCode} @ ${
            binLocation || "NULL"
          } (already processed)`
        );
        continue; // Skip duplicate stock updates
      }
      processedStockKeys.add(stockKey);

      if (!itemCode || qty <= 0) {
        continue; // Skip invalid lines
      }

      // Get current stock at this location
      const [currentStock] = await connection.execute(
        `
        SELECT qty, reserved_qty
        FROM tabStockLedger
        WHERE item_code = ?
          AND warehouse = ?
          AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
      `,
        [itemCode, warehouse, binLocation, binLocation]
      );

      const currentQty =
        currentStock.length > 0 ? parseFloat(currentStock[0].qty) || 0 : 0;
      const currentReservedQty =
        currentStock.length > 0
          ? parseFloat(currentStock[0].reserved_qty) || 0
          : 0;
      const newQty = currentQty + qty;
      
      // Calculate qty_before and qty_reduced for putaway (increase stock)
      const qtyBefore = currentQty;
      const qtyReduced = qty; // Positive for putaway (stock increase)

      // Build INSERT/UPDATE query with optional qty_before and qty_reduced
      let insertFields = `item_code, warehouse, bin_location, qty, reserved_qty`;
      let insertValues = `?, ?, ?, ?, ?`;
      let insertParams = [itemCode, warehouse, binLocation, newQty, currentReservedQty];
      
      let updateFields = `qty = ?`;
      let updateParams = [newQty];
      
      if (hasQtyBefore) {
        insertFields += `, qty_before`;
        insertValues += `, ?`;
        insertParams.push(qtyBefore);
        updateFields += `, qty_before = ?`;
        updateParams.push(qtyBefore);
      }
      
      if (hasQtyReduced) {
        insertFields += `, qty_reduced`;
        insertValues += `, ?`;
        insertParams.push(qtyReduced);
        updateFields += `, qty_reduced = ?`;
        updateParams.push(qtyReduced);
      }
      
      insertFields += `, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at`;
      insertValues += `, NOW(), 'Putaway', ?, NOW(), NOW()`;
      insertParams.push(putaway_task);
      
      updateFields += `, last_transaction_date = NOW(), last_transaction_type = 'Putaway', last_transaction_ref = ?, updated_at = NOW()`;
      updateParams.push(putaway_task);

      // Log the query for debugging
      console.log(`[Putaway] Updating stock: ${itemCode} @ ${binLocation || 'NULL'}`);
      console.log(`  qty_before: ${qtyBefore}, qty_reduced: ${qtyReduced}, new_qty: ${newQty}`);
      console.log(`  hasQtyBefore: ${hasQtyBefore}, hasQtyReduced: ${hasQtyReduced}`);

      // Update or insert stock ledger
      await connection.execute(
        `
        INSERT INTO tabStockLedger 
          (${insertFields})
        VALUES 
          (${insertValues})
        ON DUPLICATE KEY UPDATE
          ${updateFields}
      `,
        [...insertParams, ...updateParams]
      );

      // Insert stock transaction log
      await connection.execute(
        `
        INSERT INTO tabStockTransaction 
          (transaction_date, transaction_type, reference_doc_type, reference_doc,
           item_code, warehouse, bin_location, qty_change, qty_before, qty_after,
           source_bin, target_bin, performed_by, created_at)
        VALUES 
          (NOW(), 'Putaway', 'Putaway Task', ?,
           ?, ?, ?, ?, ?, ?,
           NULL, ?, ?, NOW())
      `,
        [
          putaway_task,
          itemCode,
          warehouse,
          binLocation,
          qty,
          currentQty,
          newQty,
          binLocation,
          performed_by || "SYSTEM",
        ]
      );

      stockUpdates.push({
        item_code: itemCode,
        location: binLocation || "Warehouse",
        qty_added: qty,
        qty_before: currentQty,
        qty_after: newQty,
      });
    }

    // Update tabItem.stock_qty (sum of all locations for each item)
    const itemCodes = [...new Set(putawayLines.map((line) => line.item_code))];
    for (const itemCode of itemCodes) {
      await connection.execute(
        `
        UPDATE tabItem
        SET stock_qty = (
          SELECT COALESCE(SUM(qty), 0)
          FROM tabStockLedger 
          WHERE item_code = ?
        ),
        updated_at = NOW()
        WHERE code = ?
      `,
        [itemCode, itemCode]
      );
    }

    // Update box location if box_id exists in putaway task
    // First check which columns exist in tabPutawayTask
    const [taskColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('box_id', 'rack', 'bin')
    `);
    const hasTaskBoxId = taskColumns.some(
      (col) => col.COLUMN_NAME === "box_id"
    );
    const hasTaskRack = taskColumns.some((col) => col.COLUMN_NAME === "rack");
    const hasTaskBin = taskColumns.some((col) => col.COLUMN_NAME === "bin");

    // Build SELECT query based on available columns
    let taskBoxQuery = "SELECT ";
    const selectFields = [];
    if (hasTaskBoxId) selectFields.push("box_id");
    if (hasTaskRack) selectFields.push("rack");
    if (hasTaskBin) selectFields.push("bin");

    if (selectFields.length === 0) {
      // No relevant columns exist, skip box update
      taskBoxQuery = null;
    } else {
      taskBoxQuery +=
        selectFields.join(", ") + " FROM tabPutawayTask WHERE title = ?";
    }

    let taskBoxInfo = [];
    if (taskBoxQuery) {
      const [result] = await connection.execute(taskBoxQuery, [putaway_task]);
      taskBoxInfo = result;
    }

    if (taskBoxInfo.length > 0 && hasTaskBoxId && taskBoxInfo[0].box_id) {
      const boxId = taskBoxInfo[0].box_id;
      const taskRack =
        (hasTaskRack && taskBoxInfo[0].rack) || putawayLines[0]?.rack || null;
      const taskBin =
        (hasTaskBin && taskBoxInfo[0].bin) || putawayLines[0]?.bin || null;

      // Check if rack, bin, and timestamp columns exist in tabSortBox
      const [boxColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabSortBox' 
        AND COLUMN_NAME IN ('rack', 'bin', 'updated_on', 'updated_at')
      `);
      const hasRack = boxColumns.some((col) => col.COLUMN_NAME === "rack");
      const hasBin = boxColumns.some((col) => col.COLUMN_NAME === "bin");
      const hasUpdatedOn = boxColumns.some(
        (col) => col.COLUMN_NAME === "updated_on"
      );
      const hasUpdatedAt = boxColumns.some(
        (col) => col.COLUMN_NAME === "updated_at"
      );

      // Use updated_at if it exists (standard), otherwise updated_on, otherwise no timestamp update
      const timestampColumn = hasUpdatedAt
        ? "updated_at"
        : hasUpdatedOn
        ? "updated_on"
        : null;
      const timestampClause = timestampColumn
        ? `, ${timestampColumn} = NOW()`
        : "";

      if (hasRack && hasBin && taskRack) {
        await connection.execute(
          `UPDATE tabSortBox SET rack = ?, bin = ?${timestampClause} WHERE box_id = ?`,
          [taskRack, taskBin, boxId]
        );
        console.log(
          `Updated box ${boxId} location to ${taskRack}/${taskBin || ""}`
        );
      } else if (hasRack && taskRack) {
        await connection.execute(
          `UPDATE tabSortBox SET rack = ?${timestampClause} WHERE box_id = ?`,
          [taskRack, boxId]
        );
        console.log(`Updated box ${boxId} location to ${taskRack}`);
      }
    }

    // Update location availability (mark as occupied/available based on your business logic)
    // For now, we'll mark it as available (is_available = 1) since items are being put away
    const uniqueLocations = [
      ...new Set(putawayLines.map((line) => line.rack).filter((r) => r)),
    ];

    // Check if updated_on or updated_at column exists in tabLocation
    if (uniqueLocations.length > 0) {
      const [locColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabLocation' 
        AND COLUMN_NAME IN ('updated_on', 'updated_at')
      `);
      const hasLocUpdatedOn = locColumns.some(
        (col) => col.COLUMN_NAME === "updated_on"
      );
      const hasLocUpdatedAt = locColumns.some(
        (col) => col.COLUMN_NAME === "updated_at"
      );
      const locTimestampColumn = hasLocUpdatedAt
        ? "updated_at"
        : hasLocUpdatedOn
        ? "updated_on"
        : null;
      const locTimestampClause = locTimestampColumn
        ? `, ${locTimestampColumn} = NOW()`
        : "";

      for (const locationId of uniqueLocations) {
        await connection.execute(
          `UPDATE tabLocation SET is_available = 1${locTimestampClause} WHERE location_id = ?`,
          [locationId]
        );
      }
    }

    await connection.commit();

    res.json({
      ok: true,
      message: "Putaway completed successfully",
      data: {
        putaway_task: putaway_task,
        status: "Completed",
        stock_updated: true,
        warehouse: warehouse,
        items_updated: stockUpdates.length,
        stock_updates: stockUpdates,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to complete putaway:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to complete putaway",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/putaway/scan-transfer-carton
 * Scan transfer carton or box and location, then create/update putaway task
 *
 * Request Body:
 * {
 *   "tc_id": "TC-1766952896460",  // Optional if box_id provided
 *   "box_id": "BOX-WHMAIN-514364", // Optional if tc_id provided
 *   "rack": "RACK-A",
 *   "bin": "BIN-01",
 *   "user_id": "USER-001"
 * }
 */
export const scanTransferCarton = async (req, res) => {
  const { tc_id, box_id, location_id, rack, bin, user_id, putaway_task } =
    req.body;

  // Accept either location_id (preferred) or rack+bin (backward compatibility)
  let actualLocationId = location_id;
  let actualRack = rack;
  let actualBin = bin;

  // If location_id is provided, use it (preferred method)
  // Otherwise, accept rack+bin for backward compatibility
  if (!actualLocationId && !actualRack) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "location_id (or rack) is required",
      },
    });
  }

  // If only putaway_task is provided (no tc_id or box_id), update existing task
  if (putaway_task && !tc_id && !box_id) {
    // Use location_id if provided, otherwise use rack+bin
    const locationToUse =
      actualLocationId ||
      (actualRack && actualBin ? `${actualRack}-${actualBin}` : actualRack);
    return await updatePutawayTaskLocation(
      req,
      res,
      putaway_task,
      locationToUse,
      user_id
    );
  }

  // Otherwise, need tc_id or box_id
  if (!tc_id && !box_id) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Either tc_id, box_id, or putaway_task is required",
      },
    });
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    let actualTcId = tc_id;
    let scannedBoxId = box_id;

    // If box_id is provided but not tc_id, find the transfer carton containing this box
    if (box_id && !tc_id) {
      // Check if box exists and is sealed
      const [boxRows] = await connection.execute(
        `SELECT box_id, status, advance_shipping_notice, store, purpose FROM tabSortBox WHERE box_id = ?`,
        [box_id]
      );

      if (boxRows.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({
          ok: false,
          error: {
            code: "BOX_NOT_FOUND",
            message: `Box ${box_id} not found`,
          },
        });
      }

      const box = boxRows[0];

      // Check if box is closed (required for warehouse box putaway)
      if (
        box.status !== "Closed" &&
        box.status !== "Sealed" &&
        box.status !== "Dispatched"
      ) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "BOX_NOT_CLOSED",
            message: `Box ${box_id} must be closed before putaway. Current status: ${box.status}`,
          },
        });
      }

      // CRITICAL: Check if box destination store has warehouse_type = 'Warehouse' (MANDATORY - NO hardcoded values)
      const isWarehouseBox = await isWarehouseStore(connection, box.store);

      if (!isWarehouseBox) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "NOT_WAREHOUSE_BOX",
            message: `Box destination store does not have warehouse_type = 'Warehouse'. Use Packing screen instead.`,
          },
        });
      }

      // Find which transfer carton contains this box (if any)
      const [tcFromBox] = await connection.execute(
        `SELECT DISTINCT tc_id FROM tabWmsScanEvent WHERE box_id = ? AND event_type = 'PACK_BOX_TO_TC' AND tc_id IS NOT NULL LIMIT 1`,
        [box_id]
      );

      if (tcFromBox.length === 0) {
        // Box is closed but not in a transfer carton
        // This is a warehouse box going directly to putaway (not to showroom)
        // Set actualTcId to null to indicate direct box putaway
        actualTcId = null;
      } else {
        actualTcId = tcFromBox[0].tc_id;
      }
    }

    let asnNo;
    let transferCarton = null;

    // If actualTcId is null, this is a direct box putaway (warehouse box)
    if (actualTcId) {
      // Get transfer carton details
      const [tableInfo] = await connection.execute(
        `DESCRIBE tabTransferCarton`
      );
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

      const [tcRows] = await connection.execute(
        `
        SELECT 
          tc_id,
          status,
          ${asnColumn} as asn_no,
          store
        FROM tabTransferCarton
        WHERE tc_id = ?
      `,
        [actualTcId]
      );

      if (tcRows.length === 0) {
        // Auto-create transfer carton if it doesn't exist
        // Try to extract ASN from tc_id (format: PAW-ASN12225-{timestamp} or similar)
        let extractedASN = null;
        if (actualTcId.includes("ASN")) {
          // Try to extract ASN from ID like "PAW-ASN12225-1767112384558"
          const asnMatch = actualTcId.match(/ASN-?\d+/i);
          if (asnMatch) {
            extractedASN = asnMatch[0].replace(/^ASN/i, "ASN-");
            if (!extractedASN.includes("-")) {
              // If format is ASN12225, convert to ASN-12225
              extractedASN = extractedASN.replace(/ASN/i, "ASN-");
            }
          }
        }

        // If we can't extract ASN, try to get it from request body or use a default
        if (!extractedASN) {
          // Check if ASN is provided in request body
          extractedASN = req.body.asn_no || req.body.advance_shipping_notice;
        }

        // If still no ASN, we can't create the transfer carton
        if (!extractedASN) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: "TRANSFER_CARTON_NOT_FOUND",
              message: `Transfer carton ${actualTcId} not found. Please provide asn_no in request body to auto-create it.`,
            },
          });
        }

        // Auto-create the transfer carton
        console.log(
          `Auto-creating transfer carton ${actualTcId} for ASN ${extractedASN}`
        );

        // Determine TO column and check if it's nullable
        let toColumn = null;
        let toColumnNullable = true;
        let toValue = null;

        if (allColumns.has("to_no")) {
          toColumn = "to_no";
        } else if (allColumns.has("transfer_order")) {
          toColumn = "transfer_order";
        }

        // Check if TO column is nullable by examining table structure
        if (toColumn) {
          const [columnInfo] = await connection.execute(
            `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'tabTransferCarton' 
             AND COLUMN_NAME = ?`,
            [toColumn]
          );

          if (columnInfo.length > 0) {
            toColumnNullable = columnInfo[0].IS_NULLABLE === "YES";
          }

          // Get TO value from request body or use a default
          toValue = req.body.to_no || req.body.transfer_order || null;

          // If column is NOT NULL and no value provided, use a default
          if (!toColumnNullable && !toValue) {
            // Try to get TO from ASN if possible, or use a placeholder
            // For putaway operations, TO might not be required, so use a default
            toValue = "PUTAWAY-DEFAULT"; // Default value for putaway-only transfer cartons
          }
        }

        // Insert transfer carton
        if (toColumn && toValue) {
          await connection.execute(
            `INSERT INTO tabTransferCarton (tc_id, status, ${asnColumn}, ${toColumn}, store, created_by, created_on) 
             VALUES (?, 'Sealed', ?, ?, ?, ?, NOW())`,
            [
              actualTcId,
              extractedASN,
              toValue,
              req.body.store || "WAREHOUSE",
              user_id || "SYSTEM",
            ]
          );
        } else if (toColumn && toColumnNullable) {
          // Column exists but is nullable, insert with NULL
          await connection.execute(
            `INSERT INTO tabTransferCarton (tc_id, status, ${asnColumn}, ${toColumn}, store, created_by, created_on) 
             VALUES (?, 'Sealed', ?, NULL, ?, ?, NOW())`,
            [
              actualTcId,
              extractedASN,
              req.body.store || "WAREHOUSE",
              user_id || "SYSTEM",
            ]
          );
        } else {
          // No TO column exists
          await connection.execute(
            `INSERT INTO tabTransferCarton (tc_id, status, ${asnColumn}, store, created_by, created_on) 
             VALUES (?, 'Sealed', ?, ?, ?, NOW())`,
            [
              actualTcId,
              extractedASN,
              req.body.store || "WAREHOUSE",
              user_id || "SYSTEM",
            ]
          );
        }

        // Fetch the newly created transfer carton
        const [newTcRows] = await connection.execute(
          `SELECT tc_id, status, ${asnColumn} as asn_no, store FROM tabTransferCarton WHERE tc_id = ?`,
          [actualTcId]
        );

        if (newTcRows.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(500).json({
            ok: false,
            error: {
              code: "DATABASE_ERROR",
              message: `Failed to create transfer carton ${actualTcId}`,
            },
          });
        }

        transferCarton = newTcRows[0];
        asnNo = transferCarton.asn_no;
        console.log(
          `Successfully auto-created transfer carton ${actualTcId} for ASN ${asnNo}`
        );
      } else {
        transferCarton = tcRows[0];
        asnNo = transferCarton.asn_no;
      }
    } else {
      // Direct box putaway - get ASN from box
      if (scannedBoxId) {
        const [boxInfo] = await connection.execute(
          `SELECT advance_shipping_notice FROM tabSortBox WHERE box_id = ?`,
          [scannedBoxId]
        );
        if (boxInfo.length > 0) {
          asnNo = boxInfo[0].advance_shipping_notice;
        }
      }
    }

    if (!asnNo) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Transfer carton ${tc_id} has no associated ASN`,
        },
      });
    }

    // Get items from transfer carton or directly from box
    let itemEvents;

    if (actualTcId) {
      // Items from transfer carton (from PACK_BOX_TO_TC events)
      let itemEventsQuery = `
        SELECT 
          item_code,
          box_id,
          carton_id,
          SUM(qty) as total_qty
        FROM tabWmsScanEvent
        WHERE tc_id = ?
          AND event_type = 'PACK_BOX_TO_TC'
          AND item_code IS NOT NULL
          AND qty IS NOT NULL
      `;
      const itemEventsParams = [actualTcId];

      if (scannedBoxId) {
        itemEventsQuery += ` AND box_id = ?`;
        itemEventsParams.push(scannedBoxId);
      }

      itemEventsQuery += ` GROUP BY item_code, box_id, carton_id`;

      [itemEvents] = await connection.execute(
        itemEventsQuery,
        itemEventsParams
      );

      // If no PACK_BOX_TO_TC events found, try SORT_TO_BOX events
      // This handles putaway boxes where the box_id equals the tc_id
      if (itemEvents.length === 0) {
        console.log(
          `No PACK_BOX_TO_TC events found for ${actualTcId}, checking SORT_TO_BOX events...`
        );

        // Check if tc_id matches a box_id (putaway boxes)
        [itemEvents] = await connection.execute(
          `
          SELECT 
            item_code,
            box_id,
            carton_id,
            SUM(qty) as total_qty
          FROM tabWmsScanEvent
          WHERE box_id = ?
            AND event_type = 'SORT_TO_BOX'
            AND item_code IS NOT NULL
            AND qty IS NOT NULL
          GROUP BY item_code, box_id, carton_id
        `,
          [actualTcId]
        );

        if (itemEvents.length > 0) {
          console.log(
            `Found ${itemEvents.length} items from SORT_TO_BOX events for box ${actualTcId}`
          );
        } else {
          // Last resort: Find boxes associated with this transfer carton's ASN and store
          // Then get items from those boxes via SORT_TO_BOX events
          console.log(
            `No SORT_TO_BOX events found for ${actualTcId}, checking boxes by ASN and store...`
          );

          // Determine ASN column name
          const [tableInfo] = await connection.execute(
            `DESCRIBE tabTransferCarton`
          );
          const allColumns = new Set(tableInfo.map((row) => row.Field));

          let fallbackAsnColumn;
          if (allColumns.has("asn_no")) {
            fallbackAsnColumn = "asn_no";
          } else if (allColumns.has("advance_shipping_notice")) {
            fallbackAsnColumn = "advance_shipping_notice";
          }

          // Check if store column exists
          const hasStoreColumn = allColumns.has("store");

          if (fallbackAsnColumn) {
            let tcInfoQuery = `SELECT ${fallbackAsnColumn} as asn_no`;
            if (hasStoreColumn) {
              tcInfoQuery += `, store`;
            }
            tcInfoQuery += ` FROM tabTransferCarton WHERE tc_id = ?`;

            const [tcInfo] = await connection.execute(tcInfoQuery, [
              actualTcId,
            ]);

            if (tcInfo.length > 0) {
              const asnNo = tcInfo[0].asn_no;
              const store = hasStoreColumn ? tcInfo[0].store : null;

              // Find boxes for this ASN (and store if available)
              let boxQuery = `SELECT box_id FROM tabSortBox WHERE advance_shipping_notice = ?`;
              const boxParams = [asnNo];

              if (store) {
                boxQuery += ` AND store = ?`;
                boxParams.push(store);
              }

              const [boxes] = await connection.execute(boxQuery, boxParams);

              if (boxes.length > 0) {
                const boxIds = boxes.map((b) => b.box_id);
                const placeholders = boxIds.map(() => "?").join(",");

                // Get items from SORT_TO_BOX events for these boxes
                [itemEvents] = await connection.execute(
                  `
                  SELECT 
                    item_code,
                    box_id,
                    carton_id,
                    SUM(qty) as total_qty
                  FROM tabWmsScanEvent
                  WHERE box_id IN (${placeholders})
                    AND event_type = 'SORT_TO_BOX'
                    AND item_code IS NOT NULL
                    AND qty IS NOT NULL
                  GROUP BY item_code, box_id, carton_id
                `,
                  boxIds
                );

                if (itemEvents.length > 0) {
                  console.log(
                    `Found ${itemEvents.length} items from ${
                      boxes.length
                    } boxes (ASN: ${asnNo}${store ? `, Store: ${store}` : ""})`
                  );
                }
              }
            }
          }
        }
      }
    } else if (scannedBoxId) {
      // Direct box putaway - get items from SORT_TO_BOX events
      [itemEvents] = await connection.execute(
        `
        SELECT 
          item_code,
          box_id,
          carton_id,
          SUM(qty) as total_qty
        FROM tabWmsScanEvent
        WHERE box_id = ?
          AND event_type = 'SORT_TO_BOX'
          AND item_code IS NOT NULL
          AND qty IS NOT NULL
        GROUP BY item_code, box_id, carton_id
      `,
        [scannedBoxId]
      );
    } else {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Either tc_id or box_id is required",
        },
      });
    }

    if (itemEvents.length === 0) {
      // Provide diagnostic information
      const [packEvents] = await connection.execute(
        `SELECT COUNT(*) as count FROM tabWmsScanEvent WHERE tc_id = ? AND event_type = 'PACK_BOX_TO_TC'`,
        [actualTcId || tc_id]
      );
      const [sortEvents] = await connection.execute(
        `SELECT COUNT(*) as count FROM tabWmsScanEvent WHERE box_id = ? AND event_type = 'SORT_TO_BOX'`,
        [actualTcId || tc_id || scannedBoxId]
      );

      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "NO_ITEMS_FOUND",
          message: `No items found in transfer carton ${
            actualTcId || tc_id
          }. Found ${packEvents[0]?.count || 0} PACK_BOX_TO_TC events and ${
            sortEvents[0]?.count || 0
          } SORT_TO_BOX events.`,
          details: {
            tc_id: actualTcId || tc_id,
            box_id: scannedBoxId,
            pack_events_count: packEvents[0]?.count || 0,
            sort_events_count: sortEvents[0]?.count || 0,
            suggestion:
              "Ensure boxes are packed into the transfer carton (PACK_BOX_TO_TC events) or sorted into boxes (SORT_TO_BOX events) before scanning for putaway.",
          },
        },
      });
    }

    // Get inbound session for this ASN (optional for warehouse boxes)
    const [sessionRows] = await connection.execute(
      `
      SELECT inbound_session
      FROM tabInboundSession
      WHERE asn_no = ?
      ORDER BY started_at DESC
      LIMIT 1
    `,
      [asnNo]
    );

    const inboundSession =
      sessionRows.length > 0 ? sessionRows[0].inbound_session : null;

    // Inbound session is optional for warehouse boxes (they may not go through inbound flow)
    // Only require it if this is not a direct box putaway
    if (!inboundSession && actualTcId !== null) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "NO_INBOUND_SESSION",
          message: `No inbound session found for ASN ${asnNo}`,
        },
      });
    }

    // Check if putaway task already exists
    // Priority: 1) Task provided in request, 2) Task for this box_id (if box_id provided), 3) Task for this ASN
    let putawayTaskTitle;
    let isNewTask = false;

    // First, check if putaway_task is provided in request body
    if (putaway_task) {
      const [providedTask] = await connection.execute(
        `SELECT title, status FROM tabPutawayTask WHERE title = ?`,
        [putaway_task]
      );

      if (providedTask.length > 0) {
        // Use the provided task if it exists
        putawayTaskTitle = providedTask[0].title;
        console.log(`Using provided putaway task ${putawayTaskTitle}`);
      } else {
        // Task doesn't exist - we'll create it later, but use the provided title
        putawayTaskTitle = putaway_task;
        console.log(
          `Putaway task ${putawayTaskTitle} provided but doesn't exist - will create it`
        );
      }
    }

    // If no task from request, check if putaway task exists for this box (created when box was closed)
    if (!putawayTaskTitle && scannedBoxId && actualTcId === null) {
      // Check if box_id column exists
      const [boxIdColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayTask' 
        AND COLUMN_NAME = 'box_id'
      `);
      const hasBoxId = boxIdColumns.length > 0;

      if (hasBoxId) {
        const [boxTasks] = await connection.execute(
          `
          SELECT title, status
          FROM tabPutawayTask
          WHERE box_id = ? AND status IN ('Open', 'Draft', 'In Progress')
          ORDER BY created_at DESC
          LIMIT 1
        `,
          [scannedBoxId]
        );

        if (boxTasks.length > 0) {
          putawayTaskTitle = boxTasks[0].title;
          console.log(
            `Found existing putaway task ${putawayTaskTitle} for box ${scannedBoxId}`
          );
        }
      }
    }

    // If no task found for box, check for ASN-based task
    if (!putawayTaskTitle) {
      const [existingTasks] = await connection.execute(
        `
        SELECT title, status
        FROM tabPutawayTask
        WHERE advance_shipping_notice = ?
        ORDER BY 
          CASE 
            WHEN status IN ('Draft', 'Open', 'In Progress') THEN 1
            ELSE 2
          END,
          created_at DESC
        LIMIT 1
      `,
        [asnNo]
      );

      if (existingTasks.length > 0) {
        // Use existing task
        putawayTaskTitle = existingTasks[0].title;
      }
    }

    // Check if we need to create the putaway task
    // If putawayTaskTitle is set but doesn't exist, or if no title is set, create it
    const [taskExists] = await connection.execute(
      `SELECT title FROM tabPutawayTask WHERE title = ?`,
      [putawayTaskTitle || ""]
    );

    if (!putawayTaskTitle || taskExists.length === 0) {
      // Generate new title if not provided or if provided title doesn't exist
      if (!putawayTaskTitle) {
        // Create new putaway task with standard format
        const datePrefix = new Date()
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, "");
        const [countRows] = await connection.execute(
          `
          SELECT COUNT(*) as count
          FROM tabPutawayTask
          WHERE title LIKE ?
        `,
          [`PUT-${datePrefix}%`]
        );
        const count = countRows[0].count || 0;
        const sequence = (count + 1).toString().padStart(4, "0");
        putawayTaskTitle = `PUT-${datePrefix}-${sequence}`;
      }

      // Check if source_type and box_id columns exist
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayTask' 
        AND COLUMN_NAME IN ('source_type', 'box_id')
      `);
      const hasSourceType = columns.some(
        (col) => col.COLUMN_NAME === "source_type"
      );
      const hasBoxId = columns.some((col) => col.COLUMN_NAME === "box_id");

      // Create putaway task with appropriate columns
      // Use INSERT IGNORE or handle duplicate key error gracefully
      try {
        if (hasSourceType && hasBoxId) {
          await connection.execute(
            `
            INSERT INTO tabPutawayTask 
              (title, status, source_type, box_id, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES 
              (?, 'Open', ?, ?, ?, ?, ?, NOW(), NOW())
          `,
            [
              putawayTaskTitle,
              scannedBoxId && actualTcId === null ? "Box" : "ASN",
              scannedBoxId && actualTcId === null ? scannedBoxId : null,
              asnNo,
              inboundSession,
              user_id || "SYSTEM",
            ]
          );
        } else if (hasSourceType) {
          await connection.execute(
            `
            INSERT INTO tabPutawayTask 
              (title, status, source_type, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES 
              (?, 'Open', ?, ?, ?, ?, NOW(), NOW())
          `,
            [
              putawayTaskTitle,
              scannedBoxId && actualTcId === null ? "Box" : "ASN",
              asnNo,
              inboundSession,
              user_id || "SYSTEM",
            ]
          );
        } else if (hasBoxId) {
          await connection.execute(
            `
            INSERT INTO tabPutawayTask 
              (title, status, box_id, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES 
              (?, 'Open', ?, ?, ?, ?, NOW(), NOW())
          `,
            [
              putawayTaskTitle,
              scannedBoxId && actualTcId === null ? scannedBoxId : null,
              asnNo,
              inboundSession,
              user_id || "SYSTEM",
            ]
          );
        } else {
          await connection.execute(
            `
            INSERT INTO tabPutawayTask 
              (title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at)
            VALUES 
              (?, 'Open', ?, ?, ?, NOW(), NOW())
          `,
            [putawayTaskTitle, asnNo, inboundSession, user_id || "SYSTEM"]
          );
        }

        isNewTask = true;
      } catch (insertError) {
        // Handle duplicate entry error gracefully
        if (insertError.code === "ER_DUP_ENTRY") {
          console.log(
            `Putaway task ${putawayTaskTitle} already exists - using existing task`
          );
          // Task already exists, just use it
          isNewTask = false;
        } else {
          // Re-throw other errors
          throw insertError;
        }
      }
    }

    // Lookup location if location_id is provided
    let locationInfo = null;
    let rack = null;
    let bin = null;

    if (actualLocationId) {
      try {
        locationInfo = await lookupLocationFromId(connection, actualLocationId);
        rack = locationInfo.rack;
        bin = locationInfo.bin;
        console.log(
          `[Putaway] Looked up location ${actualLocationId}: rack="${rack}", bin="${bin}"`
        );
      } catch (error) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "LOCATION_NOT_FOUND",
            message:
              error.message ||
              `Location ID "${actualLocationId}" not found or not available`,
          },
        });
      }
    } else {
      // Backward compatibility: use rack and bin directly
      rack = actualRack;
      bin = actualBin;
    }

    // Create or update putaway lines for each item
    // Use box_id as the carton_id since that's what's physically in the transfer carton
    const updatedItems = [];
    // Track processed carton+item combinations to prevent duplicates
    const processedCartonItems = new Set();

    for (const item of itemEvents) {
      const itemCode = item.item_code;
      // Use box_id for putaway since that's the physical box in the transfer carton
      // Store it in carton_id field (table doesn't have box_id column)
      const boxId = item.box_id || item.carton_id || null;
      const qty = parseFloat(item.total_qty) || 0;

      // Create a unique key for this carton+item combination
      const cartonItemKey = `${putawayTaskTitle}|${
        boxId || "NULL"
      }|${itemCode}`;

      // Skip if we've already processed this carton+item combination
      if (processedCartonItems.has(cartonItemKey)) {
        console.log(
          `[Putaway] Skipping duplicate carton+item: ${
            boxId || "NULL"
          } + ${itemCode}`
        );
        continue;
      }
      processedCartonItems.add(cartonItemKey);

      // Check if putaway line already exists (same carton, item, and location)
      // Handle NULL rack properly - if rack is NULL/empty, check for NULL/empty rack
      const rackValue = rack || "";
      const binValue = bin || "";
      const [existingLines] = await connection.execute(
        `
        SELECT id, qty, rack, bin
        FROM tabPutawayLine
        WHERE parent_title = ?
          AND item_code = ?
          AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
          AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
          AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
      `,
        [
          putawayTaskTitle,
          itemCode,
          boxId,
          boxId,
          rackValue,
          rackValue,
          rackValue,
          binValue,
          binValue,
          binValue,
        ]
      );

      if (existingLines.length > 0) {
        // Line exists with same location - update quantity if different
        const existingQty = parseFloat(existingLines[0].qty) || 0;
        // binValue already declared above, no need to redeclare
        if (Math.abs(existingQty - qty) > 0.01) {
          console.log(
            `[Putaway] Updating quantity for existing line: ${itemCode} @ ${rack}/${binValue} (${existingQty} -> ${qty})`
          );
          await connection.execute(
            `
            UPDATE tabPutawayLine
            SET qty = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
            [qty, existingLines[0].id]
          );
        } else {
          console.log(
            `[Putaway] Line already exists with same quantity: ${itemCode} @ ${rack}/${binValue}`
          );
        }
      } else {
        // Check if this carton+item already exists in a different location
        // Handle NULL rack properly - check if location is different
        const [existingDifferentLocation] = await connection.execute(
          `
          SELECT id, rack, bin, qty
          FROM tabPutawayLine
          WHERE parent_title = ?
            AND item_code = ?
            AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
            AND NOT (
              (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
              AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))
            )
        `,
          [
            putawayTaskTitle,
            itemCode,
            boxId,
            boxId,
            rackValue,
            rackValue,
            rackValue,
            binValue,
            binValue,
            binValue,
          ]
        );

        if (existingDifferentLocation.length > 0) {
          console.warn(
            `[Putaway] WARNING: Carton ${boxId} with item ${itemCode} already put away to different location: ${
              existingDifferentLocation[0].rack
            }/${
              existingDifferentLocation[0].bin || ""
            }. Updating to new location ${rack}/${bin || ""}`
          );
          // Update the existing line with new location instead of creating duplicate
          // Use rackValue and binValue (both are empty string if null) to satisfy NOT NULL constraints
          await connection.execute(
            `
            UPDATE tabPutawayLine
            SET rack = ?,
                bin = ?,
                qty = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
            [rackValue, binValue, qty, existingDifferentLocation[0].id]
          );
          console.log(
            `[Putaway] Updated existing line ID ${existingDifferentLocation[0].id} with new location`
          );
        } else {
          // No existing line found - safe to insert new line
          console.log(
            `[Putaway] Inserting new line: ${itemCode} @ ${rackValue || ""}/${
              binValue || ""
            } (carton: ${boxId || "NULL"})`
          );
          // Insert new line - store box_id in carton_id field
          // Use rackValue and binValue (both are empty string if null) to satisfy NOT NULL constraints
          await connection.execute(
            `
            INSERT INTO tabPutawayLine 
              (parent_title, carton_id, item_code, qty, rack, bin, created_at, updated_at)
            VALUES 
              (?, ?, ?, ?, ?, ?, NOW(), NOW())
          `,
            [putawayTaskTitle, boxId, itemCode, qty, rackValue, binValue]
          );
        }
      }

      updatedItems.push({
        item_code: itemCode,
        box_id: boxId,
        carton_id: boxId, // For backward compatibility
        qty: qty,
        rack: rack,
        bin: bin || null,
      });
    }

    // Update location/rack/bin only - DO NOT update stock here
    // Stock will be updated only when putaway is completed (status = "Completed")
    console.log(
      `[Putaway] Updating location for task ${putawayTaskTitle} - stock will NOT be updated (only on completion)`
    );

    // Update task status to In Progress (not Completed) so items remain visible
    // Task will be marked as Completed only when explicitly completed via /api/putaway/complete
    await connection.execute(
      `
      UPDATE tabPutawayTask 
      SET status = 'In Progress',
          updated_at = CURRENT_TIMESTAMP
      WHERE title = ?
    `,
      [putawayTaskTitle]
    );

    await connection.commit();

    res.json({
      ok: true,
      message: isNewTask
        ? "Putaway task created and items assigned successfully"
        : "Putaway task updated and items assigned successfully",
      data: {
        putaway_task: putawayTaskTitle,
        transfer_carton: actualTcId,
        box_id: scannedBoxId || null,
        asn_no: asnNo,
        status: "In Progress",
        stock_updated: false,
        rack: rack,
        bin: bin || null,
        items_count: updatedItems.length,
        items: updatedItems,
        is_new_task: isNewTask,
      },
    });
  } catch (error) {
    await connection.rollback();

    // Log detailed error information
    logger.error("Failed to scan transfer carton for putaway", {
      errorType: error?.constructor?.name || "Unknown",
      message: error?.message || "Unknown error",
      stack: error?.stack,
      requestBody: {
        tc_id: tc_id || null,
        box_id: box_id || null,
        location_id: location_id || null,
        rack: rack || null,
        bin: bin || null,
        user_id: user_id || null,
        putaway_task: putaway_task || null,
      },
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      sqlMessage: error?.sqlMessage,
    });

    // Provide more detailed error information
    const errorDetails = {
      message: error?.message || "Unknown error occurred",
      type: error?.constructor?.name || "Unknown",
    };

    // Include SQL error details if available
    if (error?.code) {
      errorDetails.code = error.code;
    }
    if (error?.sqlMessage) {
      errorDetails.sqlMessage = error.sqlMessage;
    }
    if (error?.sqlState) {
      errorDetails.sqlState = error.sqlState;
    }

    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to process transfer carton for putaway",
        details: errorDetails,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * Helper function to lookup location from tabLocation table and extract rack/bin
 * Returns {rack, bin, location_id} or throws error if location not found
 */
async function lookupLocationFromId(connection, locationId) {
  if (!locationId || locationId.trim() === "") {
    throw new Error("location_id is required");
  }

  const [locations] = await connection.execute(
    `SELECT location_id, parent_rack, bin_id, is_available
     FROM tabLocation 
     WHERE location_id = ?`,
    [locationId.trim()]
  );

  if (locations.length === 0) {
    throw new Error(
      `Location ID "${locationId}" not found in tabLocation table`
    );
  }

  const location = locations[0];

  if (!location.is_available) {
    throw new Error(`Location "${locationId}" is not available`);
  }

  // Use parent_rack as rack and bin_id as bin
  // If parent_rack is null, try to parse from location_id (fallback)
  let rack = location.parent_rack || null;
  let bin = location.bin_id || null;

  // If both are null, parse location_id (fallback parsing)
  if (!rack && !bin) {
    const parts = locationId.split("-");
    if (parts.length >= 2) {
      bin = parts[parts.length - 1];
      rack = parts.slice(0, parts.length - 1).join("-");
    } else if (parts.length === 1) {
      bin = parts[0];
      rack = null;
    }
  }

  return {
    location_id: location.location_id,
    rack: rack || "", // Use empty string if null (database column is NOT NULL)
    bin: bin || "", // Use empty string if null (database column is NOT NULL)
    is_available: Boolean(location.is_available),
  };
}

/**
 * Update existing putaway task with location (when only location is scanned)
 */
async function updatePutawayTaskLocation(
  req,
  res,
  putawayTaskTitle,
  location_id,
  user_id
) {
  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Verify putaway task exists
    const [tasks] = await connection.execute(
      `SELECT title, advance_shipping_notice FROM tabPutawayTask WHERE title = ?`,
      [putawayTaskTitle]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: `No putaway task found. Please scan the location again.`,
        },
      });
    }

    // Get all putaway lines for this task
    const [putawayLines] = await connection.execute(
      `SELECT id, item_code, carton_id, qty FROM tabPutawayLine WHERE parent_title = ?`,
      [putawayTaskTitle]
    );

    if (putawayLines.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "NO_LINES_FOUND",
          message: `Putaway task ${putawayTaskTitle} has no items to assign location`,
        },
      });
    }

    // Lookup location details from location_id
    let locationInfo = null;
    let rack = null;
    let bin = null;

    if (location_id) {
      try {
        locationInfo = await lookupLocationFromId(connection, location_id);
        rack = locationInfo.rack; // Already empty string if null from lookupLocationFromId
        bin = locationInfo.bin; // Already empty string if null from lookupLocationFromId
        console.log(
          `[Putaway] Looked up location ${location_id}: rack="${rack}", bin="${bin}"`
        );
      } catch (error) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "LOCATION_NOT_FOUND",
            message:
              error.message ||
              `Location ID "${location_id}" not found or not available`,
          },
        });
      }
    } else {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "location_id is required",
        },
      });
    }

    // Check if location_id column exists in tabPutawayLine
    const [lineLocationColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayLine' 
      AND COLUMN_NAME = 'location_id'
    `);
    const hasLineLocationIdColumn = lineLocationColumns.length > 0;

    // Update all lines with the new location
    const updatedItems = [];
    // Use empty string if bin is null (database column is NOT NULL)
    // rack and bin are already empty strings if null from lookupLocationFromId
    const rackValue = rack || "";
    const binValue = bin || "";
    for (const line of putawayLines) {
      // Build UPDATE query - include location_id if column exists
      let updateQuery = `UPDATE tabPutawayLine SET rack = ?, bin = ?`;
      const updateParams = [rackValue, binValue];
      
      if (hasLineLocationIdColumn && locationInfo && locationInfo.location_id) {
        updateQuery += `, location_id = ?`;
        updateParams.push(locationInfo.location_id);
      }
      
      updateQuery += `, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      updateParams.push(line.id);
      
      await connection.execute(updateQuery, updateParams);

      updatedItems.push({
        item_code: line.item_code,
        carton_id: line.carton_id,
        qty: parseFloat(line.qty) || 0,
        rack: rackValue,
        bin: binValue || null,
        location_id: locationInfo.location_id,
      });
    }

    // Get warehouse from ASN or use default
    const taskInfo = tasks[0];
    let warehouse = "Main Warehouse";
    if (taskInfo.advance_shipping_notice) {
      // Check if warehouse column exists in tabAdvanceShippingNotice
      const [columns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabAdvanceShippingNotice' 
        AND COLUMN_NAME = 'warehouse'
      `);
      const hasWarehouseColumn = columns.length > 0;

      if (hasWarehouseColumn) {
        const [asnInfo] = await connection.execute(
          `SELECT warehouse FROM tabAdvanceShippingNotice WHERE title = ?`,
          [taskInfo.advance_shipping_notice]
        );
        if (asnInfo.length > 0 && asnInfo[0].warehouse) {
          warehouse = asnInfo[0].warehouse;
        }
      }

      // If no warehouse from ASN, try to get default warehouse from tabWarehouse
      if (warehouse === "Main Warehouse") {
        const [defaultWarehouse] = await connection.execute(
          `SELECT name FROM tabWarehouse WHERE warehouse_type = 'Warehouse' OR name LIKE '%Main%' OR name LIKE '%WH-MAIN%' LIMIT 1`
        );
        if (defaultWarehouse.length > 0) {
          warehouse = defaultWarehouse[0].name;
        }
      }
    }

    // Update location/rack/bin only - DO NOT update stock here
    // Stock will be updated only when putaway is completed (status = "Completed")
    console.log(
      `[Putaway] Updating location for task ${putawayTaskTitle} - stock will NOT be updated (only on completion)`
    );

    // Update task status to In Progress (not Completed) so items remain visible
    // Task will be marked as Completed only when explicitly completed via /api/putaway/complete
    await connection.execute(
      `
      UPDATE tabPutawayTask 
      SET status = 'In Progress',
          updated_at = CURRENT_TIMESTAMP
      WHERE title = ?
    `,
      [putawayTaskTitle]
    );

    await connection.commit();

    res.json({
      ok: true,
      message: "Putaway task location updated successfully",
      data: {
        putaway_task: putawayTaskTitle,
        status: "In Progress",
        stock_updated: false,
        rack: rack,
        bin: bin || null,
        items_count: updatedItems.length,
        items: updatedItems,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to update putaway task location:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to update putaway task location",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
}

/**
 * POST /api/putaway/create-tasks
 * Legacy endpoint - Putaway Tasks are now auto-created
 * This endpoint exists for backward compatibility but returns success immediately
 * 
 * Note: For Transfer In, Putaway Tasks are automatically created when all items are received.
 * For ASN, Putaway Tasks are created during the receiving process.
 * This endpoint is kept for mobile app compatibility but does nothing.
 */
export const createTasks = async (req, res) => {
  // Putaway Tasks are now auto-created, so this endpoint is a no-op
  // Return success to maintain backward compatibility with mobile app
  console.log('⚠️ POST /api/putaway/create-tasks called - Putaway Tasks are auto-created, no action needed');
  
  res.json({
    ok: true,
    message: "Putaway Tasks are automatically created. No manual creation needed.",
    data: {
      note: "Putaway Tasks are created automatically when items are received. This endpoint is kept for backward compatibility.",
      auto_created: true
    }
  });
};
