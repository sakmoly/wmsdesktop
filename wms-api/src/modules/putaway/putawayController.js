// wms-api/src/modules/putaway/putawayController.js
// Putaway operations

import { getConnection } from "../../db/connection.js";
import { logger } from "../../utils/logger.js";

/**
 * Helper function to sync tabItem.stock_qty with tabStockLedger
 * Call this after any stock-affecting operation
 */
async function syncItemStock(connection, itemCode) {
  try {
    // Calculate total stock from stock ledger
    const [ledgerSum] = await connection.execute(
      `SELECT COALESCE(SUM(qty), 0) as total_qty FROM tabStockLedger WHERE item_code = ?`,
      [itemCode]
    );
    const ledgerTotal = parseFloat(ledgerSum[0].total_qty) || 0;
    
    // Update tabItem.stock_qty
    await connection.execute(
      `UPDATE tabItem SET stock_qty = ?, updated_at = NOW() WHERE code = ?`,
      [ledgerTotal, itemCode]
    );
    
    logger.info(`📊 Synced stock for ${itemCode}: ${ledgerTotal}`);
  } catch (error) {
    logger.warn(`⚠️ Failed to sync stock for ${itemCode}: ${error.message}`);
  }
}

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
 * Helper function to normalize warehouse to CODE (not name)
 * CRITICAL: tabStockLedger stores warehouse CODE, not NAME
 * @param {Object} connection - Database connection
 * @param {string} warehouse - Warehouse name or code
 * @returns {Promise<string>} - Warehouse code (e.g., "WH-MAIN")
 */
async function normalizeWarehouseToCode(connection, warehouse) {
  if (!warehouse || typeof warehouse !== 'string') {
    // Get default warehouse code
    const [defaultWarehouse] = await connection.execute(
      `SELECT code FROM tabWarehouse 
       WHERE warehouse_type = 'Warehouse' 
       ORDER BY code 
       LIMIT 1`
    );
    return defaultWarehouse.length > 0 ? defaultWarehouse[0].code : 'WH-MAIN';
  }

  const normalized = warehouse.trim();
  
  // If it's already a code (check if exists in tabWarehouse by code), return it
  const [codeCheck] = await connection.execute(
    `SELECT code FROM tabWarehouse WHERE code = ? LIMIT 1`,
    [normalized]
  );
  
  if (codeCheck.length > 0) {
    return codeCheck[0].code; // Already a code
  }
  
  // If it's a name, look up the code
  const [nameCheck] = await connection.execute(
    `SELECT code FROM tabWarehouse WHERE name = ? LIMIT 1`,
    [normalized]
  );
  
  if (nameCheck.length > 0) {
    return nameCheck[0].code;
  }
  
  // Fallback: try to find default warehouse
  const [defaultWarehouse] = await connection.execute(
    `SELECT code FROM tabWarehouse 
     WHERE warehouse_type = 'Warehouse' 
     ORDER BY code 
     LIMIT 1`
  );
  
  if (defaultWarehouse.length > 0) {
    return defaultWarehouse[0].code;
  }
  
  // Last resort: return as-is (but log warning)
  console.warn(`[Putaway] Warning: Could not normalize warehouse "${normalized}", using as-is`);
  return normalized;
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

  // Debug logging for mobile app troubleshooting
  logger.info(`[Putaway Tasks API] Request received:`, {
    status: status || 'NOT_PROVIDED',
    source_type: source_type || 'NOT_PROVIDED',
    advance_shipping_notice: advance_shipping_notice || 'NOT_PROVIDED',
    transfer_in: transfer_in || 'NOT_PROVIDED'
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
    // IMPORTANT: By default, exclude Completed tasks from list (they're already done)
    // CRITICAL: Include both "Draft" and "Open" in default to support both ASN (Draft) and Transfer In (Open)
    if (status) {
      const statusValues = status.split(',').map(s => s.trim()).filter(s => s);
      if (statusValues.length > 0) {
        const placeholders = statusValues.map(() => '?').join(',');
        conditions.push(`pt.status IN (${placeholders})`);
        params.push(...statusValues);
        logger.info(`[Putaway Tasks API] Status filter applied:`, statusValues);
      }
    } else {
      // Default: Only show tasks that are NOT completed
      // This prevents "Already Assigned" items from appearing in the list
      // CRITICAL: Include both "Draft" and "Open" to support both ASN and Transfer In putaway tasks
      // Note: When source_type is specified, we still apply this filter to exclude Completed tasks
      // but we include all non-completed statuses to be safe
      conditions.push(`pt.status NOT IN ('Completed', 'Cancelled')`);
      logger.info(`[Putaway Tasks API] Default status filter: excluding Completed and Cancelled (includes Draft, Open, In Progress)`);
    }

    // Only use source_type in WHERE clause if column exists
    if (source_type) {
      if (hasSourceType) {
        // Support multiple source types (comma-separated)
        if (source_type.includes(',')) {
          const sourceTypes = source_type.split(',').map(s => s.trim()).filter(s => s);
          if (sourceTypes.length > 0) {
            const placeholders = sourceTypes.map(() => '?').join(',');
            conditions.push(`COALESCE(pt.source_type, "ASN") IN (${placeholders})`);
            params.push(...sourceTypes);
            logger.info(`[Putaway Tasks API] Source type filter applied (multiple):`, sourceTypes);
          }
        } else {
          conditions.push('COALESCE(pt.source_type, "ASN") = ?');
          params.push(source_type);
          logger.info(`[Putaway Tasks API] Source type filter applied:`, source_type);
        }
      } else {
        // If source_type column doesn't exist and filter is "ASN", allow it (default behavior)
        // If filter is not "ASN", this won't match anything (no TransferIn tasks exist yet)
        if (source_type !== "ASN" && !source_type.includes("ASN")) {
          // Return empty result if filtering for TransferIn but column doesn't exist
          logger.warn(`[Putaway Tasks API] Filtering for ${source_type} but source_type column doesn't exist`);
          res.json({
            ok: true,
            data: [],
          });
          connection.release();
          return;
        }
        // If filtering for ASN and column doesn't exist, don't add condition (all tasks are ASN by default)
      }
    } else {
      logger.info(`[Putaway Tasks API] No source_type filter - will return all source types (ASN and TransferIn)`);
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

    logger.info(`[Putaway Tasks API] Query executed:`, {
      whereClause: whereClause || 'NO_FILTER',
      params: params,
      tasks_found: tasks.length
    });

    // Get putaway lines for each task
    if (tasks.length > 0) {
      logger.info(`[Putaway Tasks API] Tasks found:`, tasks.map(t => ({
        title: t.title,
        status: t.status,
        source_type: t.source_type,
        transfer_in: t.transfer_in || 'NULL'
      })));
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
        // For Transfer In tasks, use transfer_in as tc_id for mobile app compatibility
        const taskTcId = task.tc_id || (task.source_type === 'TransferIn' && task.transfer_in ? task.transfer_in : null);
        
        const responseTask = {
          putaway_task: task.title,
          title: task.title, // Add title field for mobile app compatibility
          box_id: task.box_id || null,
          tc_id: taskTcId, // Use transfer_in for Transfer In tasks if tc_id is not set
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

      logger.info(`[Putaway Tasks API] Returning ${formattedTasks.length} task(s) to client`);
      res.json({
        ok: true,
        data: formattedTasks,
      });
    } else {
      // No tasks found - return empty array
      logger.warn(`[Putaway Tasks API] No tasks found with filters:`, {
        status: status || 'DEFAULT (excludes Completed)',
        source_type: source_type || 'ALL',
        advance_shipping_notice: advance_shipping_notice || 'ALL',
        transfer_in: transfer_in || 'ALL'
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
 * GET /api/putaway/tasks/:taskId
 * Get a single putaway task by task ID
 *
 * URL Parameters:
 * - taskId - Putaway task ID (e.g., PUT-20260123-0001)
 */
export const getTaskById = async (req, res) => {
  const { taskId } = req.params;

  if (!taskId) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Task ID is required",
      },
    });
  }

  logger.info(`[Putaway Task API] Request received for task: ${taskId}`);

  const connection = await getConnection();

  try {
    // Check if optional columns exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('source_type', 'transfer_in', 'warehouse')
    `);

    const hasSourceType = columns.some((col) => col.COLUMN_NAME === "source_type");
    const hasTransferIn = columns.some((col) => col.COLUMN_NAME === "transfer_in");
    const hasWarehouse = columns.some((col) => col.COLUMN_NAME === "warehouse");

    const sourceTypeSelect = hasSourceType ? "pt.source_type" : "NULL as source_type";
    const transferInSelect = hasTransferIn ? "pt.transfer_in" : "NULL as transfer_in";
    const warehouseSelect = hasWarehouse ? "pt.warehouse" : "NULL as warehouse";

    // Get the task
    const [tasks] = await connection.execute(
      `SELECT 
        pt.title,
        pt.status,
        ${sourceTypeSelect},
        pt.advance_shipping_notice,
        ${transferInSelect},
        ${warehouseSelect},
        pt.created_at,
        pt.created_by,
        pt.updated_at
      FROM tabPutawayTask pt
      WHERE pt.title = ?`,
      [taskId]
    );

    if (tasks.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: `Putaway task "${taskId}" not found`,
        },
      });
    }

    const task = tasks[0];

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

    // Get putaway lines for this task
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
      WHERE pl.parent_title = ?
      ORDER BY pl.item_code
    `,
      [taskId]
    );

    // Format lines
    const formattedLines = lines.map((line) => ({
      item_code: line.item_code,
      qty: parseFloat(line.qty) || 0,
      carton_id: line.carton_id || null,
      rack: line.rack || null,
      bin: line.bin || null,
      location_id: line.location_id || null,
    }));

    // Format task response
    const responseTask = {
      title: task.title,
      status: task.status,
      source_type: task.source_type,
      warehouse: task.warehouse,
      created_at: task.created_at ? task.created_at.toISOString() : null,
      created_by: task.created_by,
      updated_at: task.updated_at ? task.updated_at.toISOString() : null,
      items: formattedLines,
    };

    // Add source-specific fields
    if (task.source_type === 'ASN' && task.advance_shipping_notice) {
      responseTask.advance_shipping_notice = task.advance_shipping_notice;
      responseTask.asn_no = task.advance_shipping_notice; // Alias for mobile app
    }

    if (task.source_type === 'TransferIn' && task.transfer_in) {
      responseTask.transfer_in = task.transfer_in;
      responseTask.transfer_in_number = task.transfer_in; // Alias for mobile app
    }

    logger.info(`[Putaway Task API] Returning task ${taskId} with ${formattedLines.length} line(s)`);
    
    res.json({
      ok: true,
      data: responseTask,
    });
  } catch (error) {
    logger.error("Failed to get putaway task", {
      taskId,
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
        message: "Failed to get putaway task",
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
  const { putaway_task, carton_id, item_code, location_id, rack, bin, qty, user_id } =
    req.body;

  // Validation: Accept either location_id (preferred) or rack (backward compatibility)
  if (!putaway_task || (!location_id && !rack)) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "putaway_task and location_id (or rack) are required",
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

    let actualRack = rack;
    let actualBin = bin;
    let actualLocationId = location_id;

    // If location_id is provided, look it up to get rack and bin
    if (location_id) {
      try {
        const locationInfo = await lookupLocationFromId(connection, location_id);
        actualRack = locationInfo.rack;
        actualBin = locationInfo.bin;
        actualLocationId = locationInfo.location_id;
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

    // Update or insert putaway line
    if (carton_id && item_code && qty !== undefined) {
      // Use empty string if bin is null (database column is NOT NULL)
      const binValue = actualBin || "";
      
      let insertQuery = `
        INSERT INTO tabPutawayLine 
          (parent_title, carton_id, item_code, qty, rack, bin`;
      const insertParams = [putaway_task, carton_id, item_code, qty, actualRack, binValue];
      
      if (hasLineLocationIdColumn && actualLocationId) {
        insertQuery += `, location_id`;
        insertParams.push(actualLocationId);
      }
      
      insertQuery += `)
        VALUES (?, ?, ?, ?, ?, ?`;
      
      if (hasLineLocationIdColumn && actualLocationId) {
        insertQuery += `, ?`;
      }
      
      insertQuery += `)
        ON DUPLICATE KEY UPDATE
          rack = VALUES(rack),
          bin = VALUES(bin),
          qty = VALUES(qty)`;
      
      if (hasLineLocationIdColumn && actualLocationId) {
        insertQuery += `,
          location_id = VALUES(location_id)`;
      }
      
      insertQuery += `,
          updated_at = CURRENT_TIMESTAMP`;
      
      await connection.execute(insertQuery, insertParams);
    } else {
      // Just update rack for the task (if no specific line)
      await connection.execute(
        `
        UPDATE tabPutawayTask 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE title = ?
      `,
        [actualPutawayTask]
      );
    }

    await connection.commit();

    res.json({
      ok: true,
      message: "Location assigned successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Failed to assign location:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to assign location",
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
  const { putaway_task, performed_by, items, location_id, tc_id, box_id } = req.body; // Added tc_id and box_id for mobile app compatibility

  const connection = await getConnection();
  
  // CRITICAL: Declare actualBoxId BEFORE try block to ensure it's accessible in catch block
  // This prevents "actualBoxId is not defined" error when rollback happens early
  let actualBoxId = box_id || null;
  let boxStatus = null;

  try {
    await connection.beginTransaction();

    // CRITICAL FIX: For putaway, use box_id (not tc_id) - Putaway is BOX-based
    // If box_id is provided, validate box exists and check idempotency (already closed?)
    
    if (box_id) {
      // Validate box exists in tabSortBox and check status (idempotency)
      const [boxRows] = await connection.execute(
        `SELECT box_id, status, advance_shipping_notice, store
         FROM tabSortBox
         WHERE box_id = ?
         FOR UPDATE`,
        [box_id]
      );

      let boxRow = boxRows.length > 0 ? boxRows[0] : null;
      let usedTaskDeclaredSortBox = false;

      if (!boxRow && putaway_task) {
        const pt = String(putaway_task).trim();
        const dec = await resolveDeclaredBoxIdFromPutawayTask(connection, pt, box_id);
        if (dec) {
          const [tMeta] = await connection.execute(
            `SELECT advance_shipping_notice, warehouse, status FROM tabPutawayTask WHERE title = ? LIMIT 1`,
            [pt]
          );
          const tm = tMeta[0] || {};
          boxRow = {
            box_id: dec.boxId,
            status: tm.status || "Open",
            advance_shipping_notice: tm.advance_shipping_notice ?? dec.advance_shipping_notice,
            store: tm.warehouse ?? dec.warehouse ?? null,
          };
          usedTaskDeclaredSortBox = true;
          logger.info(
            `[Putaway complete] tabSortBox miss for ${box_id}; using task-declared box on task ${pt}`
          );
        }
      }

      if (!boxRow) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "BOX_NOT_FOUND",
            message: `Putaway box ${box_id} not found in tabSortBox. Box must be created during sorting before putaway, or use putaway_task with tabPutawayTask.box_id set.`,
          },
        });
      }

      boxStatus = boxRow.status;
      actualBoxId = boxRow.box_id;

      // IDEMPOTENCY: If box is already closed, check if task is actually completed
      // If task is NOT completed, reopen box and allow putaway to proceed (retry after error)
      if (boxStatus === "Closed" && !usedTaskDeclaredSortBox) {
        // Check if box_id column exists in tabPutawayLine
        const [lineColumnsCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabPutawayLine'
            AND COLUMN_NAME = 'box_id'
        `);
        const hasLineBoxId = lineColumnsCheck.length > 0;
        
        // Build WHERE clause conditionally
        let whereClause = 'carton_id = ?';
        let whereParams = [box_id];
        if (hasLineBoxId) {
          whereClause += ' OR box_id = ?';
          whereParams.push(box_id);
        }
        
        // Find the putaway task for this box
        const [taskFromBox] = await connection.execute(
          `SELECT DISTINCT parent_title 
           FROM tabPutawayLine 
           WHERE ${whereClause}
           ORDER BY parent_title DESC 
           LIMIT 1`,
          whereParams
        );
        
        const completedTask = taskFromBox.length > 0 ? taskFromBox[0].parent_title : null;
        
        // Check if task is actually completed
        let taskIsCompleted = false;
        if (completedTask) {
          const [taskStatusCheck] = await connection.execute(
            `SELECT status FROM tabPutawayTask WHERE title = ? LIMIT 1`,
            [completedTask]
          );
          
          if (taskStatusCheck.length > 0) {
            const actualTaskStatus = taskStatusCheck[0].status;
            taskIsCompleted = (actualTaskStatus === 'Completed' || actualTaskStatus === 'Closed');
            
            // If task is NOT completed, reopen box and allow retry
            if (!taskIsCompleted) {
              logger.warn(`[Putaway] Box ${box_id} is Closed but task ${completedTask} is ${actualTaskStatus} - reopening box for retry`);
              
              // Reopen the box
              const [sortBoxStatusCol] = await connection.execute(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabSortBox' 
                AND COLUMN_NAME = 'status'
              `);
              
              if (sortBoxStatusCol.length > 0) {
                await connection.execute(
                  `UPDATE tabSortBox
                   SET status = 'Open', updated_at = CURRENT_TIMESTAMP
                   WHERE box_id = ?`,
                  [box_id]
                );
                
                logger.info(`[Putaway] ✅ Reopened box ${box_id} for putaway retry (task ${completedTask} is ${actualTaskStatus})`);
                // Continue with putaway - box is now Open, don't return early
              } else {
                logger.warn(`[Putaway] ⚠️ Cannot reopen box ${box_id} - status column not found, but allowing putaway to proceed`);
                // Continue with putaway anyway
              }
            }
          }
        }
        
        // Only return success if task is actually completed (true idempotency)
        if (taskIsCompleted) {
          await connection.commit();
          connection.release();
          
          logger.info(`[Putaway] Box ${box_id} already closed and task ${completedTask} is completed - idempotent response`, {
            box_id: box_id,
            putaway_task: completedTask
          });
          
          return res.json({
            ok: true,
            already_completed: true,
            box_id: box_id,
            putaway_task: completedTask,
            message: "Putaway already completed (idempotent - box already closed and task completed)"
          });
        }
        // If task is NOT completed, continue with putaway (box has been reopened above)
      }
    }

    // Support multiple ways to identify putaway task:
    // 1. putaway_task (direct task ID) - preferred
    // 2. box_id - look up task from putaway lines (CRITICAL: Use box_id for putaway, not tc_id)
    // 3. tc_id - only for Transfer In putaway (not ASN putaway)
    let actualPutawayTask = putaway_task;
    
    if (!actualPutawayTask && (box_id || tc_id)) {
      // CRITICAL: Check if tc_id is a putaway task title (PUT- or TI-PUT-)
      // For Transfer In putaway, mobile app sends putaway task title as tc_id
      const isPutawayTaskTitle = tc_id && (tc_id.startsWith('PUT-') || tc_id.startsWith('TI-PUT-'));
      
      if (isPutawayTaskTitle) {
        // tc_id is the putaway task title - verify it exists
        const [taskCheck] = await connection.execute(
          `SELECT title FROM tabPutawayTask WHERE title = ? LIMIT 1`,
          [tc_id]
        );
        if (taskCheck.length > 0) {
          actualPutawayTask = tc_id;
          logger.info(`[Putaway] Using tc_id as putaway task title: ${tc_id}`);
        }
      }
      
      if (!actualPutawayTask) {
        // CRITICAL: For putaway, prefer box_id over tc_id
        const searchId = box_id || tc_id;
        
        // Try to find putaway task from box_id/carton_id in putaway lines
        // Check if box_id column exists in tabPutawayLine
        const [lineColumnsCheck2] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabPutawayLine'
            AND COLUMN_NAME = 'box_id'
        `);
        const hasLineBoxId2 = lineColumnsCheck2.length > 0;
        
        // Build WHERE clause conditionally
        let whereClause2 = 'carton_id = ?';
        let whereParams2 = [searchId];
        if (hasLineBoxId2) {
          whereClause2 += ' OR box_id = ?';
          whereParams2.push(searchId);
        }
        
        const [taskFromCarton] = await connection.execute(
          `SELECT DISTINCT parent_title 
           FROM tabPutawayLine 
           WHERE ${whereClause2}
           ORDER BY parent_title DESC 
           LIMIT 1`,
          whereParams2
        );
        
        if (taskFromCarton.length > 0) {
          actualPutawayTask = taskFromCarton[0].parent_title;
          logger.info(`[Putaway] Found putaway task ${actualPutawayTask} from ${box_id ? 'box_id' : 'tc_id'}: ${searchId}`);
        } else {
        // Try to find from putaway task's box_id or tc_id column (if exists)
        const [taskColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayTask' 
          AND COLUMN_NAME IN ('box_id', 'tc_id')
        `);
        const hasBoxId = taskColumns.some(col => col.COLUMN_NAME === 'box_id');
        const hasTcId = taskColumns.some(col => col.COLUMN_NAME === 'tc_id');
        
        // Prefer box_id for putaway
        if (hasBoxId && box_id) {
          const [taskFromBoxId] = await connection.execute(
            `SELECT title FROM tabPutawayTask WHERE box_id = ? ORDER BY created_at DESC LIMIT 1`,
            [box_id]
          );
          if (taskFromBoxId.length > 0) {
            actualPutawayTask = taskFromBoxId[0].title;
            logger.info(`[Putaway] Found putaway task ${actualPutawayTask} from box_id ${box_id}`);
          }
        }
        
        // Only use tc_id if box_id didn't work (for Transfer In putaway)
        if (!actualPutawayTask && hasTcId && tc_id && !box_id) {
          const [taskFromTcId] = await connection.execute(
            `SELECT title FROM tabPutawayTask WHERE tc_id = ? ORDER BY created_at DESC LIMIT 1`,
            [tc_id]
          );
          if (taskFromTcId.length > 0) {
            actualPutawayTask = taskFromTcId[0].title;
            logger.info(`[Putaway] Found putaway task ${actualPutawayTask} from tc_id ${tc_id}`);
          }
        }
      }
    }
    }

    // Validation
    if (!actualPutawayTask) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "putaway_task, tc_id, or box_id is required. No putaway task found for the provided identifier.",
          details: {
            provided: {
              putaway_task: putaway_task || null,
              tc_id: tc_id || null,
              box_id: box_id || null
            },
            suggestion: "Please provide a valid putaway_task ID, or a tc_id/box_id that exists in putaway lines."
          }
        },
      });
    }

    // Verify putaway task exists
    const [tasks] = await connection.execute(
      `SELECT title, status FROM tabPutawayTask WHERE title = ?`,
      [actualPutawayTask]
    );

    if (tasks.length === 0) {
      // CRITICAL: If task doesn't exist but we have tc_id or box_id, create the task
      // This handles the case where scan step is validation-only (doesn't create task)
      if (tc_id || box_id) {
        logger.info("Putaway task not found - creating from box/carton", {
          tc_id: tc_id || null,
          box_id: box_id || null,
        });

        // Get ASN from transfer carton or box
        let asnNo = null;
        let inboundSession = null;

        if (tc_id) {
          const [tcInfo] = await connection.execute(
            `SELECT advance_shipping_notice, inbound_session 
             FROM tabTransferCarton 
             WHERE tc_id = ? LIMIT 1`,
            [tc_id]
          );
          if (tcInfo.length > 0) {
            asnNo = tcInfo[0].advance_shipping_notice || null;
            inboundSession = tcInfo[0].inbound_session || null;
          }
        } else if (box_id) {
          // Get ASN from box's advance_shipping_notice
          const [boxInfo] = await connection.execute(
            `SELECT advance_shipping_notice 
             FROM tabSortBox 
             WHERE box_id = ? LIMIT 1`,
            [box_id]
          );
          if (boxInfo.length > 0) {
            asnNo = boxInfo[0].advance_shipping_notice || null;
          }

          // Try to get inbound session from ASN
          if (asnNo) {
            const [sessionInfo] = await connection.execute(
              `SELECT inbound_session 
               FROM tabInboundSession 
               WHERE asn_no = ? 
               ORDER BY started_at DESC 
               LIMIT 1`,
              [asnNo]
            );
            if (sessionInfo.length > 0) {
              inboundSession = sessionInfo[0].inbound_session || null;
            }
          }
        }

        // Generate new task title
        const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const [countRows] = await connection.execute(
          `SELECT COUNT(*) as count FROM tabPutawayTask WHERE title LIKE ?`,
          [`PUT-${datePrefix}%`]
        );
        const count = countRows[0].count || 0;
        const sequence = (count + 1).toString().padStart(4, "0");
        actualPutawayTask = `PUT-${datePrefix}-${sequence}`;

        // Check if source_type column exists
        const [taskColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayTask' 
          AND COLUMN_NAME IN ('source_type', 'box_id', 'tc_id')
        `);
        const hasSourceType = taskColumns.some(col => col.COLUMN_NAME === 'source_type');
        const hasBoxId = taskColumns.some(col => col.COLUMN_NAME === 'box_id');
        const hasTcId = taskColumns.some(col => col.COLUMN_NAME === 'tc_id');

        // Determine source_type
        let sourceType = 'ASN';
        if (asnNo) {
          sourceType = 'ASN';
        } else if (tc_id && tc_id.includes('TI-') || tc_id?.startsWith('CTN-TI-')) {
          sourceType = 'Transfer In';
        }

        // Build INSERT query
        let insertFields = `title, status, advance_shipping_notice, inbound_session, created_by, created_at, updated_at`;
        let insertValues = `?, 'Draft', ?, ?, ?, NOW(), NOW()`;
        const insertParams = [actualPutawayTask, asnNo, inboundSession, performed_by || "SYSTEM"];

        if (hasSourceType) {
          insertFields += `, source_type`;
          insertValues += `, ?`;
          insertParams.push(sourceType);
        }
        if (hasBoxId && box_id) {
          insertFields += `, box_id`;
          insertValues += `, ?`;
          insertParams.push(box_id);
        }
        if (hasTcId && tc_id) {
          insertFields += `, tc_id`;
          insertValues += `, ?`;
          insertParams.push(tc_id);
        }

        await connection.execute(
          `INSERT INTO tabPutawayTask (${insertFields}) VALUES (${insertValues})`,
          insertParams
        );

        logger.info(`Created putaway task: ${actualPutawayTask} for ${box_id || tc_id}`);
      } else {
        // No tc_id or box_id - cannot create task, return error
        const datePrefix =
          actualPutawayTask.length >= 11
            ? actualPutawayTask.substring(0, 11)
            : actualPutawayTask.substring(0, Math.min(11, actualPutawayTask.length));
        const sequence =
          actualPutawayTask.length >= 4
            ? actualPutawayTask.substring(actualPutawayTask.length - 4)
            : actualPutawayTask;

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
            message: `Putaway task ${actualPutawayTask} not found.${suggestion}`,
            suggestions:
              similarTasks.length > 0 ? similarTasks.map((t) => t.title) : [],
          },
        });
      }
    }

    // Re-query task to get status after potential creation
    const [tasksAfterCreate] = await connection.execute(
      `SELECT title, status FROM tabPutawayTask WHERE title = ?`,
      [actualPutawayTask]
    );
    
    if (tasksAfterCreate.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(500).json({
        ok: false,
        error: {
          code: "TASK_CREATION_FAILED",
          message: `Failed to create putaway task ${actualPutawayTask}`,
        },
      });
    }

    const currentStatus = tasksAfterCreate[0].status;

    // Idempotency: If task is already completed, return success without duplicate stock updates
    // This allows retry without errors
    if (currentStatus === "Completed") {
      await connection.rollback();
      connection.release();
      
      // Return success response (idempotent) - stock already updated
      return res.json({
        ok: true,
        step: "COMPLETE",
        message: "Putaway task already completed (idempotent)",
        data: {
          putaway_task: actualPutawayTask,
          putaway_task_id: actualPutawayTask,
          status: "Completed",
          stock_updated: true,
          already_completed: true
        }
      });
    }
    
    // Validate task is in correct state for completion
    if (currentStatus !== "In Progress" && currentStatus !== "Open") {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        step: "COMPLETE",
        error: {
          code: "INVALID_TASK_STATUS",
          message: `Putaway task ${actualPutawayTask} cannot be completed. Current status: ${currentStatus}. Task must be "In Progress" or "Open". Please scan location first.`,
        },
      });
    }
    
    // Check if location_id, rack, bin columns exist in tabPutawayTask
    const [taskLocationColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('location_id', 'rack', 'bin')
    `);
    const hasTaskLocationId = taskLocationColumns.some(col => col.COLUMN_NAME === 'location_id');
    const hasTaskRack = taskLocationColumns.some(col => col.COLUMN_NAME === 'rack');
    const hasTaskBin = taskLocationColumns.some(col => col.COLUMN_NAME === 'bin');
    
    // Build SELECT statement conditionally for tabPutawayTask
    const taskLocationIdSelect = hasTaskLocationId ? "location_id" : "NULL as location_id";
    const taskRackSelect = hasTaskRack ? "rack" : "NULL as rack";
    const taskBinSelect = hasTaskBin ? "bin" : "NULL as bin";
    
    // Lock task row FOR UPDATE to prevent double completion
    // This ensures atomic completion even if called concurrently
    const [lockedTask] = await connection.execute(
      `SELECT status, ${taskLocationIdSelect}, ${taskRackSelect}, ${taskBinSelect} FROM tabPutawayTask WHERE title = ? FOR UPDATE`,
      [actualPutawayTask]
    );
    
    if (lockedTask.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        ok: false,
        step: "COMPLETE",
        error: {
          code: "TASK_NOT_FOUND",
          message: `Putaway task ${actualPutawayTask} not found.`,
        },
      });
    }
    
    // Validate location was scanned (to_location_id must exist)
    // Location can be in: 1) Request body (header-level), 2) Task header, 3) Putaway lines
    let taskLocationId = lockedTask[0].location_id || null;
    let taskRack = lockedTask[0].rack || null;
    let taskBin = lockedTask[0].bin || null;
    
    // Priority 1: Check request body location_id (header-level location)
    if (location_id && location_id.trim() !== '') {
      taskLocationId = location_id.trim();
      console.log(`[Putaway] Using header-level location_id from request: ${taskLocationId}`);
    }
    
    // Priority 2: If location not in request body or task header, check putaway lines
    if (!taskLocationId && !taskRack) {
      // Get location from putaway lines (location might be assigned at line level)
      const [lineLocationColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayLine' 
        AND COLUMN_NAME IN ('location_id', 'rack', 'bin')
      `);
      const hasLineLocationId = lineLocationColumns.some(col => col.COLUMN_NAME === 'location_id');
      const hasLineRack = lineLocationColumns.some(col => col.COLUMN_NAME === 'rack');
      const hasLineBin = lineLocationColumns.some(col => col.COLUMN_NAME === 'bin');
      
      // Build WHERE clause to check for location in lines
      let whereClause = 'pl.parent_title = ?';
      if (hasLineLocationId) {
        whereClause += ' AND pl.location_id IS NOT NULL';
      } else if (hasLineRack) {
        whereClause += ' AND pl.rack IS NOT NULL';
      } else if (hasLineBin) {
        whereClause += ' AND pl.bin IS NOT NULL';
      }
      
      const lineLocationIdSelect = hasLineLocationId ? "pl.location_id" : "NULL as location_id";
      const lineRackSelect = hasLineRack ? "pl.rack" : "NULL as rack";
      const lineBinSelect = hasLineBin ? "pl.bin" : "NULL as bin";
      
      const [lineLocations] = await connection.execute(
        `SELECT DISTINCT ${lineLocationIdSelect}, ${lineRackSelect}, ${lineBinSelect}
         FROM tabPutawayLine pl
         WHERE ${whereClause}
         LIMIT 1`,
        [actualPutawayTask]
      );
      
      if (lineLocations.length > 0) {
        taskLocationId = lineLocations[0].location_id || null;
        taskRack = lineLocations[0].rack || null;
        taskBin = lineLocations[0].bin || null;
        console.log(`[Putaway] ✅ Found location in putaway lines: location_id=${taskLocationId || 'NULL'}, rack=${taskRack || 'NULL'}, bin=${taskBin || 'NULL'}`);
      } else {
        console.log(`[Putaway] ⚠️ No location found in putaway lines for task ${actualPutawayTask}`);
      }
    }
    
    // Final validation: location must exist in task header OR lines
    if (!taskLocationId && !taskRack) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        step: "COMPLETE",
        error: {
          code: "LOCATION_NOT_SCANNED",
          message: `Cannot complete putaway: location not scanned. Please scan location first using POST /api/putaway/scan-transfer-carton.`,
        },
      });
    }

    // CRITICAL: Update task status to Completed ONLY after all stock updates succeed
    // This ensures atomic completion - if any stock update fails, status remains "In Progress"
    // Status update happens at the END, just before commit
    // (Moved to end of function, before commit)

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
      [actualPutawayTask]
    );

    // Support header-level location_id: if provided, apply to all items
    // This allows scanning location once for entire box instead of per item
    // NOTE: Lookup location early so it can be used when creating putaway lines
    let headerLocationInfo = null;
    if (location_id && location_id.trim() !== "") {
      try {
        headerLocationInfo = await lookupLocationFromId(
          connection,
          location_id
        );
        logger.info(
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

    // CRITICAL: If no putaway lines exist, create them from box/carton contents
    // This handles the case where scan step is validation-only (doesn't create lines)
    if (putawayLines.length === 0 && (tc_id || box_id)) {
      logger.info("No putaway lines found - creating from box/carton contents", {
        putaway_task: actualPutawayTask,
        tc_id: tc_id || null,
        box_id: box_id || null,
      });

      const cartonIdToUse = box_id || tc_id;
      let itemsFromEvents = [];

      // Try to get items from SORT_TO_BOX events (for box_id)
      if (box_id) {
        const [boxItems] = await connection.execute(
          `SELECT item_code, box_id, carton_id, SUM(qty) as total_qty
           FROM tabWmsScanEvent
           WHERE event_type = 'SORT_TO_BOX'
             AND box_id = ?
             AND item_code IS NOT NULL
           GROUP BY item_code, box_id, carton_id`,
          [box_id]
        );
        
        if (boxItems.length > 0) {
          itemsFromEvents = boxItems.map(item => ({
            item_code: item.item_code,
            carton_id: item.box_id || item.carton_id || null, // Use box_id as carton_id for putaway
            qty: parseFloat(item.total_qty) || 0,
          }));
          logger.info(`Found ${itemsFromEvents.length} items from SORT_TO_BOX events for box ${box_id}`);
        }
      }

      // Try to get items from PACK_BOX_TO_TC events (for tc_id)
      if (itemsFromEvents.length === 0 && tc_id) {
        const [tcItems] = await connection.execute(
          `SELECT item_code, box_id, carton_id, SUM(qty) as total_qty
           FROM tabWmsScanEvent
           WHERE event_type = 'PACK_BOX_TO_TC'
             AND tc_id = ?
             AND item_code IS NOT NULL
           GROUP BY item_code, box_id, carton_id`,
          [tc_id]
        );
        
        if (tcItems.length > 0) {
          itemsFromEvents = tcItems.map(item => ({
            item_code: item.item_code,
            carton_id: item.box_id || item.carton_id || tc_id, // Use box_id or tc_id
            qty: parseFloat(item.total_qty) || 0,
          }));
          logger.info(`Found ${itemsFromEvents.length} items from PACK_BOX_TO_TC events for tc_id ${tc_id}`);
        }
      }

      // If still no items, try to get from box_id using PACK_BOX_TO_TC (box might be packed into TC)
      if (itemsFromEvents.length === 0 && box_id) {
        const [packedItems] = await connection.execute(
          `SELECT item_code, box_id, carton_id, SUM(qty) as total_qty
           FROM tabWmsScanEvent
           WHERE event_type = 'PACK_BOX_TO_TC'
             AND box_id = ?
             AND item_code IS NOT NULL
           GROUP BY item_code, box_id, carton_id`,
          [box_id]
        );
        
        if (packedItems.length > 0) {
          itemsFromEvents = packedItems.map(item => ({
            item_code: item.item_code,
            carton_id: item.box_id || item.carton_id || null,
            qty: parseFloat(item.total_qty) || 0,
          }));
          logger.info(`Found ${itemsFromEvents.length} items from PACK_BOX_TO_TC events for box ${box_id}`);
        }
      }

      // Create putaway lines from events
      if (itemsFromEvents.length > 0) {
        const [lineLocationColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayLine' 
          AND COLUMN_NAME IN ('location_id', 'rack', 'bin')
        `);
        const hasLineLocationIdColumn = lineLocationColumns.some(col => col.COLUMN_NAME === 'location_id');
        const hasLineRack = lineLocationColumns.some(col => col.COLUMN_NAME === 'rack');
        const hasLineBin = lineLocationColumns.some(col => col.COLUMN_NAME === 'bin');

        // Get location values from header location_id if provided
        let rackValue = 'TBD';
        let binValue = 'TBD';
        let locationIdValue = null;
        
        if (headerLocationInfo) {
          rackValue = headerLocationInfo.rack || 'TBD';
          binValue = headerLocationInfo.bin || 'TBD';
          locationIdValue = headerLocationInfo.location_id || null;
        }

        for (const item of itemsFromEvents) {
          // Check if line already exists
          const [existingLine] = await connection.execute(
            `SELECT id FROM tabPutawayLine 
             WHERE parent_title = ? 
               AND item_code = ? 
               AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
             LIMIT 1`,
            [actualPutawayTask, item.item_code, item.carton_id, item.carton_id]
          );

          if (existingLine.length === 0) {
            // Create new putaway line
            let insertQuery = `INSERT INTO tabPutawayLine 
              (parent_title, carton_id, item_code, qty, rack, bin`;
            const insertParams = [
              actualPutawayTask,
              item.carton_id || null,
              item.item_code,
              item.qty,
              rackValue,
              binValue,
            ];

            if (hasLineLocationIdColumn && locationIdValue) {
              insertQuery += `, location_id`;
              insertParams.push(locationIdValue);
            }

            insertQuery += `, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?`;
            
            if (hasLineLocationIdColumn && locationIdValue) {
              insertQuery += `, ?`;
            }
            
            insertQuery += `, NOW(), NOW())`;

            await connection.execute(insertQuery, insertParams);
            logger.info(`Created putaway line: ${item.item_code} (qty: ${item.qty}, carton: ${item.carton_id || 'NULL'})`);
          }
        }

        // Re-query putaway lines after creating them
        const [newPutawayLines] = await connection.execute(
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
          [actualPutawayTask]
        );
        
        // Replace putawayLines with newly created lines
        putawayLines.length = 0;
        putawayLines.push(...newPutawayLines);
        
        logger.info(`Created ${putawayLines.length} putaway line(s) from events`);
      } else {
        logger.warn(`No items found in events for ${cartonIdToUse} - cannot create putaway lines`);
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "NO_ITEMS_FOUND",
            message: `No items found for ${cartonIdToUse}. Items must be sorted into box or packed into transfer carton before putaway.`,
            details: `Please ensure SORT_TO_BOX or PACK_BOX_TO_TC events exist for ${cartonIdToUse}`,
          },
        });
      }
    }

    // If items are provided in request body, validate they have carton_id
    if (items && Array.isArray(items) && items.length > 0) {
      const itemsWithoutCartonId = items.filter((item) => {
        const cartonId = item.box_id || item.carton_id;
        return !cartonId || (typeof cartonId === 'string' && cartonId.trim() === '');
      });
      
      if (itemsWithoutCartonId.length > 0) {
        await connection.rollback();
        connection.release();
        console.error(
          `[Putaway] Validation failed: ${
            itemsWithoutCartonId.length
          } items in request missing carton_id: ${itemsWithoutCartonId
            .map((i) => i.item_code || 'UNKNOWN')
            .join(", ")}`
        );
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Cannot complete putaway: some items in request are missing carton ID",
            details: `Items without carton_id: ${itemsWithoutCartonId
              .map((i) => i.item_code || 'UNKNOWN')
              .join(", ")}. Please provide carton_id (or box_id) for all items in the request.`,
          },
        });
      }
    }

    // If items are provided in request body, use them to create/update putaway lines and process for stock
    // This allows completing putaway even if lines don't exist in database yet
    // IMPORTANT: Check if items already exist in putawayLines to prevent duplicate processing
    if (items && Array.isArray(items) && items.length > 0) {
      // Validate that all items have carton_id (required for inventory tracking)
      const itemsWithoutCartonId = items.filter((item) => {
        const cartonId = item.box_id || item.carton_id;
        return !cartonId || (typeof cartonId === 'string' && cartonId.trim() === '');
      });
      
      if (itemsWithoutCartonId.length > 0) {
        await connection.rollback();
        connection.release();
        console.error(
          `[Putaway] Validation failed: ${
            itemsWithoutCartonId.length
          } items in request missing carton_id: ${itemsWithoutCartonId
            .map((i) => i.item_code || 'UNKNOWN')
            .join(", ")}`
        );
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Cannot complete putaway: some items in request are missing carton ID",
            details: `Items without carton_id: ${itemsWithoutCartonId
              .map((i) => i.item_code || 'UNKNOWN')
              .join(", ")}. Please provide carton_id (or box_id) for all items in the request.`,
          },
        });
      }
      
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

          // Check if location_id, rack, and bin columns exist in tabPutawayLine
          const [lineLocationColumns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabPutawayLine' 
            AND COLUMN_NAME IN ('location_id', 'rack', 'bin')
          `);
          const hasLineLocationIdColumn = lineLocationColumns.some(col => col.COLUMN_NAME === 'location_id');
          const hasLineRack = lineLocationColumns.some(col => col.COLUMN_NAME === 'rack');
          const hasLineBin = lineLocationColumns.some(col => col.COLUMN_NAME === 'bin');

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
          
          const existingLineParams = [actualPutawayTask, item.item_code];
          
          if (hasLineLocationIdColumn && itemLocationId) {
            // If location_id column exists and we have a location_id, check by location_id first
            existingLineQuery += ` AND (location_id = ? OR (location_id IS NULL AND ? IS NULL))`;
            existingLineParams.push(itemLocationId, itemLocationId);
          } else {
            // Fallback to rack+bin check (only if columns exist)
            if (hasLineRack && hasLineBin) {
              existingLineQuery += ` AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))
                 AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))`;
              existingLineParams.push(rackValue, rackValue, rackValue, binValue, binValue, binValue);
            } else if (hasLineRack) {
              existingLineQuery += ` AND (rack = ? OR (rack IS NULL AND ? = '') OR (rack = '' AND ? IS NULL))`;
              existingLineParams.push(rackValue, rackValue, rackValue);
            } else if (hasLineBin) {
              existingLineQuery += ` AND (bin = ? OR (bin IS NULL AND ? = '') OR (bin = '' AND ? IS NULL))`;
              existingLineParams.push(binValue, binValue, binValue);
            }
            // If neither rack nor bin columns exist, skip location check (match by item+carton only)
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
            let updateQuery = `UPDATE tabPutawayLine SET qty = ?`;
            const updateParams = [item.qty];
            
            // Include rack and bin in UPDATE only if columns exist
            if (hasLineRack) {
              updateQuery += `, rack = ?`;
              updateParams.push(rackValue);
            }
            if (hasLineBin) {
              updateQuery += `, bin = ?`;
              updateParams.push(binValue);
            }
            
            updateQuery += `, carton_id = COALESCE(?, carton_id)`;
            updateParams.push(itemCartonId);
            
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
            const rackSelect = hasLineRack ? "rack," : "NULL as rack,";
            const binSelect = hasLineBin ? "bin," : "NULL as bin,";
            const [anyExistingLine] = await connection.execute(
              `SELECT id, ${rackSelect} ${binSelect} carton_id FROM tabPutawayLine 
               WHERE parent_title = ? 
                 AND item_code = ? 
                 AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))
               LIMIT 1`,
              [actualPutawayTask, item.item_code, itemCartonId, itemCartonId]
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
                  [actualPutawayTask, item.item_code]
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
                  actualPutawayTask,
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
        // Also prefer non-null carton_id if one exists
        // Duplicates can occur when items are in both DB lines and request body
        const existing = uniqueLinesMap.get(key);
        const existingQty = parseFloat(existing.qty) || 0;
        const newQty = parseFloat(line.qty) || 0;
        existing.qty = Math.max(existingQty, newQty);
        
        // Update carton_id if existing doesn't have one but new one does
        if (!existing.carton_id && line.carton_id) {
          existing.carton_id = line.carton_id;
          console.log(
            `[Putaway] Updated carton_id for ${line.item_code} from NULL to ${line.carton_id}`
          );
        }
        
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
    
    // Refresh putawayLines from database to ensure we have the latest carton_id values
    // This is important if items were provided in request and updated the lines
    if (items && Array.isArray(items) && items.length > 0) {
      const [refreshedLines] = await connection.execute(
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
        [actualPutawayTask]
      );
      
      // Update putawayLines with refreshed carton_id values
      for (const refreshedLine of refreshedLines) {
        const existingLine = putawayLines.find(
          (l) => l.item_code === refreshedLine.item_code &&
                 (l.rack || "") === (refreshedLine.rack || "") &&
                 (l.bin || "") === (refreshedLine.bin || "")
        );
        if (existingLine && refreshedLine.carton_id) {
          existingLine.carton_id = refreshedLine.carton_id;
          console.log(
            `[Putaway] Refreshed carton_id for ${refreshedLine.item_code}: ${refreshedLine.carton_id}`
          );
        }
      }
    }

    // Get warehouse from ASN or Transfer In (same logic for both)
    // CRITICAL: Check for both source_type and transfer_in columns to support both ASN and Transfer In
    const [taskColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('advance_shipping_notice', 'transfer_in', 'source_type', 'warehouse')
    `);
    const hasAdvanceShippingNotice = taskColumns.some(col => col.COLUMN_NAME === 'advance_shipping_notice');
    const hasTransferIn = taskColumns.some(col => col.COLUMN_NAME === 'transfer_in');
    const hasSourceType = taskColumns.some(col => col.COLUMN_NAME === 'source_type');
    const hasWarehouse = taskColumns.some(col => col.COLUMN_NAME === 'warehouse');
    
    let taskSelectQuery = `SELECT`;
    if (hasAdvanceShippingNotice) taskSelectQuery += ` advance_shipping_notice`;
    if (hasTransferIn) taskSelectQuery += hasAdvanceShippingNotice ? `, transfer_in` : ` transfer_in`;
    if (hasSourceType) taskSelectQuery += (hasAdvanceShippingNotice || hasTransferIn) ? `, source_type` : ` source_type`;
    if (hasWarehouse) taskSelectQuery += (hasAdvanceShippingNotice || hasTransferIn || hasSourceType) ? `, warehouse` : ` warehouse`;
    taskSelectQuery += ` FROM tabPutawayTask WHERE title = ?`;
    
    const [taskInfo] = await connection.execute(taskSelectQuery, [actualPutawayTask]);

    // Get warehouse from ASN or Transfer In (same method for both)
    // CRITICAL: Normalize warehouse to CODE (not name) for stock ledger consistency
    let warehouse = null;
    
    if (taskInfo.length > 0) {
      const task = taskInfo[0];
      const isTransferInTask = (hasSourceType && task.source_type === 'TransferIn') || (hasTransferIn && task.transfer_in);
      
      if (isTransferInTask) {
        // Transfer In putaway: Get warehouse from transfer_in or putaway task
        if (hasWarehouse && task.warehouse) {
          warehouse = task.warehouse;
        } else if (hasTransferIn && task.transfer_in) {
          // Get warehouse from tabTransferIn.to_warehouse
          const [transferInInfo] = await connection.execute(
            `SELECT to_warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
            [task.transfer_in]
          );
          if (transferInInfo.length > 0 && transferInInfo[0].to_warehouse) {
            warehouse = transferInInfo[0].to_warehouse;
          }
        }
      } else if (hasAdvanceShippingNotice && task.advance_shipping_notice) {
        // ASN putaway: Get warehouse from ASN
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
            [task.advance_shipping_notice]
          );
          if (warehouseRows.length > 0 && warehouseRows[0].warehouse) {
            warehouse = warehouseRows[0].warehouse;
          }
        }
      }
    }
    
    // Normalize warehouse to CODE (not name) - CRITICAL for stock ledger consistency
    warehouse = await normalizeWarehouseToCode(connection, warehouse);

    // CRITICAL: Update existing lines with TBD locations if header location_id is provided
    // This handles the case where lines were created without location, and now location is being provided
    if (headerLocationInfo && putawayLines.length > 0) {
      const [lineLocationColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayLine' 
        AND COLUMN_NAME IN ('location_id', 'rack', 'bin')
      `);
      const hasLineLocationIdColumn = lineLocationColumns.some(col => col.COLUMN_NAME === 'location_id');
      const hasLineRack = lineLocationColumns.some(col => col.COLUMN_NAME === 'rack');
      const hasLineBin = lineLocationColumns.some(col => col.COLUMN_NAME === 'bin');

      // Find lines with TBD locations or missing locations
      const linesToUpdate = putawayLines.filter(line => {
        const rack = (line.rack || "").trim().toUpperCase();
        const bin = (line.bin || "").trim().toUpperCase();
        const locationId = line.location_id || null;
        return (rack === 'TBD' || bin === 'TBD' || (!locationId && (!rack || rack === 'TBD') && (!bin || bin === 'TBD')));
      });

      if (linesToUpdate.length > 0) {
        logger.info(`Updating ${linesToUpdate.length} putaway line(s) with TBD locations using header location_id: ${headerLocationInfo.location_id}`);
        
        for (const line of linesToUpdate) {
          let updateQuery = `UPDATE tabPutawayLine SET`;
          const updateParams = [];
          const updateFields = [];

          if (hasLineRack) {
            updateFields.push(`rack = ?`);
            updateParams.push(headerLocationInfo.rack || null);
          }
          if (hasLineBin) {
            updateFields.push(`bin = ?`);
            updateParams.push(headerLocationInfo.bin || null);
          }
          if (hasLineLocationIdColumn) {
            updateFields.push(`location_id = ?`);
            updateParams.push(headerLocationInfo.location_id);
          }
          
          updateFields.push(`updated_at = NOW()`);
          updateQuery += ` ${updateFields.join(', ')} WHERE parent_title = ? AND item_code = ?`;
          
          // Match by carton_id if available, otherwise just by item_code
          if (line.carton_id) {
            updateQuery += ` AND (carton_id = ? OR (carton_id IS NULL AND ? IS NULL))`;
            updateParams.push(actualPutawayTask, line.item_code, line.carton_id, line.carton_id);
          } else {
            updateParams.push(actualPutawayTask, line.item_code);
          }

          await connection.execute(updateQuery, updateParams);
          
          // Update the in-memory line object
          line.rack = headerLocationInfo.rack || null;
          line.bin = headerLocationInfo.bin || null;
          line.location_id = headerLocationInfo.location_id;
        }

        // Re-query putaway lines after updating them
        const [updatedLines] = await connection.execute(
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
          [actualPutawayTask]
        );
        
        // Replace putawayLines with updated lines
        putawayLines.length = 0;
        putawayLines.push(...updatedLines);
        
        logger.info(`Updated ${linesToUpdate.length} putaway line(s) with location ${headerLocationInfo.location_id}`);
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

    // Validate that all putaway lines being processed have carton_id before processing stock
    // CRITICAL: Carton ID is required for proper inventory tracking
    // IMPORTANT: If items are provided in request, only validate those items (partial completion)
    // If no items provided, validate all lines (full completion)
    let linesToValidate = putawayLines;
    if (items && Array.isArray(items) && items.length > 0) {
      // Only validate lines that match items in the request (partial completion)
      const requestedItemCodes = new Set(items.map(item => item.item_code));
      linesToValidate = putawayLines.filter(line => requestedItemCodes.has(line.item_code));
      console.log(
        `[Putaway] Partial completion: Validating ${linesToValidate.length} line(s) from request (${putawayLines.length} total lines in task)`
      );
    } else {
      // No items in request - validate all lines (full completion)
      console.log(
        `[Putaway] Full completion: Validating all ${putawayLines.length} line(s) in task`
      );
    }
    
    const linesWithoutCartonId = linesToValidate.filter((line) => {
      const cartonId = line.carton_id;
      return !cartonId || (typeof cartonId === 'string' && cartonId.trim() === '');
    });

    if (linesWithoutCartonId.length > 0) {
      await connection.rollback();
      connection.release();
      console.error(
        `[Putaway] Validation failed: ${
          linesWithoutCartonId.length
        } items missing carton_id: ${linesWithoutCartonId
          .map((l) => l.item_code)
          .join(", ")}`
      );
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Cannot complete putaway: some items are missing carton ID",
          details: `Items without carton_id: ${linesWithoutCartonId
            .map((l) => l.item_code)
            .join(
              ", "
            )}. Please ensure all items have a carton_id before completing putaway. Carton ID is required for proper inventory tracking.`,
        },
      });
    }
    
    // Filter putawayLines to only include lines being processed (for stock updates)
    // This ensures we only process stock for items in the request (if provided)
    // Note: Create a new array instead of reassigning const variable
    let linesToProcess = [...putawayLines]; // Create a copy
    
    logger.info(`[Putaway] Preparing to process stock updates`, {
      putaway_task: actualPutawayTask,
      total_putaway_lines: putawayLines.length,
      items_in_request: items && Array.isArray(items) ? items.length : 0,
      lines_before_filter: linesToProcess.length
    });
    
    if (items && Array.isArray(items) && items.length > 0) {
      const requestedItemCodes = new Set(items.map(item => item.item_code));
      const originalCount = linesToProcess.length;
      linesToProcess = linesToProcess.filter(line => requestedItemCodes.has(line.item_code));
      logger.info(
        `[Putaway] Filtered putawayLines: ${originalCount} -> ${linesToProcess.length} (only processing items from request)`,
        {
          requested_items: Array.from(requestedItemCodes),
          filtered_lines: linesToProcess.map(l => l.item_code)
        }
      );
    }
    
    if (linesToProcess.length === 0) {
      logger.error(`[Putaway] ⚠️ CRITICAL: No lines to process for stock updates!`, {
        putaway_task: actualPutawayTask,
        total_putaway_lines: putawayLines.length,
        items_in_request: items && Array.isArray(items) ? items.length : 0,
        putaway_lines: putawayLines.map(l => ({
          item_code: l.item_code,
          location_id: l.location_id || 'NULL',
          rack: l.rack || 'NULL',
          bin: l.bin || 'NULL'
        }))
      });
    }

    const { findMissingItemCodesInMaster: findMissingForComplete } = await import(
      "../../utils/itemMasterValidate.js"
    );
    const completeMissingItems = await findMissingForComplete(
      connection,
      linesToProcess.map((l) => l.item_code)
    );
    if (completeMissingItems.length > 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "ITEM_NOT_IN_MASTER",
          message: `Cannot complete putaway: item code(s) not in Item master (tabItem): ${completeMissingItems.join(", ")}. Sync or create items before posting stock.`,
          missing_item_codes: completeMissingItems,
        },
      });
    }

    // Check if qty_before, qty_reduced, and carton_id columns exist (check once, outside loop)
    const [stockLedgerColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME IN ('qty_before', 'qty_reduced', 'carton_id')
    `);
    const hasQtyBefore = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_before');
    const hasQtyReduced = stockLedgerColumns.some(col => col.COLUMN_NAME === 'qty_reduced');
    const hasStockLedgerCartonIdColumn = stockLedgerColumns.some(col => col.COLUMN_NAME === 'carton_id');

    // VALIDATION: Check all lines have valid location and carton_id before processing
    const linesWithMissingData = [];
    for (const line of linesToProcess) {
      const itemCode = line.item_code;
      const cartonId = line.carton_id || null;
      const cartonIdValue = cartonId && cartonId.trim() !== '' ? cartonId.trim() : null;
      const rack = (line.rack || "").trim() || null;
      const bin = (line.bin || "").trim() || null;
      
      // Determine bin location
      let binLocation = line.location_id || null;
      if (!binLocation) {
        if (rack && bin) {
          binLocation = `${rack}-${bin}`;
        } else if (rack) {
          binLocation = rack;
        } else if (bin) {
          binLocation = bin;
        }
      }
      
      // Validate location is not NULL, empty, or "TBD"
      // CRITICAL: If location_id is provided and valid, use it (rack/bin may still be TBD during update)
      // Only require rack/bin to be non-TBD if location_id is not available
      const hasValidLocationId = binLocation && 
                                 binLocation.trim() !== '' && 
                                 binLocation.trim().toUpperCase() !== 'TBD' &&
                                 !binLocation.includes('TBD');
      
      const hasValidRackBin = rack && rack.trim() !== '' && rack.trim().toUpperCase() !== 'TBD' &&
                               bin && bin.trim() !== '' && bin.trim().toUpperCase() !== 'TBD';
      
      // Location is valid if either location_id is valid OR rack/bin are valid
      const hasValidLocation = hasValidLocationId || hasValidRackBin;
      
      // Validate carton_id is not NULL or empty
      const hasValidCartonId = cartonIdValue && cartonIdValue.trim() !== '';
      
      if (!hasValidLocation || !hasValidCartonId) {
        linesWithMissingData.push({
          item_code: itemCode,
          missing_location: !hasValidLocation,
          missing_carton_id: !hasValidCartonId,
          location_value: binLocation || 'NULL',
          rack_value: rack || 'NULL',
          bin_value: bin || 'NULL',
          carton_id_value: cartonIdValue || 'NULL'
        });
      }
    }
    
    // If any lines are missing required data, reject the completion
    if (linesWithMissingData.length > 0) {
      await connection.rollback();
      connection.release();
      const missingLocationItems = linesWithMissingData.filter(l => l.missing_location).map(l => l.item_code);
      const missingCartonItems = linesWithMissingData.filter(l => l.missing_carton_id).map(l => l.item_code);
      
      let errorMessage = 'Cannot complete putaway: some items are missing required data.';
      if (missingLocationItems.length > 0) {
        errorMessage += ` Items missing location (rack/bin): ${missingLocationItems.join(', ')}.`;
      }
      if (missingCartonItems.length > 0) {
        errorMessage += ` Items missing carton_id: ${missingCartonItems.join(', ')}.`;
      }
      errorMessage += ' Please assign location (rack/bin) and ensure carton_id is set for all items before completing putaway.';
      
      console.error(`[Putaway] Validation failed: ${linesWithMissingData.length} line(s) missing required data:`, linesWithMissingData);
      
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: errorMessage,
          details: {
            lines_with_missing_data: linesWithMissingData,
            missing_location_count: missingLocationItems.length,
            missing_carton_id_count: missingCartonItems.length
          }
        },
      });
    }
    
    // Update stock ledger for each putaway line
    // CRITICAL: Use a Set to track processed item+location combinations to prevent duplicate stock updates
    const processedStockKeys = new Set();
    const stockUpdates = [];
    
    logger.info(`[Putaway] Starting stock update loop for ${linesToProcess.length} line(s)`, {
      putaway_task: actualPutawayTask,
      lines_count: linesToProcess.length,
      lines: linesToProcess.map(l => ({
        item_code: l.item_code,
        qty: l.qty,
        location_id: l.location_id || 'NULL',
        rack: l.rack || 'NULL',
        bin: l.bin || 'NULL',
        carton_id: l.carton_id || 'NULL'
      }))
    });
    
    for (const line of linesToProcess) {
      const itemCode = line.item_code;
      const qty = parseFloat(line.qty) || 0;
      const rack = (line.rack || "").trim() || null;
      const bin = (line.bin || "").trim() || null;

      // Validate location is present (at least location_id, rack, or bin must be non-empty and not TBD)
      // This should not happen due to validation above, but safety check
      const hasLocationId = line.location_id && 
                           line.location_id.trim() !== '' && 
                           line.location_id.trim().toUpperCase() !== 'TBD';
      const hasRack = rack && rack.trim() !== '' && rack.trim().toUpperCase() !== 'TBD';
      const hasBin = bin && bin.trim() !== '' && bin.trim().toUpperCase() !== 'TBD';
      
      if (!hasLocationId && !hasRack && !hasBin) {
        logger.error(`[Putaway] ERROR: Line without valid location passed validation: ${itemCode}`, {
          location_id: line.location_id || 'NULL',
          rack: rack || 'NULL',
          bin: bin || 'NULL'
        });
        continue; // Skip lines without valid location
      }

      // Use location_id as bin_location (preferred) or combine rack and bin
      let binLocation = line.location_id || null;
      if (!binLocation) {
        // Fallback: combine rack and bin if location_id not available
        // CRITICAL: Check if rack already contains the bin value to avoid duplication
        // If rack is "A1-R02-L1-B2" and bin is "B2", don't concatenate (would create "A1-R02-L1-B2-B2")
        if (rack && bin) {
          const rackStr = String(rack).trim();
          const binStr = String(bin).trim();
          
          // Check if rack already ends with the bin value
          if (rackStr.endsWith(`-${binStr}`) || rackStr === binStr) {
            // Rack already contains the bin, use rack as-is
            binLocation = rackStr;
          } else {
            // Rack doesn't contain bin, concatenate them
            binLocation = `${rackStr}-${binStr}`;
          }
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

      // Extract carton_id from putaway line (needed for determining from_location)
      const cartonId = line.carton_id || null;
      const cartonIdValue = cartonId && cartonId.trim() !== '' ? cartonId.trim() : null;
      
      // VALIDATION: Carton must be received before putaway
      // Check if carton exists in tabCartonStock with qty > 0 (carton is received)
      if (cartonIdValue) {
        const [cartonStockTable] = await connection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabCartonStock'
        `);
        
        if (cartonStockTable.length > 0) {
          // Check if carton exists and has stock (received)
          const [cartonReceivedCheck] = await connection.execute(
            `SELECT SUM(qty) as total_qty
             FROM tabCartonStock
             WHERE carton_id = ? AND item_code = ? AND warehouse = ?
             GROUP BY carton_id, item_code, warehouse`,
            [cartonIdValue, itemCode, warehouse]
          );
          
          if (cartonReceivedCheck.length === 0 || parseFloat(cartonReceivedCheck[0].total_qty || 0) <= 0) {
            console.warn(`[Putaway] ⚠️ Carton ${cartonIdValue} with item ${itemCode} not received (no stock in tabCartonStock)`);
            // Continue processing but log warning (carton might be in staging/receiving)
            // This is a warning, not an error, as carton might be newly received
          } else {
            console.log(`[Putaway] ✅ Carton ${cartonIdValue} validated as received (qty: ${cartonReceivedCheck[0].total_qty})`);
          }
        }
        
        // Also check tabCarton.status if available
        const [cartonStatusTable] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCarton'
          AND COLUMN_NAME = 'status'
        `);
        
        if (cartonStatusTable.length > 0) {
          const [cartonStatus] = await connection.execute(
            `SELECT status FROM tabCarton WHERE carton_id = ? LIMIT 1`,
            [cartonIdValue]
          );
          
          if (cartonStatus.length > 0) {
            const status = cartonStatus[0].status;
            // Allow putaway if status is RECEIVED_NOT_PUTAWAY, PUTAWAY, or similar
            // Reject if status is SHIPPED, ADJUSTED, or other final states
            if (status && ['SHIPPED', 'ADJUSTED'].includes(status.toUpperCase())) {
              await connection.rollback();
              connection.release();
              return res.status(400).json({
                ok: false,
                error: {
                  code: "CARTON_NOT_AVAILABLE",
                  message: `Carton ${cartonIdValue} cannot be putaway (status: ${status}). Carton must be received first.`,
                },
              });
            }
          }
        }
      }
      
      // CRITICAL: Determine FROM location (staging location) before putaway
      // This implements the MOVE pattern: decrease from staging, increase at target
      let fromLocation = null;
      let fromLocationQty = 0;
      
      if (cartonIdValue) {
        // Try to get carton's current location from tabCartonStock (most accurate)
        const [cartonStockTable] = await connection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabCartonStock'
        `);
        
        if (cartonStockTable.length > 0) {
          // Get carton's current location from tabCartonStock
          const [cartonCurrentLocation] = await connection.execute(
            `SELECT DISTINCT bin_location, SUM(qty) as total_qty
             FROM tabCartonStock
             WHERE carton_id = ? AND item_code = ? AND warehouse = ?
             GROUP BY bin_location
             ORDER BY total_qty DESC
             LIMIT 1`,
            [cartonIdValue, itemCode, warehouse]
          );
          
          if (cartonCurrentLocation.length > 0 && cartonCurrentLocation[0].bin_location) {
            fromLocation = cartonCurrentLocation[0].bin_location;
            fromLocationQty = parseFloat(cartonCurrentLocation[0].total_qty) || 0;
            console.log(`[Putaway] 📦 Found carton ${cartonIdValue} at FROM location: ${fromLocation} (qty: ${fromLocationQty})`);
          }
        }
        
        // Fallback: Check tabCarton.current_bin_id if not found in tabCartonStock
        if (!fromLocation) {
          const [cartonTable] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabCarton'
            AND COLUMN_NAME IN ('current_bin_id', 'bin_id')
          `);
          
          if (cartonTable.length > 0) {
            const binColumn = cartonTable.some(col => col.COLUMN_NAME === 'current_bin_id') 
              ? 'current_bin_id' 
              : 'bin_id';
            
            const [cartonBin] = await connection.execute(
              `SELECT ${binColumn} as bin_location FROM tabCarton WHERE carton_id = ? LIMIT 1`,
              [cartonIdValue]
            );
            
            if (cartonBin.length > 0 && cartonBin[0].bin_location) {
              fromLocation = cartonBin[0].bin_location;
              console.log(`[Putaway] 📦 Found carton ${cartonIdValue} FROM location from tabCarton: ${fromLocation}`);
            }
          }
        }
      }
      
      // If still no from_location, default to staging location or receiving dock
      // This handles cases where carton hasn't been putaway yet (newly received)
      if (!fromLocation) {
        // Try to find staging/receiving location from location master
        const [stagingLocation] = await connection.execute(
          `SELECT location_id FROM tabLocation 
           WHERE (location_type = 'STAGING' OR location_type = 'RECEIVING' OR location_id LIKE '%STAGE%' OR location_id LIKE '%DOCK%')
           AND warehouse = ?
           ORDER BY location_id
           LIMIT 1`,
          [warehouse]
        );
        
        if (stagingLocation.length > 0) {
          fromLocation = stagingLocation[0].location_id;
          console.log(`[Putaway] 📦 Using default staging location: ${fromLocation}`);
        } else {
          // Last resort: use a generic staging location name
          fromLocation = 'STAGING-01';
          console.log(`[Putaway] ⚠️ No staging location found, using default: ${fromLocation}`);
        }
      }
      
      // STEP 1: Decrease stock at FROM location (staging) - MOVE pattern
      // Note: For staging locations, we typically don't track by carton_id (bin-level only)
      // But if carton_id is provided and the FROM location has carton-specific stock, we should handle it
      if (fromLocation && fromLocation !== binLocation) {
        // Build query with optional carton_id filter
        let fromStockQuery = `SELECT qty, reserved_qty FROM tabStockLedger
           WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))`;
        const fromStockParams = [itemCode, warehouse, fromLocation, fromLocation];
        
        // If carton_id is provided and stock ledger supports it, try to find carton-specific stock first
        // Otherwise, fall back to bin-level stock (for staging areas)
        if (hasStockLedgerCartonIdColumn && cartonIdValue) {
          fromStockQuery += ` AND (carton_id = ? OR carton_id IS NULL)`;
          fromStockParams.push(cartonIdValue);
          // Order by carton_id DESC to prefer carton-specific records over bin-level
          fromStockQuery += ` ORDER BY carton_id DESC LIMIT 1`;
        }
        
        const [fromStock] = await connection.execute(fromStockQuery, fromStockParams);
        
        const fromCurrentQty = fromStock.length > 0 ? parseFloat(fromStock[0].qty) || 0 : 0;
        const fromCurrentReservedQty = fromStock.length > 0 ? parseFloat(fromStock[0].reserved_qty) || 0 : 0;
        const fromNewQty = Math.max(0, fromCurrentQty - qty); // Decrease, but don't go negative
        
        if (fromNewQty > 0) {
          // Build INSERT/UPDATE query for FROM location
          // For staging locations, we typically don't include carton_id (bin-level tracking)
          // But if the FROM location already has carton-specific stock, we should maintain it
          let fromInsertFields = `item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at`;
          let fromInsertValues = `?, ?, ?, ?, ?, NOW(), 'Putaway', ?, NOW(), NOW()`;
          let fromInsertParams = [itemCode, warehouse, fromLocation, fromNewQty, fromCurrentReservedQty, actualPutawayTask];
          
          let fromUpdateFields = `qty = ?, last_transaction_date = NOW(), last_transaction_type = 'Putaway', last_transaction_ref = ?, updated_at = NOW()`;
          let fromUpdateParams = [fromNewQty, actualPutawayTask];
          
          // Only include carton_id if FROM location already has carton-specific stock
          // (This is rare for staging areas, but handles edge cases)
          if (hasStockLedgerCartonIdColumn && cartonIdValue && fromStock.length > 0 && fromStock[0].carton_id) {
            fromInsertFields += `, carton_id`;
            fromInsertValues += `, ?`;
            fromInsertParams.push(cartonIdValue);
            fromUpdateFields += `, carton_id = ?`;
            fromUpdateParams.push(cartonIdValue);
          }
          
          await connection.execute(
            `INSERT INTO tabStockLedger (${fromInsertFields})
             VALUES (${fromInsertValues})
             ON DUPLICATE KEY UPDATE ${fromUpdateFields}`,
            [...fromInsertParams, ...fromUpdateParams]
          );
          console.log(`[Putaway] 📉 Decreased stock at FROM location ${fromLocation}: ${fromCurrentQty} → ${fromNewQty} (qty: -${qty})`);
        } else {
          // Delete entry if qty becomes 0
          let deleteQuery = `DELETE FROM tabStockLedger WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))`;
          const deleteParams = [itemCode, warehouse, fromLocation, fromLocation];
          
          // If carton_id is provided and was in the FROM location stock, include it in DELETE
          if (hasStockLedgerCartonIdColumn && cartonIdValue && fromStock.length > 0 && fromStock[0].carton_id) {
            deleteQuery += ` AND (carton_id = ? OR carton_id IS NULL)`;
            deleteParams.push(cartonIdValue);
          }
          
          await connection.execute(deleteQuery, deleteParams);
          console.log(`[Putaway] 🗑️ Removed stock ledger entry at FROM location ${fromLocation} (qty became 0)`);
        }
      }
      
      // STEP 2: Increase stock at TO location (target) - MOVE pattern
      // Get current stock at target location
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

      // cartonIdValue already extracted above
      
      // Build INSERT/UPDATE query with optional qty_before, qty_reduced, and carton_id
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
      
      // Include carton_id in stock ledger if column exists and carton_id is provided
      if (hasStockLedgerCartonIdColumn && cartonIdValue) {
        insertFields += `, carton_id`;
        insertValues += `, ?`;
        insertParams.push(cartonIdValue);
        updateFields += `, carton_id = ?`;
        updateParams.push(cartonIdValue);
        console.log(`[Putaway] 📦 Including carton_id in stock ledger: ${cartonIdValue} for ${itemCode} @ ${binLocation}`);
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

      // Update tabCartonStock if carton_id is provided (for carton-level inventory tracking)
      // Note: cartonId was already extracted above
      if (cartonIdValue) {
        // Check if tabCartonStock table exists
        const [cartonStockTable] = await connection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabCartonStock'
        `);
        
        if (cartonStockTable.length > 0 && binLocation) {
          try {
            // MOVE pattern: Decrease from staging location, increase at target location
            if (fromLocation && fromLocation !== binLocation) {
              // STEP 1: Decrease carton stock at FROM location
              const [fromCartonStock] = await connection.execute(
                `SELECT qty FROM tabCartonStock 
                 WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?`,
                [cartonIdValue, itemCode, warehouse, fromLocation]
              );
              
              const fromCartonQty = fromCartonStock.length > 0 
                ? parseFloat(fromCartonStock[0].qty) || 0 
                : 0;
              const fromNewCartonQty = Math.max(0, fromCartonQty - qty);
              
              if (fromNewCartonQty > 0) {
                // Update carton stock at FROM location (decrease)
                await connection.execute(`
                  UPDATE tabCartonStock 
                  SET qty = ?, updated_at = NOW()
                  WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?
                `, [fromNewCartonQty, cartonIdValue, itemCode, warehouse, fromLocation]);
                console.log(`[Putaway] 📦 Decreased carton stock at FROM ${fromLocation}: ${fromCartonQty} → ${fromNewCartonQty}`);
              } else {
                // Delete carton stock entry at FROM location if qty becomes 0
                await connection.execute(`
                  DELETE FROM tabCartonStock 
                  WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?
                `, [cartonIdValue, itemCode, warehouse, fromLocation]);
                console.log(`[Putaway] 🗑️ Removed carton stock at FROM ${fromLocation} (qty became 0)`);
              }
            }
            
            // STEP 2: Increase carton stock at TO location (target)
            const [currentCartonStock] = await connection.execute(
              `SELECT qty FROM tabCartonStock 
               WHERE carton_id = ? AND item_code = ? AND warehouse = ? AND bin_location = ?`,
              [cartonIdValue, itemCode, warehouse, binLocation]
            );
            
            const currentCartonQty = currentCartonStock.length > 0 
              ? parseFloat(currentCartonStock[0].qty) || 0 
              : 0;
            const newCartonQty = currentCartonQty + qty;
            
            // Update or insert carton stock at TO location
            await connection.execute(`
              INSERT INTO tabCartonStock 
                (carton_id, item_code, warehouse, bin_location, qty, status)
              VALUES 
                (?, ?, ?, ?, ?, 'PUTAWAY')
              ON DUPLICATE KEY UPDATE
                qty = VALUES(qty),
                updated_at = NOW(),
                status = 'PUTAWAY',
                bin_location = VALUES(bin_location)
            `, [cartonIdValue, itemCode, warehouse, binLocation, newCartonQty]);
            
            console.log(`[Putaway] 📦 Updated tabCartonStock: carton_id=${cartonIdValue}, item=${itemCode}, qty=${currentCartonQty} → ${newCartonQty}, bin=${binLocation}`);
            
            // Also update tabCarton.current_bin_id to reflect new location
            const [cartonTable] = await connection.execute(`
              SELECT COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabCarton'
              AND COLUMN_NAME = 'current_bin_id'
            `);
            
            if (cartonTable.length > 0) {
              await connection.execute(`
                UPDATE tabCarton
                SET current_bin_id = ?, updated_at = NOW()
                WHERE carton_id = ? AND warehouse = ?
              `, [binLocation, cartonIdValue, warehouse]);
              console.log(`[Putaway] 📦 Updated tabCarton.current_bin_id to ${binLocation}`);
            }
          } catch (cartonStockError) {
            console.warn(`[Putaway] ⚠️ Could not update tabCartonStock: ${cartonStockError.message}`);
            // Don't fail the transaction - stock ledger is already updated
          }
        }
      }

      // Insert stock transaction log
      // CRITICAL: Only require bin_location to be valid (carton_id is optional)
      // Transaction history should be created even if carton_id is NULL
      if (!binLocation || binLocation.trim() === '' || binLocation.includes('TBD')) {
        console.error(`[Putaway] ⚠️ Skipping transaction for ${itemCode}: bin_location="${binLocation || 'NULL'}" is invalid`);
        continue; // Skip this line - bin_location is required
      }
      
      // Check if carton_id column exists in tabStockTransaction
      const [stockTransactionColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockTransaction' 
        AND COLUMN_NAME = 'carton_id'
      `);
      const hasStockTransactionCartonId = stockTransactionColumns.length > 0;
      
      // Check if bin_location column exists and is required
      const [binLocationColCheck] = await connection.execute(`
        SELECT COLUMN_NAME, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabStockTransaction' 
        AND COLUMN_NAME = 'bin_location'
      `);
      const hasBinLocation = binLocationColCheck.length > 0;
      const binLocationRequired = hasBinLocation && binLocationColCheck[0].IS_NULLABLE === 'NO';
      
      // Build transaction fields and values
      // Always include carton_id if column exists (even if NULL)
      const txnFields = ['transaction_date', 'transaction_type', 'reference_doc_type', 'reference_doc',
                        'item_code', 'warehouse'];
      const txnValues = [new Date(), 'Putaway', 'Putaway Task', actualPutawayTask,
                        itemCode, warehouse];
      
      // Add bin_location if column exists
      if (hasBinLocation) {
        txnFields.push('bin_location');
        txnValues.push(binLocation);
      }
      
      // Add carton_id if column exists (include even if NULL for consistency)
      if (hasStockTransactionCartonId) {
        txnFields.push('carton_id');
        txnValues.push(cartonIdValue || null); // Allow NULL carton_id
      }
      
      // Add remaining fields
      txnFields.push('qty_change', 'qty_before', 'qty_after', 'source_bin', 'target_bin', 'performed_by', 'created_at');
      txnValues.push(qty, currentQty, newQty, fromLocation, binLocation, performed_by || "SYSTEM", new Date());
      
      // Insert transaction history (always insert, even if carton_id is NULL)
      try {
        await connection.execute(
          `
          INSERT INTO tabStockTransaction (${txnFields.join(', ')})
          VALUES (${txnFields.map(() => '?').join(', ')})
        `,
          txnValues
        );
      } catch (txnError) {
        logger.error(`[Putaway] ❌ ERROR inserting transaction history for ${itemCode}`, {
          error: txnError.message,
          fields: txnFields,
          values: txnValues
        });
        // Don't throw - continue processing other items, but log the error
        // Transaction will be rolled back at the end if needed
      }
      
      // NOTE: tabTransactionHistory insertion is handled by processPutawayCompletionEvent
      // which is called later in this function. This prevents duplicate records.

      logger.info(`[Putaway] ✅ Stock update completed for ${itemCode}`, {
        item_code: itemCode,
        carton_id: cartonIdValue || 'NULL',
        from_location: fromLocation || 'NULL',
        to_location: binLocation,
        qty: qty,
        qty_before: currentQty,
        qty_after: newQty
      });
      
      stockUpdates.push({
        item_code: itemCode,
        location: binLocation || "Warehouse",
        carton_id: cartonIdValue || null,
        qty_added: qty,
        qty_before: currentQty,
        qty_after: newQty,
        from_location_id: fromLocation,
        to_location_id: binLocation,
      });
    } // End of linesToProcess for loop
    
    // Log summary of stock updates
    if (stockUpdates.length === 0) {
      logger.warn(`[Putaway] ⚠️ NO STOCK UPDATES PROCESSED for task ${actualPutawayTask}`, {
        putaway_task: actualPutawayTask,
        lines_to_process: linesToProcess.length,
        lines: linesToProcess.map(l => ({
          item_code: l.item_code,
          qty: l.qty,
          location_id: l.location_id || 'NULL',
          rack: l.rack || 'NULL',
          bin: l.bin || 'NULL',
          carton_id: l.carton_id || 'NULL'
        }))
      });
    } else {
      logger.info(`[Putaway] ✅ Processed ${stockUpdates.length} stock update(s) for task ${actualPutawayTask}`, {
        putaway_task: actualPutawayTask,
        stock_updates_count: stockUpdates.length,
        total_lines: linesToProcess.length
      });
    }

    // Update tabItem.stock_qty (sum of all locations for each item)
    // CRITICAL: If carton stock exists, use it; otherwise use stock ledger
    const itemCodes = [...new Set(linesToProcess.map((line) => line.item_code))];
    
    // Check if tabCartonStock table exists
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    const hasCartonStockTable = cartonStockTable.length > 0;
    
    for (const itemCode of itemCodes) {
      let stockQty = 0;
      
      if (hasCartonStockTable) {
        // Check if item has carton stock - if yes, use sum from carton stock
        const [cartonStockSum] = await connection.execute(
          `SELECT COALESCE(SUM(qty), 0) as total_qty
           FROM tabCartonStock 
           WHERE item_code = ? AND qty > 0`,
          [itemCode]
        );
        
        if (cartonStockSum.length > 0 && parseFloat(cartonStockSum[0].total_qty) > 0) {
          // Item has carton stock - use sum from carton stock
          stockQty = parseFloat(cartonStockSum[0].total_qty) || 0;
          console.log(`[Putaway] 📦 Using carton stock sum for ${itemCode}: ${stockQty}`);
        } else {
          // No carton stock - use sum from stock ledger
          const [ledgerSum] = await connection.execute(
            `SELECT COALESCE(SUM(qty), 0) as total_qty
             FROM tabStockLedger 
             WHERE item_code = ?`,
            [itemCode]
          );
          stockQty = ledgerSum.length > 0 ? parseFloat(ledgerSum[0].total_qty) || 0 : 0;
          console.log(`[Putaway] 📊 Using stock ledger sum for ${itemCode}: ${stockQty}`);
        }
      } else {
        // No carton stock table - use sum from stock ledger
        const [ledgerSum] = await connection.execute(
          `SELECT COALESCE(SUM(qty), 0) as total_qty
           FROM tabStockLedger 
           WHERE item_code = ?`,
          [itemCode]
        );
        stockQty = ledgerSum.length > 0 ? parseFloat(ledgerSum[0].total_qty) || 0 : 0;
      }
      
      await connection.execute(
        `UPDATE tabItem
         SET stock_qty = ?,
             updated_at = NOW()
         WHERE code = ?`,
        [stockQty, itemCode]
      );
    }

    // Update box location if box_id exists in putaway task
    // First check which columns exist in tabPutawayTask
    const [taskBoxColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('box_id', 'rack', 'bin')
    `);
    const hasTaskBoxId = taskBoxColumns.some(
      (col) => col.COLUMN_NAME === "box_id"
    );
    const hasTaskBoxRack = taskBoxColumns.some((col) => col.COLUMN_NAME === "rack");
    const hasTaskBoxBin = taskBoxColumns.some((col) => col.COLUMN_NAME === "bin");

    // Build SELECT query based on available columns
    let taskBoxQuery = "SELECT ";
    const selectFields = [];
    if (hasTaskBoxId) selectFields.push("box_id");
    if (hasTaskBoxRack) selectFields.push("rack");
    if (hasTaskBoxBin) selectFields.push("bin");

    if (selectFields.length === 0) {
      // No relevant columns exist, skip box update
      taskBoxQuery = null;
    } else {
      taskBoxQuery +=
        selectFields.join(", ") + " FROM tabPutawayTask WHERE title = ?";
    }

    let taskBoxInfo = [];
    if (taskBoxQuery) {
      const [result] = await connection.execute(taskBoxQuery, [actualPutawayTask]);
      taskBoxInfo = result;
    }

    if (taskBoxInfo.length > 0 && hasTaskBoxId && taskBoxInfo[0].box_id) {
      const boxId = taskBoxInfo[0].box_id;
      const taskRack =
        (hasTaskBoxRack && taskBoxInfo[0].rack) || (linesToProcess.length > 0 ? linesToProcess[0].rack : null) || null;
      const taskBin =
        (hasTaskBoxBin && taskBoxInfo[0].bin) || (linesToProcess.length > 0 ? linesToProcess[0].bin : null) || null;

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
      ...new Set(linesToProcess.map((line) => line.rack).filter((r) => r)),
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

    // DO NOT commit here - commit happens after status update (at end of function)
    // This ensures atomic completion: all stock updates + status change in one transaction

    // Get the actual carton_id(s) from putaway lines for the response
    // CRITICAL: For Transfer In tasks, use the carton_id from lines (not task ID or transfer_in ID)
    // The mobile app displays this as "Putaway box" so it must be the actual carton ID
    const cartonIds = [...new Set(linesToProcess.map(line => line.carton_id).filter(Boolean))];
    const primaryCartonId = cartonIds.length > 0 ? cartonIds[0] : null;
    
    // Get location info for response
    const locationInfo = linesToProcess.length > 0 ? {
      rack: linesToProcess[0].rack || null,
      bin: linesToProcess[0].bin || null,
      location_id: linesToProcess[0].location_id || null
    } : null;
    
    // Build location string for display
    let locationDisplay = null;
    if (locationInfo) {
      if (locationInfo.location_id) {
        locationDisplay = locationInfo.location_id;
      } else if (locationInfo.rack && locationInfo.bin) {
        locationDisplay = `${locationInfo.rack}-${locationInfo.bin}`;
      } else if (locationInfo.rack) {
        locationDisplay = locationInfo.rack;
      } else if (locationInfo.bin) {
        locationDisplay = locationInfo.bin;
      }
    }

    // CRITICAL: Update task status to Completed and location_id ONLY after all stock updates succeed
    // This ensures atomic completion - if any stock update fails, status remains "In Progress"
    // Note: taskLocationColumns and hasTaskLocationId are already declared earlier in the function
    let updateTaskQuery = `UPDATE tabPutawayTask 
      SET status = 'Completed'`;
    const updateTaskParams = [];
    
    if (hasTaskLocationId && headerLocationInfo && headerLocationInfo.location_id) {
      updateTaskQuery += `, location_id = ?`;
      updateTaskParams.push(headerLocationInfo.location_id);
    }
    
    updateTaskQuery += `, updated_at = CURRENT_TIMESTAMP WHERE title = ?`;
    updateTaskParams.push(actualPutawayTask);
    
    await connection.execute(updateTaskQuery, updateTaskParams);
    
    logger.info(`[Putaway] Updated putaway task ${actualPutawayTask} to Completed`, {
      putaway_task: actualPutawayTask,
      location_id: hasTaskLocationId && headerLocationInfo ? headerLocationInfo.location_id : null
    });
    
    // CRITICAL: Close the sort box if box_id was provided (Putaway is BOX-based)
    // IMPORTANT: This happens BEFORE commit, so if commit fails, box status will be rolled back
    if (actualBoxId) {
      const [sortBoxColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabSortBox' 
        AND COLUMN_NAME = 'status'
      `);
      const hasSortBoxStatus = sortBoxColumns.length > 0;
      
      if (hasSortBoxStatus) {
        await connection.execute(
          `UPDATE tabSortBox
           SET status = 'Closed', updated_at = CURRENT_TIMESTAMP
           WHERE box_id = ?`,
          [actualBoxId]
        );
        
        logger.info(`[Putaway] Closed sort box ${actualBoxId} after putaway completion (before commit)`);
      } else {
        logger.warn(`[Putaway] ⚠️ Cannot close sort box ${actualBoxId} - status column not found in tabSortBox`);
      }
    }
    
    // Update ASN item details with carton_id and status = 'Received'
    // This updates the ASN to show that items have been put away
    if (stockUpdates && stockUpdates.length > 0) {
      // Get ASN number from putaway task
      const [taskInfo] = await connection.execute(
        `SELECT advance_shipping_notice FROM tabPutawayTask WHERE title = ?`,
        [actualPutawayTask]
      );
      const asnNo = taskInfo.length > 0 ? taskInfo[0].advance_shipping_notice : null;
      
      if (asnNo) {
        for (const update of stockUpdates) {
          try {
            // Note: Table name is lowercase (tabasnitemdetails) in MySQL
            await connection.execute(
              `UPDATE tabAsnItemDetails 
               SET carton_id = ?, carton_assigned_status = 'Received', updated_at = NOW()
               WHERE parent_title = ? AND item_code = ?`,
              [update.carton_id || actualBoxId, asnNo, update.item_code]
            );
            logger.info(`[Putaway] Updated ASN item ${update.item_code} with carton ${update.carton_id || actualBoxId} and status Received`);
          } catch (asnUpdateError) {
            // Log but don't fail - ASN update is informational
            logger.warn(`[Putaway] Failed to update ASN item ${update.item_code}: ${asnUpdateError.message}`);
          }
        }
      }
    }
    
    // CRITICAL: Commit transaction - all stock updates, task status, and box status change are atomic
    // If commit fails, everything will be rolled back (box status, task status, stock updates)
    // Wrap commit in try-catch to handle commit failures
    try {
      await connection.commit();
      logger.info(`[Putaway] ✅ Transaction committed successfully - all changes are now permanent`, {
        putaway_task: actualPutawayTask,
        box_id: actualBoxId || null,
        stock_updates_count: stockUpdates.length
      });
      
      // Sync item stock with stock ledger for all affected items
      if (stockUpdates && stockUpdates.length > 0) {
        const itemCodes = [...new Set(stockUpdates.map(s => s.item_code))];
        for (const itemCode of itemCodes) {
          await syncItemStock(connection, itemCode);
        }
      }
    } catch (commitError) {
      // If commit fails, rollback everything (box status, task status, stock updates)
      logger.error(`[Putaway] ❌ CRITICAL: Commit failed - rolling back all changes`, {
        error: commitError.message,
        putaway_task: actualPutawayTask,
        box_id: actualBoxId || null
      });
      try {
        await connection.rollback();
        logger.error(`[Putaway] ✅ Rollback successful after commit failure`);
      } catch (rollbackError) {
        logger.error(`[Putaway] ❌ CRITICAL: Rollback also failed: ${rollbackError.message}`);
      }
      throw commitError; // Re-throw to trigger error handler
    }
    
    // Get from_location_id for response (from first stock update if available)
    const firstStockUpdate = stockUpdates.length > 0 ? stockUpdates[0] : null;
    const fromLocationId = firstStockUpdate?.from_location_id || null;
    
    logger.info(`[Putaway] ✅ Successfully completed putaway task ${actualPutawayTask}`, {
      putaway_task: actualPutawayTask,
      stock_updates_count: stockUpdates.length,
      items_updated: stockUpdates.length,
      stock_updates: stockUpdates.map(s => ({
        item_code: s.item_code,
        from_location: s.from_location_id,
        to_location: s.to_location_id,
        qty: s.qty_added
      }))
    });
    
    res.json({
      ok: true,
      step: "COMPLETE",
      message: "Putaway completed successfully",
      data: {
        putaway_task: actualPutawayTask,
        putaway_task_id: actualPutawayTask, // Alias for mobile app compatibility
        status: "Completed",
        stock_updated: true,
        warehouse: warehouse,
        items_updated: stockUpdates.length,
        stock_updates: stockUpdates,
        moved_lines: stockUpdates.map(update => ({
          item_code: update.item_code,
          carton_id: update.carton_id,
          from_location_id: update.from_location_id,
          to_location_id: update.to_location_id,
          qty: update.qty_added
        })),
        carton_id: primaryCartonId, // CRITICAL: Actual carton ID from putaway lines (e.g., CTN-TI-0001-20260116-161713-261)
        box_id: primaryCartonId, // Alias for mobile app compatibility (use actual carton_id, not task ID)
        carton_ids: cartonIds, // All carton IDs if multiple
        location: locationInfo ? {
          rack: locationInfo.rack,
          bin: locationInfo.bin,
          location_id: locationInfo.location_id,
          display: locationDisplay
        } : null,
        to_location_id: locationInfo?.location_id || null, // Target location
        from_location_id: fromLocationId, // FROM location (staging) - computed per carton
        server_time: new Date().toISOString(),
      },
    });
  } catch (error) {
    // CRITICAL: Rollback transaction on ANY error - this ensures box status, task status, and stock updates are all rolled back
    // If box was set to "Closed" but an error occurred, rollback will revert it to previous status
    try {
      if (connection && !connection._released) {
        await connection.rollback();
        logger.error(`[Putaway] ❌ Transaction rolled back due to error: ${error.message}`, {
          errorType: error?.constructor?.name || "Unknown",
          stack: error?.stack,
          box_id: actualBoxId || null,
          putaway_task: actualPutawayTask || null
        });
      }
    } catch (rollbackError) {
      logger.error(`[Putaway] ❌ CRITICAL: Failed to rollback transaction: ${rollbackError.message}`, {
        originalError: error.message,
        rollbackError: rollbackError.message
      });
    }
    
    // Handle duplicate entry errors gracefully (idempotency)
    if (error.code === "ER_DUP_ENTRY" || error.errno === 1062) {
      logger.error("Duplicate entry detected during putaway completion (idempotency check)", {
        errorType: error?.constructor?.name || "Error",
        message: error?.message || "Duplicate entry",
        code: error?.code,
        sqlMessage: error?.sqlMessage,
        sqlState: error?.sqlState,
        requestBody: {
          putaway_task: putaway_task || null,
          tc_id: tc_id || null,
          box_id: box_id || null,
          location_id: location_id || null,
        },
      });
      
      // Try to find the putaway task to return success (idempotent)
      try {
        const connection2 = await getConnection();
        let actualPutawayTask = putaway_task;
        
        if (!actualPutawayTask && (tc_id || box_id)) {
          const cartonIdToSearch = box_id || tc_id;
          const [taskFromCarton] = await connection2.execute(
            `SELECT DISTINCT parent_title 
             FROM tabPutawayLine 
             WHERE carton_id = ? 
             ORDER BY parent_title DESC 
             LIMIT 1`,
            [cartonIdToSearch]
          );
          if (taskFromCarton.length > 0) {
            actualPutawayTask = taskFromCarton[0].parent_title;
          }
        }
        
        if (actualPutawayTask) {
          const [tasks] = await connection2.execute(
            `SELECT status FROM tabPutawayTask WHERE title = ?`,
            [actualPutawayTask]
          );
          connection2.release();
          
          if (tasks.length > 0 && tasks[0].status === "Completed") {
            // Task already completed - return success (idempotent)
            return res.json({
              ok: true,
              step: "COMPLETE",
              message: "Putaway already completed (idempotent - duplicate entry handled)",
              data: {
                putaway_task: actualPutawayTask,
                status: "Completed",
                stock_updated: true,
                already_completed: true,
                duplicate_entry_handled: true,
              },
            });
          }
        } else {
          connection2.release();
        }
      } catch (lookupError) {
        // If lookup fails, continue with error response
        logger.error("Failed to lookup putaway task for duplicate entry handling", {
          error: lookupError?.message,
        });
      }
      
      // If we can't confirm completion, return error
      connection.release();
      return res.status(409).json({
        ok: false,
        error: {
          code: "DUPLICATE_ENTRY",
          message: "Duplicate entry detected. This putaway may have already been completed. Please check the putaway task status.",
          details: process.env.NODE_ENV === "development" ? error.sqlMessage : null,
          suggestion: "Check if the putaway task is already completed. If so, this is expected behavior (idempotency).",
        },
      });
    }
    
    logger.error("Failed to complete putaway", {
      errorType: error?.constructor?.name || "Unknown",
      message: error?.message || "Unknown error",
      stack: error?.stack,
      code: error?.code,
      errno: error?.errno,
      sqlMessage: error?.sqlMessage,
      sqlState: error?.sqlState,
      requestBody: {
        putaway_task: putaway_task || null,
        tc_id: tc_id || null,
        box_id: box_id || null,
        location_id: location_id || null,
        performed_by: performed_by || null,
      },
    });
    
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to complete putaway",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    if (connection && !connection._released) {
      connection.release();
    }
  }
};

/**
 * When mobile sends PUT-* + a PAW-* sort box (e.g. PAW-WMS* from WMS-ASN-*), allow validation
 * only if the task is ASN (not TI-PUT / Transfer In) and not finished.
 */
async function resolveAllowTaskAsnPawBoxId(connection, putawayTaskTitle) {
  const title = String(putawayTaskTitle || "").trim();
  if (!title) return false;
  if (title.startsWith("TI-PUT-")) return false;
  if (!title.startsWith("PUT-")) return false;

  const [cols] = await connection.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabPutawayTask'
     AND COLUMN_NAME IN ('source_type','transfer_in','advance_shipping_notice','status')`
  );
  const colSet = new Set(cols.map((c) => c.COLUMN_NAME));
  const selectParts = ["title"];
  if (colSet.has("status")) selectParts.push("status");
  if (colSet.has("source_type")) selectParts.push("source_type");
  if (colSet.has("transfer_in")) selectParts.push("transfer_in");
  if (colSet.has("advance_shipping_notice")) selectParts.push("advance_shipping_notice");

  const [rows] = await connection.execute(
    `SELECT ${selectParts.join(", ")} FROM tabPutawayTask WHERE title = ? LIMIT 1`,
    [title]
  );
  if (!rows.length) return false;
  const row = rows[0];
  const status = row.status != null ? String(row.status).trim() : "";
  if (status === "Completed" || status === "Closed" || status === "Cancelled") return false;

  const transferInVal =
    colSet.has("transfer_in") && row.transfer_in != null && String(row.transfer_in).trim();
  const sourceRaw =
    colSet.has("source_type") && row.source_type != null ? String(row.source_type) : "";
  const sourceNorm = sourceRaw.replace(/[\s_-]/g, "").toLowerCase();
  const isTransferInTask = sourceNorm === "transferin" || !!transferInVal;
  if (isTransferInTask) return false;

  const asnRef =
    colSet.has("advance_shipping_notice") &&
    row.advance_shipping_notice != null &&
    String(row.advance_shipping_notice).trim();
  const isAsnSource = sourceNorm === "asn" || !!asnRef;
  return isAsnSource;
}

/**
 * Accept shelf-bound ids that are not CTN-/PAW-/BOX- when they match this putaway task:
 * - tabPutawayTask.box_id (if set), or
 * - tabPutawayLine.carton_id / tabPutawayLine.box_id for parent_title = task (WMS often stores MOOSA-* on lines only).
 */
async function resolveDeclaredBoxIdFromPutawayTask(connection, taskTitle, scannedRaw) {
  const scan = String(scannedRaw || "").trim();
  const title = String(taskTitle || "").trim();
  if (!scan || !title) return null;

  const [cols] = await connection.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabPutawayTask'
     AND COLUMN_NAME IN ('box_id','advance_shipping_notice','warehouse','status','source_type','transfer_in')`
  );
  const colSet = new Set(cols.map((c) => c.COLUMN_NAME));

  const selectParts = [];
  if (colSet.has("box_id")) selectParts.push("box_id");
  if (colSet.has("advance_shipping_notice")) selectParts.push("advance_shipping_notice");
  if (colSet.has("warehouse")) selectParts.push("warehouse");
  if (colSet.has("status")) selectParts.push("status");
  if (colSet.has("source_type")) selectParts.push("source_type");
  if (colSet.has("transfer_in")) selectParts.push("transfer_in");
  if (selectParts.length === 0) return null;

  const [rows] = await connection.execute(
    `SELECT ${selectParts.join(", ")} FROM tabPutawayTask WHERE title = ? LIMIT 1`,
    [title]
  );
  if (!rows.length) return null;

  const row = rows[0];
  const transferInVal =
    colSet.has("transfer_in") && row.transfer_in && String(row.transfer_in).trim();
  const sourceRaw =
    colSet.has("source_type") && row.source_type != null ? String(row.source_type) : "";
  const sourceNorm = sourceRaw.replace(/[\s_-]/g, "").toLowerCase();
  // Transfer In putaway may use custom shelf/box ids (e.g. SAKEER) on tabPutawayTask.box_id or lines — same resolution as ASN task-declared ids.

  const scanLc = scan.toLowerCase();

  if (colSet.has("box_id") && row.box_id != null && String(row.box_id).trim() !== "") {
    const dbBox = String(row.box_id).trim();
    if (dbBox.toLowerCase() === scanLc) {
      return {
        boxId: dbBox,
        advance_shipping_notice: colSet.has("advance_shipping_notice")
          ? row.advance_shipping_notice
          : null,
        warehouse: colSet.has("warehouse") ? row.warehouse : null,
        status: colSet.has("status") ? row.status : null,
      };
    }
  }

  const [lineCols] = await connection.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabPutawayLine'
     AND COLUMN_NAME IN ('carton_id','box_id')`
  );
  const lineColSet = new Set(lineCols.map((c) => c.COLUMN_NAME));
  if (!lineColSet.has("carton_id")) return null;

  const hasLineBoxId = lineColSet.has("box_id");
  const lineSql = hasLineBoxId
    ? `SELECT carton_id, box_id FROM tabPutawayLine WHERE parent_title = ?
         AND (LOWER(TRIM(COALESCE(carton_id,''))) = ? OR LOWER(TRIM(COALESCE(box_id,''))) = ?)
         LIMIT 1`
    : `SELECT carton_id FROM tabPutawayLine WHERE parent_title = ?
         AND LOWER(TRIM(COALESCE(carton_id,''))) = ?
         LIMIT 1`;
  const lineParams = hasLineBoxId ? [title, scanLc, scanLc] : [title, scanLc];
  const [lineRows] = await connection.execute(lineSql, lineParams);
  if (lineRows.length > 0) {
    const lr = lineRows[0];
    const lineBox =
      hasLineBoxId && lr.box_id != null && String(lr.box_id).trim() !== ""
        ? String(lr.box_id).trim()
        : String(lr.carton_id || "").trim();
    if (!lineBox) return null;
    return {
      boxId: lineBox,
      advance_shipping_notice: colSet.has("advance_shipping_notice")
        ? row.advance_shipping_notice
        : null,
      warehouse: colSet.has("warehouse") ? row.warehouse : null,
      status: colSet.has("status") ? row.status : null,
    };
  }

  // Mobile list often shows tabSortBox.box_id (e.g. MOOSA-1258EXTBAG-002) while putaway line/task still has another id
  const asnRef =
    colSet.has("advance_shipping_notice") &&
    row.advance_shipping_notice != null &&
    String(row.advance_shipping_notice).trim();
  if (!asnRef) return null;

  const asnTrim = String(asnRef).trim();
  const [sbRows] = await connection.execute(
    `SELECT box_id, status, advance_shipping_notice, store
     FROM tabSortBox
     WHERE LOWER(TRIM(box_id)) = ?
       AND LOWER(TRIM(COALESCE(advance_shipping_notice,''))) = LOWER(?)
     LIMIT 1`,
    [scanLc, asnTrim]
  );
  if (!sbRows.length) return null;
  const sb = sbRows[0];
  return {
    boxId: String(sb.box_id).trim(),
    advance_shipping_notice: sb.advance_shipping_notice,
    warehouse: sb.store,
    status: sb.status,
  };
}

/**
 * POST /api/putaway/scan-transfer-carton
 * VALIDATE transfer carton/box and location - NO AUTO-CREATION
 * This endpoint only validates that carton_id and location_id exist
 * All creation and stock updates happen in completePutaway endpoint
 *
 * Request Body:
 * {
 *   "tc_id": "TC-1766952896460",  // Required for ASN (carton_id)
 *   "box_id": "BOX-WHMAIN-514364", // Optional if tc_id provided
 *   "location_id": "A1-R02-L1-B2", // Required
 *   "user_id": "USER-001"
 * }
 */
export const scanTransferCarton = async (req, res) => {
  const { tc_id, box_id, location_id, user_id, putaway_task, carton_id } = req.body;

  // Log entry point for debugging
  logger.info(`[Putaway Scan] Entry: location_id=${location_id || 'NULL'}, box_id=${box_id || 'NULL'}, tc_id=${tc_id || 'NULL'}, putaway_task=${putaway_task || 'NULL'}, carton_id=${carton_id || 'NULL'}`);

  // Import scanNormalize utility
  const { normalizeCartonId, validateForPutaway } = await import('../../utils/scanNormalize.js');

  // VALIDATION: location_id is required
  if (!location_id) {
    logger.warn(`[Putaway Scan] Missing location_id - returning validation error`);
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "location_id is required",
      },
    });
  }

  const trimmedPutawayTask =
    putaway_task != null && String(putaway_task).trim() ? String(putaway_task).trim() : "";
  const actualPutawayTask = trimmedPutawayTask || null;

  const connection = await getConnection();

  let allowTaskAsnPawBox = false;
  try {
    if (trimmedPutawayTask) {
      allowTaskAsnPawBox = await resolveAllowTaskAsnPawBoxId(connection, trimmedPutawayTask);
      logger.info(
        `[Putaway Scan] putaway_task=${trimmedPutawayTask} allowTaskAsnPawBox=${allowTaskAsnPawBox}`
      );
    }
  } catch (e) {
    logger.warn(`[Putaway Scan] Could not resolve ASN task for PAW-* allowance: ${e?.message}`);
    allowTaskAsnPawBox = false;
  }

  // Reject stale mobile state: client must not scan location against a finished task
  if (trimmedPutawayTask) {
    const [taskStatRows] = await connection.execute(
      `SELECT status FROM tabPutawayTask WHERE title = ? LIMIT 1`,
      [trimmedPutawayTask]
    );
    if (taskStatRows.length > 0) {
      const stt = String(taskStatRows[0].status || "").trim();
      if (stt === "Completed" || stt === "Closed" || stt === "Cancelled") {
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "TASK_ALREADY_COMPLETED",
            message: `Putaway task ${trimmedPutawayTask} is already ${stt}. Refresh the list and select the current Open task for this box.`,
          },
        });
      }
    }
  }

  // CRITICAL: Normalize and validate carton_id/box_id - reject old TI-PUT-* and PUT-* formats
  const inputId = carton_id || box_id || tc_id;
  let actualCartonId = null;
  let actualBoxId = null;
  let validatedBoxId = null; // Initialize early to avoid ReferenceError
  /** When set, scanned id matched tabPutawayTask.box_id for this PUT-* task (may not exist in tabSortBox). */
  let taskDeclaredBox = null;

  if (trimmedPutawayTask && inputId) {
    try {
      taskDeclaredBox = await resolveDeclaredBoxIdFromPutawayTask(
        connection,
        trimmedPutawayTask,
        String(inputId).trim()
      );
    } catch (e) {
      logger.warn(`[Putaway Scan] resolveDeclaredBoxIdFromPutawayTask: ${e?.message}`);
      taskDeclaredBox = null;
    }
  }

  if (taskDeclaredBox) {
    actualCartonId = null;
    actualBoxId = taskDeclaredBox.boxId;
    validatedBoxId = taskDeclaredBox.boxId;
    logger.info(
      `[Putaway Scan] Matched tabPutawayTask.box_id for task ${trimmedPutawayTask}: ${taskDeclaredBox.boxId}`
    );
  } else if (inputId) {
    const upperInputId = String(inputId).trim().toUpperCase();
    const isAsnBoxId =
      upperInputId.startsWith("PAW-ASN") || upperInputId.startsWith("BOX-");

    const validated = validateForPutaway(inputId, isAsnBoxId, allowTaskAsnPawBox);
    if (!validated.ok) {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: validated.reason,
          message:
            validated.message ||
            `Invalid format: ${inputId}. Putaway requires carton ID (CTN-*), ASN sort box (BOX-* or PAW-* with putaway_task for ASN), legacy PAW-ASN-*, or the same value as tabPutawayTask.box_id for your PUT-* task. Old task IDs (TI-PUT-* / PUT-*) are not valid carton scans.`,
        },
      });
    }
    actualCartonId = validated.carton_id;
    actualBoxId = validated.box_id;
    validatedBoxId = validated.box_id;
  }

  if (!actualCartonId && !actualBoxId && !actualPutawayTask) {
    connection.release();
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          "Either carton_id (CTN-*), box_id (CTN-* / BOX-* / PAW-* with ASN putaway_task), or putaway_task is required",
      },
    });
  }

  try {
    // VALIDATION ONLY - No transaction needed (no database writes)
    // Step 1: Validate location_id exists
    let locationInfo = null;
    try {
      locationInfo = await lookupLocationFromId(connection, location_id);
    } catch (error) {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "LOCATION_NOT_FOUND",
          message: `Location ID "${location_id}" not found or not available`,
          details: error.message,
        },
      });
    }

    // Step 2: Validate carton_id/tc_id and determine putaway type (ASN vs Transfer In)
    let isAsnPutaway = false;
    let validatedCartonId = actualCartonId; // The carton_id to use for validation
    let validatedBoxId = actualBoxId; // The box_id to use for validation (always = carton_id)
    
    // Check if tc_id is a putaway task title (PUT- or TI-PUT-)
    // Note: Old formats are already rejected by validateForPutaway above
    // If it is, find the task to determine putaway type
    const isPutawayTaskTitle = actualCartonId && (actualCartonId.startsWith('PUT-') || actualCartonId.startsWith('TI-PUT-'));
    let taskTitleToCheck = actualPutawayTask || (isPutawayTaskTitle ? actualCartonId : null);
    
    if (taskTitleToCheck) {
      // Find the putaway task to determine type
      const [taskColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabPutawayTask' 
        AND COLUMN_NAME IN ('source_type', 'transfer_in')
      `);
      
      const hasSourceType = taskColumns.some(col => col.COLUMN_NAME === 'source_type');
      const hasTransferIn = taskColumns.some(col => col.COLUMN_NAME === 'transfer_in');
      
      let taskSelectQuery = `SELECT title`;
      if (hasSourceType) taskSelectQuery += `, source_type`;
      if (hasTransferIn) taskSelectQuery += `, transfer_in`;
      taskSelectQuery += ` FROM tabPutawayTask WHERE title = ? LIMIT 1`;
      
      const [taskRows] = await connection.execute(taskSelectQuery, [taskTitleToCheck]);
      
      if (taskRows.length > 0) {
        const task = taskRows[0];
        const isTransferInTask = (hasSourceType && task.source_type === 'TransferIn') || 
                                (hasTransferIn && task.transfer_in);
        
        if (isTransferInTask) {
          // This is Transfer In putaway - skip tabTransferCarton validation
          // For Transfer In, carton_id validation happens in completePutaway using putaway lines
          isAsnPutaway = false;
          
          // If carton_id is provided (not the task title), validate it exists in putaway lines
          if (actualCartonId && !isPutawayTaskTitle) {
            const [lineRows] = await connection.execute(
              `SELECT carton_id FROM tabPutawayLine 
               WHERE parent_title = ? AND carton_id = ? 
               LIMIT 1`,
              [taskTitleToCheck, actualCartonId]
            );
            
            if (lineRows.length === 0) {
              connection.release();
              return res.status(400).json({
                ok: false,
                error: {
                  code: "CARTON_NOT_FOUND",
                  message: `Carton ${actualCartonId} not found in putaway task ${taskTitleToCheck}. Please verify the carton ID.`,
                },
              });
            }
          }
          // Validation passed for Transfer In putaway
        } else {
          // Task exists but it's ASN putaway - need to validate carton_id in tabTransferCarton
          isAsnPutaway = true;
          // Continue to tabTransferCarton validation below (if actualCartonId is not the task title)
          if (isPutawayTaskTitle) {
            // If tc_id is the task title for ASN, we need the actual carton_id
            connection.release();
            return res.status(400).json({
              ok: false,
              error: {
                code: "VALIDATION_ERROR",
                message: `For ASN putaway, please provide the carton_id (tc_id), not the putaway task title.`,
              },
            });
          }
        }
      } else {
        // Task not found
        connection.release();
        return res.status(400).json({
          ok: false,
          error: {
            code: "TASK_NOT_FOUND",
            message: `Putaway task ${taskTitleToCheck} not found.`,
          },
        });
      }
    }
    
    // Validate against tabTransferCarton for ASN putaway (if not already validated above)
    if (actualCartonId && !isPutawayTaskTitle && (isAsnPutaway || !taskTitleToCheck)) {
      // Check if carton_id exists in tabTransferCarton (ASN putaway)
      const [tcColumns] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'tabTransferCarton' 
        AND COLUMN_NAME IN ('advance_shipping_notice', 'source_type')
      `);
      
      const hasAsnColumn = tcColumns.some(col => col.COLUMN_NAME === 'advance_shipping_notice');
      const hasSourceTypeColumn = tcColumns.some(col => col.COLUMN_NAME === 'source_type');
      
      let selectQuery = `SELECT tc_id, status`;
      if (hasAsnColumn) selectQuery += `, advance_shipping_notice`;
      if (hasSourceTypeColumn) selectQuery += `, source_type`;
      selectQuery += ` FROM tabTransferCarton WHERE tc_id = ? LIMIT 1`;
      
      const [tcRows] = await connection.execute(selectQuery, [actualCartonId]);

      if (tcRows.length > 0) {
        // Found in tabTransferCarton - this is ASN putaway
        const tc = tcRows[0];
        if (hasAsnColumn && tc.advance_shipping_notice) {
          isAsnPutaway = true;
        } else if (hasSourceTypeColumn) {
          isAsnPutaway = (tc.source_type !== 'Transfer In');
        } else {
          isAsnPutaway = true; // Default to ASN if found in tabTransferCarton
        }
      } else {
        // Not found in tabTransferCarton - check if it's a carton_id in putaway lines (Transfer In scenario)
        const [putawayLineRows] = await connection.execute(
          `SELECT DISTINCT pl.parent_title, pt.source_type, pt.transfer_in
           FROM tabPutawayLine pl
           LEFT JOIN tabPutawayTask pt ON pl.parent_title = pt.title
           WHERE pl.carton_id = ?
           LIMIT 1`,
          [actualCartonId]
        );
        
        if (putawayLineRows.length > 0) {
          // Found in putaway lines - check if it's Transfer In task
          const line = putawayLineRows[0];
          const isTransferInTask = line.source_type === 'TransferIn' || line.transfer_in;
          
          if (isTransferInTask) {
            // This is Transfer In putaway - carton_id is valid
            isAsnPutaway = false;
            validatedCartonId = actualCartonId;
          } else {
            // Found in lines but it's ASN - should be in tabTransferCarton
            connection.release();
            return res.status(400).json({
              ok: false,
              error: {
                code: "CARTON_NOT_FOUND",
                message: `Transfer carton ${actualCartonId} not found in tabTransferCarton. Carton must be created during receiving before ASN putaway.`,
              },
            });
          }
        } else {
          // Not found anywhere - return error
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: "CARTON_NOT_FOUND",
              message: `Transfer carton ${actualCartonId} not found. For ASN putaway, carton must be created during receiving. For Transfer In putaway, carton must exist in putaway lines.`,
            },
          });
        }
      }
    } else if (!actualCartonId && !actualBoxId) {
      // No carton_id or box_id provided - this should not happen due to validation above
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Either carton_id (tc_id) or box_id is required",
        },
      });
    } else {
      // Box-only path: do not overwrite TI vs ASN when putaway_task already resolved task type above.
      if (!taskTitleToCheck) {
        isAsnPutaway = true;
      }
    }

    // Ensure validatedBoxId is set (should already be set above, but ensure it's available)
    // This is a safety check - validatedBoxId should already be set from the validation above
    if (!validatedBoxId) {
      validatedBoxId = actualBoxId || null;
    }

    // Step 3: Validate box_id (for both ASN and Transfer In Putaway)
    // Use normalized box_id from validation above
    if (validatedBoxId) {
      // Check if box exists in tabSortBox (for both ASN and Transfer In)
      const [boxRows] = await connection.execute(
        `SELECT box_id, status, advance_shipping_notice, store 
         FROM tabSortBox 
         WHERE box_id = ? 
         LIMIT 1`,
        [validatedBoxId]
      );

      let box = null;
      if (boxRows.length > 0) {
        box = boxRows[0];
      } else if (taskDeclaredBox && trimmedPutawayTask) {
        // tabPutawayTask.box_id is the shelf-bound id (e.g. MOOSAASN-127211) — may not match tabSortBox.box_id
        const [tMeta] = await connection.execute(
          `SELECT advance_shipping_notice, warehouse, status FROM tabPutawayTask WHERE title = ? LIMIT 1`,
          [trimmedPutawayTask]
        );
        const tm = tMeta[0] || {};
        box = {
          box_id: taskDeclaredBox.boxId,
          status: tm.status || "Open",
          advance_shipping_notice:
            tm.advance_shipping_notice ?? taskDeclaredBox.advance_shipping_notice ?? null,
          store: tm.warehouse ?? taskDeclaredBox.warehouse ?? null,
        };
        logger.info(
          `[Putaway Scan] tabSortBox miss for ${validatedBoxId}; using task-declared box on ${trimmedPutawayTask}`
        );
      }

      if (!box) {
        // Box not found - provide helpful error message
        let helpfulMessage = `Box ${validatedBoxId} not found in tabSortBox.`;
        let hint = null;
        let troubleshooting = null;
        let errorCode = "BOX_NOT_FOUND";
        
        // Note: Old TI-PUT-* and PUT-* formats are already rejected by normalizeCartonId above
        // This code path should only be reached for valid CTN-* formats that don't exist yet
        // Check if putaway task exists and box needs to be created
        // Determine if this is Transfer In or ASN based on box_id format
        const isTransferInBoxCheck = validatedBoxId && validatedBoxId.startsWith('CTN-TI-');
        
        if (isTransferInBoxCheck) {
          // For Transfer In: Box might not be created yet if putaway task doesn't exist
          helpfulMessage = `Box ${validatedBoxId} not found. Putaway task may not be created yet. Please complete receiving first.`;
          errorCode = "PUTAWAY_NOT_READY";
          troubleshooting = [
            "Complete Transfer In receiving to create putaway task",
            "Wait for putaway task creation to complete",
            "Then retry scanning the carton ID"
          ];
        } else {
          // For ASN: Box should exist if receiving is complete
          helpfulMessage = `Box ${validatedBoxId} not found. Box may not be created yet during receiving.`;
          troubleshooting = [
            "Complete ASN receiving to create boxes",
            "Then retry scanning the box ID"
          ];
        }
        
        connection.release();
        return res.status(errorCode === "PUTAWAY_NOT_READY" ? 409 : 400).json({
          ok: false,
          error: {
            code: errorCode,
            message: helpfulMessage,
            ...(errorCode === "PUTAWAY_NOT_READY" && { retry_after_seconds: 3 }),
            ...(hint && { hint }),
            ...(troubleshooting && { troubleshooting })
          },
        });
      }
      
      // Validate box status (should be Open or Assigned, not Closed/Completed)
      // BUT: If box is Closed but putaway task is NOT completed, allow retry (reopen box)
      if (box.status === 'Closed' || box.status === 'Completed' || box.status === 'Dispatched') {
        // Check if putaway task exists and is actually completed
        // If task is NOT completed, allow retry (box was closed prematurely due to error)
        // First check if box_id column exists in tabPutawayLine
        const [lineColumns] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabPutawayLine'
            AND COLUMN_NAME = 'box_id'
        `);
        const hasLineBoxId = lineColumns.length > 0;
        
        // Build WHERE clause conditionally based on column existence
        // For ASN putaway, box_id is stored in carton_id column
        let whereClause = 'pt.carton_id = ?';
        let whereParams = [validatedBoxId];
        
        if (hasLineBoxId) {
          whereClause += ' OR pt.box_id = ?';
          whereParams.push(validatedBoxId);
        }
        
        const [putawayTaskCheck] = await connection.execute(`
          SELECT DISTINCT pt.parent_title
          FROM tabPutawayLine pt
          WHERE ${whereClause}
          ORDER BY pt.parent_title DESC
          LIMIT 1
        `, whereParams);
        
        let allowRetry = false;
        let taskTitle = null;
        let taskStatus = null;
        
        if (putawayTaskCheck.length > 0) {
          taskTitle = putawayTaskCheck[0].parent_title;
          
          // Check actual task status from tabPutawayTask
          const [taskStatusCheck] = await connection.execute(`
            SELECT status FROM tabPutawayTask WHERE title = ? LIMIT 1
          `, [taskTitle]);
          
          if (taskStatusCheck.length > 0) {
            const actualTaskStatus = taskStatusCheck[0].status;
            taskStatus = actualTaskStatus; // Store for error response if needed
            // If task is NOT "Completed", allow retry (box was closed but putaway failed)
            if (actualTaskStatus !== 'Completed' && actualTaskStatus !== 'Closed') {
              allowRetry = true;
              logger.warn(`[Putaway] Box ${validatedBoxId} is Closed but task ${taskTitle} is ${actualTaskStatus} - allowing retry by reopening box`);
              
              // Reopen the box to allow putaway retry
              const [sortBoxStatusCol] = await connection.execute(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'tabSortBox' 
                AND COLUMN_NAME = 'status'
              `);
              
              if (sortBoxStatusCol.length > 0) {
                await connection.execute(`
                  UPDATE tabSortBox
                  SET status = 'Open', updated_at = CURRENT_TIMESTAMP
                  WHERE box_id = ?
                `, [validatedBoxId]);
                
                logger.info(`[Putaway] ✅ Reopened box ${validatedBoxId} for putaway retry (task ${taskTitle} is ${actualTaskStatus})`);
                // Continue with putaway - box is now Open
              } else {
                // Can't update status column - still allow retry but log warning
                logger.warn(`[Putaway] ⚠️ Cannot reopen box ${validatedBoxId} - status column not found, but allowing putaway to proceed`);
                allowRetry = true;
              }
            }
          }
        }
        
        // If task is completed or no task found, reject (idempotency)
        if (!allowRetry) {
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: "BOX_ALREADY_PROCESSED",
              message: `Box ${validatedBoxId} is already ${box.status} and cannot be used for putaway.`,
              ...(taskTitle && { putaway_task: taskTitle, task_status: taskStatus }),
            },
          });
        }
        // If allowRetry is true, continue with putaway (box has been reopened)
      }

      // CRITICAL: Check if putaway task exists for this box
      // For Transfer In: box.advance_shipping_notice = Transfer In title
      // For ASN: box.advance_shipping_notice = ASN number
      const documentTitle = box.advance_shipping_notice;
      
      // Determine if this is Transfer In or ASN based on box_id format
      const isTransferInBox = validatedBoxId && validatedBoxId.startsWith('CTN-TI-');
      
      // Check if putaway task exists
      const [taskColumns] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabPutawayTask'
          AND COLUMN_NAME IN ('source_type', 'transfer_in', 'status')
      `);
      const taskColumnNames = taskColumns.map(col => col.COLUMN_NAME);
      const hasSourceType = taskColumnNames.includes('source_type');
      const hasTransferIn = taskColumnNames.includes('transfer_in');
      const hasStatus = taskColumnNames.includes('status');
      
      let putawayTaskQuery = `SELECT title${hasStatus ? ', status' : ''} FROM tabPutawayTask WHERE `;
      const taskParams = [];
      
      if (isTransferInBox && hasSourceType && hasTransferIn) {
        // Transfer In: Check by source_type and transfer_in
        putawayTaskQuery += `source_type = 'TransferIn' AND transfer_in = ?`;
        taskParams.push(documentTitle);
      } else if (isTransferInBox && hasSourceType) {
        // Transfer In: Fallback to source_type and advance_shipping_notice
        putawayTaskQuery += `source_type = 'TransferIn' AND advance_shipping_notice = ?`;
        taskParams.push(documentTitle);
      } else {
        // ASN: Check by advance_shipping_notice
        putawayTaskQuery += `advance_shipping_notice = ?`;
        taskParams.push(documentTitle);
      }

      if (hasStatus) {
        putawayTaskQuery += ` AND status NOT IN ('Completed','Cancelled','Closed')`;
      }
      // Prefer active work: Open > In Progress > Draft, then newest
      putawayTaskQuery += hasStatus
        ? ` ORDER BY CASE status WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 WHEN 'Draft' THEN 2 ELSE 3 END, created_at DESC LIMIT 1`
        : ` ORDER BY created_at DESC LIMIT 1`;

      const [taskRows] = await connection.execute(putawayTaskQuery, taskParams);
      let foundPutawayTask = taskRows.length > 0 ? taskRows[0] : null;
      
      // If putaway task not found and this is Transfer In, try to create it synchronously
      if (!foundPutawayTask && isTransferInBox) {
        logger.info(`[Putaway Validation] Putaway task not found for Transfer In ${documentTitle}, attempting to create...`);
        
        try {
          // Import the function to create putaway task
          const { createPutawayTaskFromTransferIn } = await import('../transfer-in/transferInController.js');
          
          // Get warehouse from box or default
          const warehouse = box.store || 'WH-MAIN';
          
          // Create putaway task synchronously (uses same connection)
          const createResult = await createPutawayTaskFromTransferIn(
            connection,
            documentTitle,
            warehouse
          );
          if (createResult?.ok && createResult.putaway_task) {
            const [immediateRows] = await connection.execute(
              putawayTaskQuery,
              taskParams
            );
            foundPutawayTask =
              immediateRows.length > 0
                ? immediateRows[0]
                : { title: createResult.putaway_task };
            if (foundPutawayTask) {
              logger.info(
                `[Putaway Validation] ✅ Putaway task ${createResult.created ? "created" : "resolved"}: ${foundPutawayTask.title}`
              );
            }
          }

          // Re-query with short backoff if still missing (e.g. rare visibility edge)
          let attempts = 0;
          const maxAttempts = 4;
          const delayMs = 500;

          while (attempts < maxAttempts && !foundPutawayTask) {
            if (attempts > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }

            const [retryTaskRows] = await connection.execute(
              putawayTaskQuery,
              taskParams
            );
            if (retryTaskRows.length > 0) {
              foundPutawayTask = retryTaskRows[0];
              logger.info(
                `[Putaway Validation] ✅ Putaway task found: ${foundPutawayTask.title}`
              );
              break;
            }
            attempts++;
          }
          
          // If still not found after retries, return NOT_READY
          if (!foundPutawayTask) {
            connection.release();
            return res.status(409).json({
              ok: false,
              error: {
                code: "PUTAWAY_NOT_READY",
                message: `Putaway task is being created for Transfer In ${documentTitle}. Please retry in 3 seconds.`,
                retry_after_seconds: 3,
                transfer_in: documentTitle,
                box_id: validatedBoxId
              },
            });
          }
        } catch (createError) {
          logger.error(`[Putaway Validation] Failed to create putaway task:`, createError);
          connection.release();
          return res.status(409).json({
            ok: false,
            error: {
              code: "PUTAWAY_NOT_READY",
              message: `Putaway task creation in progress. Please retry in 3 seconds.`,
              retry_after_seconds: 3,
              transfer_in: documentTitle,
              box_id: validatedBoxId
            },
          });
        }
      }
      
      // If putaway task still not found, return NOT_READY
      if (!foundPutawayTask) {
        connection.release();
        return res.status(409).json({
          ok: false,
          error: {
            code: "PUTAWAY_NOT_READY",
            message: `Putaway task not found for ${isTransferInBox ? 'Transfer In' : 'ASN'} ${documentTitle}. Putaway task may still be creating. Please retry in 3 seconds.`,
            retry_after_seconds: 3,
            ...(isTransferInBox ? { transfer_in: documentTitle } : { asn_no: documentTitle }),
            box_id: validatedBoxId
          },
        });
      }
      
      // Update taskTitleToCheck with found task (if not already set from putaway_task parameter)
      if (!taskTitleToCheck) {
        taskTitleToCheck = foundPutawayTask.title;
      } else if (taskTitleToCheck !== foundPutawayTask.title) {
        // Mobile sends the correct task+box pair; ASN-only discovery can still hit another task row for the same ASN.
        // Accept the client's putaway_task when this box is actually on that task (line, task.box_id, or resolver match).
        const scanLcBox = String(validatedBoxId || "").trim().toLowerCase();
        let acceptClientTask = Boolean(
          taskDeclaredBox && trimmedPutawayTask === taskTitleToCheck
        );
        if (!acceptClientTask && scanLcBox) {
          const [plc] = await connection.execute(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabPutawayLine'
             AND COLUMN_NAME IN ('carton_id','box_id')`
          );
          const hasPlBox = plc.some((c) => c.COLUMN_NAME === "box_id");
          const sqlPl = hasPlBox
            ? `SELECT id FROM tabPutawayLine WHERE parent_title = ?
                 AND (LOWER(TRIM(COALESCE(carton_id,''))) = ? OR LOWER(TRIM(COALESCE(box_id,''))) = ?) LIMIT 1`
            : `SELECT id FROM tabPutawayLine WHERE parent_title = ?
                 AND LOWER(TRIM(COALESCE(carton_id,''))) = ? LIMIT 1`;
          const prms = hasPlBox
            ? [taskTitleToCheck, scanLcBox, scanLcBox]
            : [taskTitleToCheck, scanLcBox];
          const [plHit] = await connection.execute(sqlPl, prms);
          if (plHit.length) acceptClientTask = true;
        }
        if (!acceptClientTask && scanLcBox) {
          const [tbHit] = await connection.execute(
            `SELECT title FROM tabPutawayTask WHERE title = ? AND LOWER(TRIM(COALESCE(box_id,''))) = ? LIMIT 1`,
            [taskTitleToCheck, scanLcBox]
          );
          if (tbHit.length) acceptClientTask = true;
        }
        if (!acceptClientTask) {
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: "TASK_MISMATCH",
              message: `Putaway task ${taskTitleToCheck} does not match task found for box ${validatedBoxId} (${foundPutawayTask.title})`,
            },
          });
        }
        logger.info(
          `[Putaway Scan] Client task ${taskTitleToCheck} differs from ASN-discovered ${foundPutawayTask.title}; box is linked to client task — using client task`
        );
      }

      // Validate box belongs to correct document (ASN or Transfer In)
      // This validation is already done by:
      // 1. Box exists in tabSortBox with correct advance_shipping_notice
      // 2. Putaway task exists for the document
      // 3. Box.advance_shipping_notice matches document title
      
      if (isAsnPutaway) {
        logger.info(`[Putaway Validation] Validated ASN putaway box ${validatedBoxId}`);
      } else {
        // For Transfer In: Validate advance_shipping_notice matches Transfer In title
        if (box.advance_shipping_notice !== documentTitle) {
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: "BOX_TRANSFER_IN_MISMATCH",
              message: `Box ${validatedBoxId} belongs to ${box.advance_shipping_notice}, not ${documentTitle}.`,
            },
          });
        }
        logger.info(`[Putaway Validation] Validated Transfer In putaway box ${validatedBoxId}`);
      }
    }

    // CRITICAL: If putaway_task and location_id are provided, update all putaway lines with the location
    // This handles both desktop app (putaway_task + location_id) and mobile app (box_id + location_id) workflows
    // Priority: If putaway_task is provided, update all lines for that task
    logger.info(`[Putaway Scan] Checking location update path: taskTitleToCheck=${taskTitleToCheck || 'NULL'}, location_id=${location_id || 'NULL'}, actualPutawayTask=${actualPutawayTask || 'NULL'}`);
    
    // If putaway_task was provided directly but taskTitleToCheck wasn't set from box validation, use it now
    if (!taskTitleToCheck && actualPutawayTask) {
      taskTitleToCheck = actualPutawayTask;
      logger.info(`[Putaway Scan] Using putaway_task from request body: ${taskTitleToCheck}`);
    }
    
    if (taskTitleToCheck && location_id) {
      logger.info(`[Putaway Scan] ✅ Location update path triggered: task=${taskTitleToCheck}, location=${location_id}`);
      // Desktop app is updating location for entire task
      // Call updatePutawayTaskLocation to update all lines
      try {
        await connection.beginTransaction();
        
        // Get all putaway lines for this task (include box_id when column exists — sort / TI shelf ids)
        const [plBoxMeta] = await connection.execute(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabPutawayLine' AND COLUMN_NAME = 'box_id'`
        );
        const plHasBoxId = plBoxMeta.length > 0;
        const lineSelectSql = plHasBoxId
          ? `SELECT id, item_code, carton_id, box_id, qty FROM tabPutawayLine WHERE parent_title = ?`
          : `SELECT id, item_code, carton_id, qty FROM tabPutawayLine WHERE parent_title = ?`;
        const [putawayLines] = await connection.execute(lineSelectSql, [taskTitleToCheck]);

        const { findMissingItemCodesInMaster } = await import("../../utils/itemMasterValidate.js");
        const scanMissingItems = await findMissingItemCodesInMaster(
          connection,
          putawayLines.map((l) => l.item_code)
        );
        if (scanMissingItems.length > 0) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: "ITEM_NOT_IN_MASTER",
              message: `Cannot assign location: item code(s) not in Item master (tabItem): ${scanMissingItems.join(", ")}. Sync items from ERPNext before putaway.`,
              missing_item_codes: scanMissingItems,
            },
          });
        }

        if (putawayLines.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            ok: false,
            error: {
              code: "NO_LINES_FOUND",
              message: `Putaway task ${taskTitleToCheck} has no items to assign location`,
            },
          });
        }

        // Lookup location details
        const rack = locationInfo.rack || null;
        const bin = locationInfo.bin || null;

        // Check which columns exist in tabPutawayLine
        const [lineLocationColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayLine' 
          AND COLUMN_NAME IN ('location_id', 'rack', 'bin')
        `);
        const hasLineLocationIdColumn = lineLocationColumns.some(col => col.COLUMN_NAME === 'location_id');
        const hasLineRack = lineLocationColumns.some(col => col.COLUMN_NAME === 'rack');
        const hasLineBin = lineLocationColumns.some(col => col.COLUMN_NAME === 'bin');

        // Update ALL lines with the location
        logger.info(`[Putaway] Updating ${putawayLines.length} line(s) with location: location_id=${location_id}, rack=${rack || 'NULL'}, bin=${bin || 'NULL'}`, {
          hasLineLocationIdColumn: hasLineLocationIdColumn,
          hasLineRack: hasLineRack,
          hasLineBin: hasLineBin
        });
        
        for (const line of putawayLines) {
          let updateQuery = `UPDATE tabPutawayLine SET`;
          const updateParams = [];
          const updateFields = [];

          if (hasLineRack) {
            updateFields.push(`rack = ?`);
            updateParams.push(rack || null);
          }
          if (hasLineBin) {
            updateFields.push(`bin = ?`);
            updateParams.push(bin || null);
          }
          if (hasLineLocationIdColumn) {
            updateFields.push(`location_id = ?`);
            updateParams.push(location_id);
            logger.info(`[Putaway] Including location_id=${location_id} in UPDATE for line ID ${line.id}`);
          } else {
            logger.warn(`[Putaway] location_id column does NOT exist in tabPutawayLine - cannot update location_id for line ID ${line.id}`);
          }
          
          updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
          updateQuery += ` ${updateFields.join(', ')} WHERE id = ?`;
          updateParams.push(line.id);
          
          logger.info(`[Putaway] Executing UPDATE query: ${updateQuery} with params: [${updateParams.map(p => p || 'NULL').join(', ')}]`);
          
          const [updateResult] = await connection.execute(updateQuery, updateParams);
          logger.info(`[Putaway] Updated line ID ${line.id}: ${updateResult.affectedRows} row(s) affected`);
        }

        // Update task location_id if column exists
        const [taskLocationColumns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabPutawayTask' 
          AND COLUMN_NAME = 'location_id'
        `);
        const hasTaskLocationId = taskLocationColumns.some(col => col.COLUMN_NAME === 'location_id');
        
        if (hasTaskLocationId) {
          await connection.execute(
            `UPDATE tabPutawayTask SET location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE title = ?`,
            [location_id, taskTitleToCheck]
          );
        }

        // Update task status to "In Progress" if it's "Draft" or "Open"
        const [taskStatus] = await connection.execute(
          `SELECT status FROM tabPutawayTask WHERE title = ?`,
          [taskTitleToCheck]
        );
        
        if (taskStatus.length > 0 && (taskStatus[0].status === 'Draft' || taskStatus[0].status === 'Open')) {
          await connection.execute(
            `UPDATE tabPutawayTask SET status = 'In Progress', updated_at = CURRENT_TIMESTAMP WHERE title = ?`,
            [taskTitleToCheck]
          );
        }

        await connection.commit();
        
        // CRITICAL: Trigger stock updates after location is assigned and transaction is committed
        // This ensures stock, ledger, and history are updated when location is scanned
        // Note: We commit first, then trigger stock updates in a separate transaction
        logger.info(`[Putaway] Triggering stock updates for putaway task ${taskTitleToCheck} after location assignment`);
        
        // Release connection first, then get a new one for stock updates
        connection.release();
        
        // Trigger stock updates in a separate connection/transaction
        // This avoids nested transaction issues
        try {
          // Import processPutawayCompletionEvent to trigger stock updates
          const { processPutawayCompletionEvent } = await import('../events/eventController.js');
          const { getConnection } = await import('../../db/connection.js');
          
          // Get a new connection for stock updates
          const stockConnection = await getConnection();
          
          try {
            // Get warehouse from putaway task
            const [taskWarehouseCols] = await stockConnection.execute(`
              SELECT COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabPutawayTask'
                AND COLUMN_NAME IN ('warehouse', 'transfer_in', 'source_type')
            `);
            const hasWarehouse = taskWarehouseCols.some(col => col.COLUMN_NAME === 'warehouse');
            const hasTransferIn = taskWarehouseCols.some(col => col.COLUMN_NAME === 'transfer_in');
            const hasSourceType = taskWarehouseCols.some(col => col.COLUMN_NAME === 'source_type');
            
            let taskQuery = `SELECT`;
            if (hasWarehouse) taskQuery += ` warehouse`;
            if (hasTransferIn) taskQuery += hasWarehouse ? `, transfer_in` : ` transfer_in`;
            if (hasSourceType) taskQuery += (hasWarehouse || hasTransferIn) ? `, source_type` : ` source_type`;
            taskQuery += ` FROM tabPutawayTask WHERE title = ? LIMIT 1`;
            
            const [taskInfo] = await stockConnection.execute(taskQuery, [taskTitleToCheck]);
            let warehouse = null;
            
            if (taskInfo.length > 0) {
              const task = taskInfo[0];
              if (hasWarehouse && task.warehouse) {
                warehouse = task.warehouse;
              } else if (hasTransferIn && task.transfer_in) {
                // Get warehouse from Transfer In
                const [tiInfo] = await stockConnection.execute(
                  `SELECT to_warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
                  [task.transfer_in]
                );
                if (tiInfo.length > 0 && tiInfo[0].to_warehouse) {
                  warehouse = tiInfo[0].to_warehouse;
                }
              }
            }
            
            // Trigger stock update for each putaway line
            // Use the first carton_id from lines (for Transfer In, all lines share the same carton_id)
            const firstLine = putawayLines[0];
            const cartonIdForStock =
              (validatedBoxId && String(validatedBoxId).trim()) ||
              (firstLine?.box_id && String(firstLine.box_id).trim()) ||
              (firstLine?.carton_id && String(firstLine.carton_id).trim()) ||
              null;
            
            // Create a synthetic PUTAWAY_TO_RACK event to trigger stock updates
            // This will process all lines in the putaway task
            logger.info(`[Putaway] 🔵 About to call processPutawayCompletionEvent with params:`, {
              event_type: 'PUTAWAY_TO_RACK',
              putaway_task: taskTitleToCheck,
              box_id: validatedBoxId || 'NULL',
              carton_id: cartonIdForStock || 'NULL',
              location_id: location_id || 'NULL',
              rack: rack || 'NULL',
              bin: bin || 'NULL',
              warehouse: warehouse || 'NULL',
              user_id: user_id || 'NULL'
            });
            
            const stockUpdateResult = await processPutawayCompletionEvent(stockConnection, {
              event_type: 'PUTAWAY_TO_RACK',
              putaway_task: taskTitleToCheck,
              box_id: validatedBoxId,
              carton_id: cartonIdForStock,
              location_id: location_id,
              rack: rack,
              bin: bin,
              item_code: null, // Process all items
              qty: null, // Use qty from putaway lines
              user_id: user_id,
              store: warehouse,
              tc_id: null
            });
            
            logger.info(`[Putaway] ✅ Stock updates completed for putaway task ${taskTitleToCheck}`, {
              result: stockUpdateResult || 'undefined (function may not return value)'
            });
          } finally {
            stockConnection.release();
          }
        } catch (stockUpdateError) {
          // Log error but don't fail the location update (except item master — data quality)
          logger.error(`[Putaway] ❌❌❌ CRITICAL ERROR: Failed to trigger stock updates for putaway task ${taskTitleToCheck}`, {
            errorType: stockUpdateError?.constructor?.name || 'Unknown',
            message: stockUpdateError?.message || 'No error message',
            stack: stockUpdateError?.stack || 'No stack trace',
            code: stockUpdateError?.code || 'No error code',
            sqlMessage: stockUpdateError?.sqlMessage || 'No SQL message',
            putaway_task: taskTitleToCheck,
            location_id: location_id || 'NULL',
            warehouse: warehouse || 'NULL',
            missing_item_codes: stockUpdateError?.missing_item_codes,
          });
          // Continue - location is still updated, stock can be updated later via PUTAWAY_TO_RACK event
        }

        logger.info(`[Putaway] Updated location for putaway task ${taskTitleToCheck}: ${location_id} (${putawayLines.length} lines updated)`, {
          putaway_task: taskTitleToCheck,
          location_id: location_id,
          rack: rack,
          bin: bin,
          lines_updated: putawayLines.length,
          hasLineLocationIdColumn: hasLineLocationIdColumn,
          hasLineRack: hasLineRack,
          hasLineBin: hasLineBin
        });

        return res.status(200).json({
          ok: true,
          message: `Location ID '${location_id}' assigned to all items in putaway task ${taskTitleToCheck}`,
          data: {
            putaway_task: taskTitleToCheck,
            location_id: location_id,
            rack: rack,
            bin: bin,
            items_count: putawayLines.length,
            items: putawayLines.map(line => ({
              item_code: line.item_code,
              carton_id: line.carton_id,
              qty: parseFloat(line.qty) || 0,
              rack: rack,
              bin: bin,
              location_id: location_id
            }))
          }
        });
      } catch (updateError) {
        await connection.rollback();
        connection.release();
        logger.error(`[Putaway] Failed to update location for task ${taskTitleToCheck}:`, updateError);
        return res.status(500).json({
          ok: false,
          error: {
            code: "UPDATE_ERROR",
            message: `Failed to update location: ${updateError.message}`,
          },
        });
      }
    }

    // All validations passed - return success (validation only, no update)
    // NO CREATION - all creation happens in completePutaway
    connection.release();
    return res.status(200).json({
      ok: true,
      message: "Validation successful",
      validated: {
        carton_id: validatedCartonId || null,
        box_id: box_id || null,
        location_id: location_id,
        putaway_task: taskTitleToCheck || null, // Always include putaway_task_title for mobile app
        putaway_task_title: taskTitleToCheck || null, // Alias for consistency
        location: {
          location_id: locationInfo.location_id,
          zone: locationInfo.zone || null,
          aisle: locationInfo.aisle || null,
          rack: locationInfo.rack,
          level: locationInfo.level || null,
          bin: locationInfo.bin,
        },
        putaway_type: isAsnPutaway ? "ASN" : "TRANSFER_IN", // Indicate putaway type
      },
      ready_for_completion: true, // Enable Complete button in mobile app
    });
  } catch (error) {
    connection.release();
    logger.error("Failed to validate transfer carton for putaway", {
      errorType: error?.constructor?.name || "Unknown",
      message: error?.message || "Unknown error",
      stack: error?.stack,
      requestBody: {
        tc_id: tc_id || null,
        box_id: box_id || null,
        location_id: location_id || null,
        user_id: user_id || null,
      },
    });
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to validate transfer carton for putaway",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  }
};

/**
 * Helper function to lookup location from tabLocation table and extract rack/bin
 * Returns {rack, bin, location_id, zone, aisle, level} or throws error if location not found
 */
async function lookupLocationFromId(connection, locationId) {
  if (!locationId || locationId.trim() === "") {
    throw new Error("location_id is required");
  }

  const [locations] = await connection.execute(
    `SELECT location_id, parent_rack, bin_id, is_available, zone, aisle, level
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
    zone: location.zone || null,
    aisle: location.aisle || null,
    rack: rack || "",
    level: location.level || null,
    bin: bin || "",
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

    // Verify putaway task exists and get status/location for idempotency check
    // Check if location_id, rack, bin columns exist
    const [taskLocationColumns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabPutawayTask' 
      AND COLUMN_NAME IN ('location_id', 'rack', 'bin', 'status')
    `);
    const hasTaskLocationId = taskLocationColumns.some(col => col.COLUMN_NAME === 'location_id');
    const hasTaskRack = taskLocationColumns.some(col => col.COLUMN_NAME === 'rack');
    const hasTaskBin = taskLocationColumns.some(col => col.COLUMN_NAME === 'bin');
    const hasTaskStatus = taskLocationColumns.some(col => col.COLUMN_NAME === 'status');
    
    let taskSelectQuery = `SELECT title, advance_shipping_notice`;
    if (hasTaskStatus) taskSelectQuery += `, status`;
    if (hasTaskLocationId) taskSelectQuery += `, location_id`;
    if (hasTaskRack) taskSelectQuery += `, rack`;
    if (hasTaskBin) taskSelectQuery += `, bin`;
    taskSelectQuery += ` FROM tabPutawayTask WHERE title = ?`;
    
    const [tasks] = await connection.execute(taskSelectQuery, [putawayTaskTitle]);

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

    // IDEMPOTENCY CHECK: If task is already assigned to the same location, return success
    const task = tasks[0];
    const existingLocationId = task.location_id || null;
    const existingRack = task.rack || null;
    const existingBin = task.bin || null;
    
    // Check if already assigned to the SAME location
    const isSameLocation = 
      (locationInfo?.location_id && existingLocationId && locationInfo.location_id === existingLocationId) ||
      (!locationInfo?.location_id && existingRack && rack && 
       existingRack === rack && 
       (existingBin || "") === (bin || ""));

    // If task is Completed, don't allow reassignment
    if (task.status === 'Completed') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "TASK_ALREADY_COMPLETED",
          message: `Putaway task ${putawayTaskTitle} is already completed. Cannot reassign location.`,
        },
      });
    }

    // If already assigned to same location, return success (idempotent)
    if (isSameLocation && (task.status === 'In Progress' || task.status === 'Assigned')) {
      console.log(`✅ [Putaway] Task ${putawayTaskTitle} already assigned to same location - returning success (idempotent)`);
      
      await connection.rollback(); // No changes needed
      connection.release();
      
      return res.json({
        ok: true,
        message: "Putaway task already assigned to this location",
        data: {
          putaway_task: putawayTaskTitle,
          status: task.status,
          stock_updated: false,
          rack: existingRack,
          bin: existingBin || null,
          location_id: existingLocationId,
          items_count: putawayLines.length,
          items: putawayLines.map(line => ({
            item_code: line.item_code,
            carton_id: line.carton_id,
            qty: parseFloat(line.qty) || 0,
            rack: existingRack,
            bin: existingBin || null,
            location_id: existingLocationId,
          })),
          already_assigned: true, // Flag for mobile app to show toast instead of error
        },
      });
    }

    // If assigned to DIFFERENT location, return error
    if ((existingRack || existingLocationId) && !isSameLocation) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "ALREADY_ASSIGNED",
          message: `Putaway task ${putawayTaskTitle} is already assigned to location ${existingLocationId || `${existingRack}/${existingBin || ""}`}. Cannot reassign to different location.`,
          assigned_location: existingLocationId || `${existingRack}/${existingBin || ""}`,
          requested_location: locationInfo?.location_id || `${rack}/${bin || ""}`,
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
    // CRITICAL: Normalize warehouse to CODE (not name) for stock ledger consistency
    const taskInfo = tasks[0];
    let warehouse = null;
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

    }
    
    // Normalize warehouse to CODE (not name) - CRITICAL for stock ledger consistency
    warehouse = await normalizeWarehouseToCode(connection, warehouse);

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
 * POST /api/putaway/trigger-stock-update
 * Manual trigger to update stock for an existing putaway task
 * Useful for backfilling stock when location was scanned but stock wasn't updated
 * 
 * Request:
 * {
 *   "putaway_task": "PUT-20260120-0001",
 *   "user_id": "USER-001"
 * }
 */
export const triggerStockUpdate = async (req, res) => {
  const logPrefix = '[Putaway Stock Update]';
  logger.info(`${logPrefix} ========================================`);
  logger.info(`${logPrefix} 🔵 ENTRY: triggerStockUpdate called`);
  logger.info(`${logPrefix} Request body:`, JSON.stringify(req.body, null, 2));
  logger.info(`${logPrefix} ========================================`);
  
  const { putaway_task, user_id } = req.body;
  
  if (!putaway_task) {
    logger.error(`${logPrefix} ❌ VALIDATION FAILED: putaway_task is required`);
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "putaway_task is required"
      }
    });
  }
  
  logger.info(`${logPrefix} Step 1: Getting database connection...`);
  const { getConnection } = await import('../../db/connection.js');
  logger.info(`${logPrefix} Step 2: Importing processPutawayCompletionEvent...`);
  const { processPutawayCompletionEvent } = await import('../events/eventController.js');
  logger.info(`${logPrefix} Step 3: Getting database connection...`);
  const connection = await getConnection();
  logger.info(`${logPrefix} ✅ Got connection and imported processPutawayCompletionEvent`);
  
  try {
    // Verify putaway task exists and get info
    const [taskCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME IN ('warehouse', 'transfer_in', 'source_type', 'status')
    `);
    const hasWarehouse = taskCols.some(col => col.COLUMN_NAME === 'warehouse');
    const hasTransferIn = taskCols.some(col => col.COLUMN_NAME === 'transfer_in');
    const hasSourceType = taskCols.some(col => col.COLUMN_NAME === 'source_type');
    const hasStatus = taskCols.some(col => col.COLUMN_NAME === 'status');
    
    let taskQuery = `SELECT title`;
    if (hasWarehouse) taskQuery += `, warehouse`;
    if (hasTransferIn) taskQuery += `, transfer_in`;
    if (hasSourceType) taskQuery += `, source_type`;
    if (hasStatus) taskQuery += `, status`;
    taskQuery += ` FROM tabPutawayTask WHERE title = ? LIMIT 1`;
    
    const [tasks] = await connection.execute(taskQuery, [putaway_task]);
    
    if (tasks.length === 0) {
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "TASK_NOT_FOUND",
          message: `Putaway task ${putaway_task} not found`
        }
      });
    }
    
    const task = tasks[0];
    
    logger.info(`${logPrefix} Step 6: Checking database schema for tabPutawayLine...`);
    // Get putaway lines with location
    const [lineCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayLine'
        AND COLUMN_NAME IN ('location_id', 'rack', 'bin', 'carton_id', 'box_id')
    `);
    const hasLocationId = lineCols.some(col => col.COLUMN_NAME === 'location_id');
    const hasRack = lineCols.some(col => col.COLUMN_NAME === 'rack');
    const hasBin = lineCols.some(col => col.COLUMN_NAME === 'bin');
    const hasCartonId = lineCols.some(col => col.COLUMN_NAME === 'carton_id');
    const hasBoxId = lineCols.some(col => col.COLUMN_NAME === 'box_id');
    
    logger.info(`${logPrefix} Line schema check result:`, {
      hasLocationId,
      hasRack,
      hasBin,
      hasCartonId,
      hasBoxId
    });
    
    let lineQuery = `SELECT item_code, qty`;
    if (hasCartonId) lineQuery += `, carton_id`;
    if (hasBoxId) lineQuery += `, box_id`;
    if (hasLocationId) lineQuery += `, location_id`;
    if (hasRack) lineQuery += `, rack`;
    if (hasBin) lineQuery += `, bin`;
    lineQuery += ` FROM tabPutawayLine WHERE parent_title = ? AND item_code IS NOT NULL AND qty > 0`;
    
    logger.info(`${logPrefix} Step 7: Querying putaway lines: ${lineQuery}`);
    logger.info(`${logPrefix} Query params: [${putaway_task}]`);
    const [putawayLines] = await connection.execute(lineQuery, [putaway_task]);
    
    logger.info(`${logPrefix} Putaway lines query result:`, {
      lines_count: putawayLines.length,
      lines: putawayLines.map(line => ({
        item_code: line.item_code,
        qty: line.qty,
        location_id: hasLocationId ? (line.location_id || 'NULL') : 'N/A',
        rack: hasRack ? (line.rack || 'NULL') : 'N/A',
        bin: hasBin ? (line.bin || 'NULL') : 'N/A',
        carton_id: hasCartonId ? (line.carton_id || 'NULL') : 'N/A',
        box_id: hasBoxId ? (line.box_id || 'NULL') : 'N/A'
      }))
    });
    
    if (putawayLines.length === 0) {
      logger.error(`${logPrefix} ❌ NO LINES FOUND for task: ${putaway_task}`);
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "NO_LINES",
          message: `Putaway task ${putaway_task} has no items to update stock for`
        }
      });
    }
    
    // Check if any line has location
    const hasLocation = putawayLines.some(line => 
      (hasLocationId && line.location_id) || 
      (hasRack && line.rack) || 
      (hasBin && line.bin)
    );
    
    logger.info(`${logPrefix} Step 8: Location check:`, {
      hasLocation: hasLocation,
      lines_with_location_id: hasLocationId ? putawayLines.filter(l => l.location_id).length : 0,
      lines_with_rack: hasRack ? putawayLines.filter(l => l.rack).length : 0,
      lines_with_bin: hasBin ? putawayLines.filter(l => l.bin).length : 0,
      total_lines: putawayLines.length
    });
    
    if (!hasLocation) {
      logger.error(`${logPrefix} ❌ NO LOCATION assigned to any line for task: ${putaway_task}`);
      logger.error(`${logPrefix} Line details:`, putawayLines.map(line => ({
        item_code: line.item_code,
        location_id: hasLocationId ? (line.location_id || 'NULL') : 'N/A',
        rack: hasRack ? (line.rack || 'NULL') : 'N/A',
        bin: hasBin ? (line.bin || 'NULL') : 'N/A'
      })));
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "NO_LOCATION",
          message: `Putaway task ${putaway_task} has no location assigned. Please scan a location first.`
        }
      });
    }
    
    // Get warehouse
    let warehouse = null;
    if (hasWarehouse && task.warehouse) {
      warehouse = task.warehouse;
    } else if (hasTransferIn && task.transfer_in) {
      const [tiInfo] = await connection.execute(
        `SELECT to_warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
        [task.transfer_in]
      );
      if (tiInfo.length > 0 && tiInfo[0].to_warehouse) {
        warehouse = tiInfo[0].to_warehouse;
      }
    }
    
    if (!warehouse) {
      warehouse = 'WH-MAIN'; // Default
    }
    
    logger.info(`${logPrefix} Step 10: Getting location and carton_id from putaway lines...`);
    // Get location from lines - use the first line that has a valid location_id
    // CRITICAL: Prefer location_id over rack/bin (location_id is more reliable)
    let locationId = null;
    let rack = null;
    let bin = null;
    
    // Find first line with location_id
    for (const line of putawayLines) {
      if (hasLocationId && line.location_id && line.location_id.trim() !== '' && !line.location_id.includes('TBD')) {
        locationId = line.location_id;
        logger.info(`${logPrefix} ✅ Found location_id from line: ${locationId}`);
        break;
      }
    }
    
    // If no location_id found, try to get from rack/bin
    if (!locationId) {
      const firstLine = putawayLines[0];
      rack = hasRack ? firstLine.rack : null;
      bin = hasBin ? firstLine.bin : null;
      
      // Build location from rack/bin if both are set and not TBD
      if (rack && bin && rack !== 'TBD' && bin !== 'TBD') {
        const rackStr = String(rack).trim();
        const binStr = String(bin).trim();
        if (rackStr.endsWith(`-${binStr}`) || rackStr === binStr) {
          locationId = rackStr;
        } else {
          locationId = `${rackStr}-${binStr}`;
        }
        logger.info(`${logPrefix} ✅ Built location_id from rack/bin: ${locationId}`);
      } else if (rack && rack !== 'TBD') {
        locationId = String(rack).trim();
        logger.info(`${logPrefix} ✅ Using rack as location_id: ${locationId}`);
      } else if (bin && bin !== 'TBD') {
        locationId = String(bin).trim();
        logger.info(`${logPrefix} ✅ Using bin as location_id: ${locationId}`);
      }
    } else {
      // If we have location_id, still get rack/bin for logging
      const firstLine = putawayLines[0];
      rack = hasRack ? firstLine.rack : null;
      bin = hasBin ? firstLine.bin : null;
    }
    
    const firstLine = putawayLines[0];
    const cartonId = hasCartonId ? firstLine.carton_id : (hasBoxId ? firstLine.box_id : null);
    const boxId = cartonId; // For Transfer In, box_id = carton_id
    
    logger.info(`${logPrefix} First line values:`, {
      location_id: locationId || 'NULL',
      rack: rack || 'NULL',
      bin: bin || 'NULL',
      carton_id: cartonId || 'NULL',
      box_id: boxId || 'NULL'
    });
    
    // CRITICAL: If location_id is not in lines, try to get from tabPutawayTask
    if (!locationId) {
      logger.info(`${logPrefix} Step 10a: location_id not in lines, checking tabPutawayTask...`);
      const [taskLocationCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabPutawayTask'
          AND COLUMN_NAME = 'location_id'
      `);
      const hasTaskLocationId = taskLocationCols.length > 0;
      
      if (hasTaskLocationId) {
        const [taskLocation] = await connection.execute(
          `SELECT location_id FROM tabPutawayTask WHERE title = ? LIMIT 1`,
          [putaway_task]
        );
        if (taskLocation.length > 0 && taskLocation[0].location_id) {
          locationId = taskLocation[0].location_id;
          logger.info(`${logPrefix} ✅ Got location_id from putaway task: ${locationId}`);
        } else {
          logger.warn(`${logPrefix} ⚠️ Task location_id is NULL`);
        }
      } else {
        logger.warn(`${logPrefix} ⚠️ tabPutawayTask.location_id column does not exist`);
      }
    }
    
    logger.info(`${logPrefix} Step 11: Final values before calling processPutawayCompletionEvent:`, {
      warehouse,
      location_id: locationId || 'NULL',
      rack: rack || 'NULL',
      bin: bin || 'NULL',
      carton_id: cartonId || 'NULL',
      box_id: boxId || 'NULL',
      lines_count: putawayLines.length,
      lines_with_location: putawayLines.filter(line => 
        (hasLocationId && line.location_id) || 
        (hasRack && line.rack) || 
        (hasBin && line.bin)
      ).length
    });
    
    // CRITICAL: Validate location_id before calling processPutawayCompletionEvent
    if (!locationId || locationId.trim() === '' || locationId.includes('TBD')) {
      logger.error(`${logPrefix} ========================================`);
      logger.error(`${logPrefix} ❌ CRITICAL ERROR: Invalid location_id:`, {
        location_id: locationId || 'NULL',
        rack: rack || 'NULL',
        bin: bin || 'NULL',
        putaway_task: putaway_task,
        lines_checked: putawayLines.length
      });
      logger.error(`${logPrefix} Line details:`, putawayLines.map(line => ({
        item_code: line.item_code,
        location_id: hasLocationId ? (line.location_id || 'NULL') : 'N/A',
        rack: hasRack ? (line.rack || 'NULL') : 'N/A',
        bin: hasBin ? (line.bin || 'NULL') : 'N/A'
      })));
      logger.error(`${logPrefix} ========================================`);
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_LOCATION",
          message: `Putaway task ${putaway_task} has invalid location. location_id=${locationId || 'NULL'}, rack=${rack || 'NULL'}, bin=${bin || 'NULL'}. Please ensure location is scanned and set on putaway lines.`
        }
      });
    }
    
    // Trigger stock update
    logger.info(`${logPrefix} ========================================`);
    logger.info(`${logPrefix} Step 12: CALLING processPutawayCompletionEvent`);
    logger.info(`${logPrefix} Event params:`, JSON.stringify({
      event_type: 'PUTAWAY_TO_RACK',
      putaway_task: putaway_task,
      box_id: boxId || 'NULL',
      carton_id: cartonId || 'NULL',
      location_id: locationId || 'NULL',
      rack: rack || 'NULL',
      bin: bin || 'NULL',
      item_code: null,
      qty: null,
      user_id: user_id || 'SYSTEM',
      store: warehouse || 'NULL',
      tc_id: null
    }, null, 2));
    logger.info(`${logPrefix} ========================================`);
    
    try {
      const result = await processPutawayCompletionEvent(connection, {
        event_type: 'PUTAWAY_TO_RACK',
        putaway_task: putaway_task,
        box_id: boxId,
        carton_id: cartonId,
        location_id: locationId, // CRITICAL: Must be valid (not NULL, not empty, not TBD)
        rack: rack,
        bin: bin,
        item_code: null, // Process all items
        qty: null, // Use qty from putaway lines
        user_id: user_id || 'SYSTEM',
        store: warehouse,
        tc_id: null
      });
      
      logger.info(`${logPrefix} Step 13: processPutawayCompletionEvent returned:`, result || 'undefined (no return value)');
    } catch (stockError) {
      logger.error(`${logPrefix} ========================================`);
      logger.error(`${logPrefix} ❌ ERROR in processPutawayCompletionEvent:`, {
        error: stockError.message,
        stack: stockError.stack,
        putaway_task: putaway_task,
        location_id: locationId || 'NULL',
        carton_id: cartonId || 'NULL'
      });
      logger.error(`${logPrefix} ========================================`);
      throw stockError; // Re-throw to return error response
    }
    
    connection.release();
    
    logger.info(`${logPrefix} ========================================`);
    logger.info(`${logPrefix} ✅ Stock updates completed for task ${putaway_task}`);
    logger.info(`${logPrefix} ========================================`);
    
    return res.status(200).json({
      ok: true,
      message: `Stock updates triggered for putaway task ${putaway_task}`,
      data: {
        putaway_task: putaway_task,
        warehouse: warehouse,
        location_id: locationId,
        items_updated: putawayLines.length
      }
    });
    
  } catch (error) {
    connection.release();
    logger.error(`[Putaway Stock Update] Failed to trigger stock update:`, {
      error: error.message,
      stack: error.stack,
      putaway_task: putaway_task
    });
    return res.status(500).json({
      ok: false,
      error: {
        code: "STOCK_UPDATE_ERROR",
        message: `Failed to trigger stock update: ${error.message}`,
        details: process.env.NODE_ENV === 'development' ? error.stack : null
      }
    });
  }
};

/**
 * POST /api/putaway/create-tasks
 * Idempotent Transfer In putaway bootstrap: ensures tabPutawayTask exists for a TI
 * after receiving (mobile calls with { transfer_in }).
 */
export const createTasks = async (req, res) => {
  const transfer_in = (
    req.body?.transfer_in ??
    req.body?.transferIn ??
    ""
  )
    .toString()
    .trim();

  if (!transfer_in) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "transfer_in is required",
      },
    });
  }

  const connection = await getConnection();
  try {
    await connection.beginTransaction();

    const [tiRows] = await connection.execute(
      `SELECT title, to_warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
      [transfer_in]
    );

    if (!tiRows.length) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${transfer_in} not found`,
        },
      });
    }

    const tiTitle = tiRows[0].title || transfer_in;
    const warehouse = tiRows[0].to_warehouse || "WH-MAIN";

    const { createPutawayTaskFromTransferIn } = await import(
      "../transfer-in/transferInController.js"
    );
    const result = await createPutawayTaskFromTransferIn(
      connection,
      tiTitle,
      warehouse
    );

    if (!result.ok) {
      await connection.rollback();
      if (result.code === "NO_RECEIVED_QTY") {
        return res.status(422).json({
          ok: false,
          error: {
            code: result.code,
            message: result.message,
            transfer_in: tiTitle,
          },
        });
      }
      return res.status(500).json({
        ok: false,
        error: {
          code: result.code || "ERROR",
          message: result.message || "Putaway task creation failed",
          transfer_in: tiTitle,
        },
      });
    }

    await connection.commit();

    return res.json({
      ok: true,
      message: result.created
        ? "Putaway task created for Transfer In."
        : "Putaway task already exists for Transfer In.",
      data: {
        transfer_in: tiTitle,
        putaway_task: result.putaway_task,
        created: result.created,
      },
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {
      /* ignore */
    }
    logger.error("[Putaway create-tasks] Failed:", err);
    return res.status(500).json({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: err.message,
      },
    });
  } finally {
    connection.release();
  }
};
