// wms-api/src/modules/transfer-in/transferInController.js
// Transfer In API endpoints (Showroom to Warehouse)

import { getConnection } from "../../db/connection.js";

/**
 * GET /api/transfer-in
 * Get all Transfer In documents
 *
 * Query Parameters:
 * - status (optional): Filter by status (Draft, Submitted, In Transit, Received, Completed)
 * - from_showroom (optional): Filter by source showroom
 * - to_warehouse (optional): Filter by destination warehouse
 *
 * Response Format:
 * [
 *   {
 *     "title": "TI-0001",
 *     "status": "Received",
 *     "from_showroom": "SHOWROOM-001",
 *     "to_warehouse": "WH-MAIN",
 *     "transfer_date": "2025-12-27",
 *     "expected_arrival_date": "2025-12-27",
 *     "prepared_by": "USER-001",
 *     "received_by": "USER-002",
 *     "received_on": "2025-12-27T10:30:00.000Z",
 *     "total_qty": 150.00,
 *     "items": [
 *       {
 *         "item_code": "ITEM-001",
 *         "qty": 50.00,
 *         "carton_id": "CTN-0101",
 *         "received_qty": 50.00
 *       }
 *     ],
 *     "created_at": "2025-12-27T08:00:00.000Z",
 *     "updated_at": "2025-12-27T10:30:00.000Z"
 *   }
 * ]
 */
export const getTransferIns = async (req, res) => {
  const connection = await getConnection();

  try {
    const { status, from_showroom, to_warehouse } = req.query;

    let query = `
      SELECT 
        title,
        status,
        from_showroom,
        to_warehouse,
        transfer_date,
        expected_arrival_date,
        prepared_by,
        received_by,
        received_on,
        total_qty,
        created_at,
        updated_at
      FROM tabTransferIn
      WHERE 1=1
    `;

    const params = [];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (from_showroom) {
      query += " AND from_showroom = ?";
      params.push(from_showroom);
    }

    if (to_warehouse) {
      query += " AND to_warehouse = ?";
      params.push(to_warehouse);
    }

    query += " ORDER BY transfer_date DESC, title";

    const [rows] = await connection.execute(query, params);

    // Get items for each Transfer In
    const transferIns = await Promise.all(
      rows.map(async (row) => {
        const [itemRows] = await connection.execute(
          `
        SELECT item_code, qty, carton_id, received_qty
        FROM tabTransferInItem
        WHERE parent_title = ?
        ORDER BY item_code
      `,
          [row.title]
        );

        const items = itemRows.map((item) => ({
          item_code: item.item_code,
          qty: parseFloat(item.qty) || 0,
          carton_id: item.carton_id || null,
          received_qty: parseFloat(item.received_qty) || 0,
        }));

        return {
          title: row.title,
          status: row.status,
          from_showroom: row.from_showroom,
          to_warehouse: row.to_warehouse,
          transfer_date: row.transfer_date
            ? row.transfer_date.toISOString().split("T")[0]
            : null,
          expected_arrival_date: row.expected_arrival_date
            ? row.expected_arrival_date.toISOString().split("T")[0]
            : null,
          prepared_by: row.prepared_by,
          received_by: row.received_by || null,
          received_on: row.received_on ? row.received_on.toISOString() : null,
          total_qty: parseFloat(row.total_qty) || 0,
          items: items,
          created_at: row.created_at ? row.created_at.toISOString() : null,
          updated_at: row.updated_at ? row.updated_at.toISOString() : null,
        };
      })
    );

    res.json(transferIns);
  } catch (error) {
    console.error("Failed to fetch Transfer Ins:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to fetch Transfer Ins",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/transfer-in/:title
 * Get a single Transfer In document by title
 */
export const getTransferInByTitle = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;

    const [rows] = await connection.execute(
      `
      SELECT 
        title,
        status,
        from_showroom,
        to_warehouse,
        transfer_date,
        expected_arrival_date,
        prepared_by,
        received_by,
        received_on,
        total_qty,
        created_at,
        updated_at
      FROM tabTransferIn
      WHERE title = ?
    `,
      [title]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${title} not found`,
        },
      });
    }

    const row = rows[0];

    // Get items
    const [itemRows] = await connection.execute(
      `
      SELECT item_code, qty, carton_id, received_qty
      FROM tabTransferInItem
      WHERE parent_title = ?
      ORDER BY item_code
    `,
      [title]
    );

    const items = itemRows.map((item) => ({
      item_code: item.item_code,
      qty: parseFloat(item.qty) || 0,
      carton_id: item.carton_id || null,
      received_qty: parseFloat(item.received_qty) || 0,
    }));

    res.json({
      title: row.title,
      status: row.status,
      from_showroom: row.from_showroom,
      to_warehouse: row.to_warehouse,
      transfer_date: row.transfer_date
        ? row.transfer_date.toISOString().split("T")[0]
        : null,
      expected_arrival_date: row.expected_arrival_date
        ? row.expected_arrival_date.toISOString().split("T")[0]
        : null,
      prepared_by: row.prepared_by,
      received_by: row.received_by || null,
      received_on: row.received_on ? row.received_on.toISOString() : null,
      total_qty: parseFloat(row.total_qty) || 0,
      items: items,
      created_at: row.created_at ? row.created_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    });
  } catch (error) {
    console.error("Failed to fetch Transfer In:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to fetch Transfer In",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-in
 * Create a new Transfer In document
 *
 * Request Body:
 * {
 *   "title": "TI-0001",
 *   "from_showroom": "SHOWROOM-001",
 *   "to_warehouse": "WH-MAIN",
 *   "transfer_date": "2025-12-27",
 *   "expected_arrival_date": "2025-12-27",
 *   "prepared_by": "USER-001",
 *   "items": [
 *     {
 *       "item_code": "ITEM-001",
 *       "qty": 50.00,
 *       "carton_id": "CTN-0101"
 *     }
 *   ]
 * }
 */
export const createTransferIn = async (req, res) => {
  const connection = await getConnection();

  try {
    const {
      title,
      from_showroom,
      to_warehouse,
      transfer_date,
      expected_arrival_date,
      prepared_by,
      items,
    } = req.body;

    // Validation
    if (
      !title ||
      !from_showroom ||
      !to_warehouse ||
      !transfer_date ||
      !prepared_by
    ) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "title, from_showroom, to_warehouse, transfer_date, and prepared_by are required",
        },
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "items array is required and must not be empty",
        },
      });
    }

    // Calculate total_qty
    const total_qty = items.reduce(
      (sum, item) => sum + (parseFloat(item.qty) || 0),
      0
    );

    // Insert Transfer In
    await connection.execute(
      `
      INSERT INTO tabTransferIn 
        (title, status, from_showroom, to_warehouse, transfer_date, expected_arrival_date, prepared_by, total_qty)
      VALUES (?, 'Draft', ?, ?, ?, ?, ?, ?)
    `,
      [
        title,
        from_showroom,
        to_warehouse,
        transfer_date,
        expected_arrival_date || null,
        prepared_by,
        total_qty,
      ]
    );

    // Insert items
    for (const item of items) {
      await connection.execute(
        `
        INSERT INTO tabTransferInItem 
          (parent_title, item_code, qty, carton_id, received_qty)
        VALUES (?, ?, ?, ?, 0)
      `,
        [title, item.item_code, item.qty, item.carton_id || null]
      );
    }

    res.status(201).json({
      ok: true,
      message: "Transfer In created successfully",
      data: {
        title: title,
        status: "Draft",
        total_qty: total_qty,
      },
    });
  } catch (error) {
    console.error("Failed to create Transfer In:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        ok: false,
        error: {
          code: "DUPLICATE_ENTRY",
          message: "Transfer In with this title already exists",
        },
      });
    }

    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to create Transfer In",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-in/:title/submit
 * Submit a Transfer In document (change status from Draft to Submitted)
 */
export const submitTransferIn = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;

    // Check if Transfer In exists
    const [rows] = await connection.execute(
      `
      SELECT status FROM tabTransferIn WHERE title = ?
    `,
      [title]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${title} not found`,
        },
      });
    }

    if (rows[0].status !== "Draft") {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Transfer In ${title} is already ${rows[0].status}. Only Draft Transfer Ins can be submitted.`,
        },
      });
    }

    // Update status to Submitted
    await connection.execute(
      `
      UPDATE tabTransferIn
      SET status = 'Submitted',
          updated_at = NOW()
      WHERE title = ?
    `,
      [title]
    );

    res.json({
      ok: true,
      message: "Transfer In submitted successfully",
      data: {
        title: title,
        status: "Submitted",
      },
    });
  } catch (error) {
    console.error("Failed to submit Transfer In:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to submit Transfer In",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-in/:title/receive-line
 * Receive items from Transfer In (handles both cartonized and loose items)
 *
 * Request Body (Cartonized - Receive by Carton):
 * {
 *   "carton_id": "CTN-TI-001",
 *   "received_by": "USER-002"
 * }
 *
 * Request Body (Loose Item - Receive by Item):
 * {
 *   "item_code": "ITEM-001",
 *   "received_qty": 50.00,
 *   "received_by": "USER-002"
 * }
 */
export const receiveTransferInLine = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;
    const { carton_id, item_code, received_qty, received_by } = req.body;

    // Validation
    if (!received_by) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "received_by is required",
        },
      });
    }

    // Check if Transfer In exists
    const [tiRows] = await connection.execute(
      `
      SELECT status, to_warehouse FROM tabTransferIn WHERE title = ?
    `,
      [title]
    );

    if (tiRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${title} not found`,
        },
      });
    }

    const transferIn = tiRows[0];

    if (transferIn.status === "Completed") {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Transfer In ${title} is already Completed`,
        },
      });
    }

    await connection.beginTransaction();

    try {
      // Scenario A: Receive by Carton ID
      if (carton_id && !item_code) {
        // Get all items with this carton_id
        const [items] = await connection.execute(
          `
          SELECT item_code, qty, received_qty
          FROM tabTransferInItem
          WHERE parent_title = ?
            AND carton_id = ?
        `,
          [title, carton_id]
        );

        if (items.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: `No items found with carton_id ${carton_id} in Transfer In ${title}`,
            },
          });
        }

        // Update all items in carton to received
        // CRITICAL: Also ensure carton_id is set in tabTransferInItem if it was missing
        let updatedCount = 0;
        for (const item of items) {
          const newReceivedQty = parseFloat(item.qty);
          if (newReceivedQty > parseFloat(item.received_qty)) {
            // Check if carton_id column exists
            const [cartonIdColCheck] = await connection.execute(`
              SELECT COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferInItem'
                AND COLUMN_NAME = 'carton_id'
            `);
            const hasCartonIdColumn = cartonIdColCheck.length > 0;
            
            if (hasCartonIdColumn) {
              // Update received_qty AND ensure carton_id is set
              // This ensures carton_id is populated for putaway task creation
              await connection.execute(
                `
                UPDATE tabTransferInItem
                SET received_qty = ?,
                    carton_id = ?,
                    updated_at = NOW()
                WHERE parent_title = ?
                  AND item_code = ?
                  AND (carton_id = ? OR carton_id IS NULL)
              `,
                [newReceivedQty, carton_id, title, item.item_code, carton_id]
              );
              console.log(`[Transfer In] ✅ Set carton_id=${carton_id} for item ${item.item_code} in Transfer In ${title}`);
            } else {
              // Column doesn't exist, just update received_qty
              await connection.execute(
                `
                UPDATE tabTransferInItem
                SET received_qty = ?,
                    updated_at = NOW()
                WHERE parent_title = ?
                  AND item_code = ?
              `,
                [newReceivedQty, title, item.item_code]
              );
            }
            updatedCount++;
          }
        }

        // Check if all items are received (BEFORE commit)
        const [remainingCarton] = await connection.execute(
          `
          SELECT COUNT(*) as count
          FROM tabTransferInItem
          WHERE parent_title = ?
            AND received_qty < qty
        `,
          [title]
        );

        if (remainingCarton[0].count === 0) {
          // All items received - update Transfer In status
          await connection.execute(
            `
            UPDATE tabTransferIn
            SET status = 'Received',
                received_by = ?,
                received_on = NOW(),
                updated_at = NOW()
            WHERE title = ?
          `,
            [received_by, title]
          );

          // Auto-create Putaway Task (within transaction)
          await createPutawayTaskFromTransferIn(
            connection,
            title,
            transferIn.to_warehouse
          );
        } else if (transferIn.status === "Submitted") {
          // Some items received - update status to In Transit
          await connection.execute(
            `
            UPDATE tabTransferIn
            SET status = 'In Transit',
                updated_at = NOW()
            WHERE title = ?
          `,
            [title]
          );
        }

        await connection.commit();

        res.json({
          ok: true,
          message: `Received ${updatedCount} items from carton ${carton_id}`,
          data: {
            transfer_in: title,
            carton_id: carton_id,
            items_received: updatedCount,
          },
        });
      }
      // Scenario B: Receive Loose Item
      else if (item_code && !carton_id && received_qty !== undefined) {
        // Validate received_qty
        if (parseFloat(received_qty) <= 0) {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "received_qty must be greater than 0",
            },
          });
        }

        // Get item
        const [items] = await connection.execute(
          `
          SELECT qty, received_qty
          FROM tabTransferInItem
          WHERE parent_title = ?
            AND item_code = ?
            AND carton_id IS NULL
        `,
          [title, item_code]
        );

        if (items.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: `Item ${item_code} not found in Transfer In ${title} (or item has carton_id)`,
            },
          });
        }

        const item = items[0];
        const expectedQty = parseFloat(item.qty);
        const currentReceivedQty = parseFloat(item.received_qty) || 0;
        const newReceivedQty = parseFloat(received_qty);

        // Validate: new received_qty should not exceed expected qty
        if (currentReceivedQty + newReceivedQty > expectedQty) {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `Cannot receive ${newReceivedQty}. Already received: ${currentReceivedQty}, Expected: ${expectedQty}. Maximum additional: ${
                expectedQty - currentReceivedQty
              }`,
            },
          });
        }

        // Update received_qty (incremental)
        const finalReceivedQty = currentReceivedQty + newReceivedQty;
        await connection.execute(
          `
          UPDATE tabTransferInItem
          SET received_qty = ?,
              updated_at = NOW()
          WHERE parent_title = ?
            AND item_code = ?
            AND carton_id IS NULL
        `,
          [finalReceivedQty, title, item_code]
        );

        // Check if all items are received (BEFORE commit)
        const [remainingLoose] = await connection.execute(
          `
          SELECT COUNT(*) as count
          FROM tabTransferInItem
          WHERE parent_title = ?
            AND received_qty < qty
        `,
          [title]
        );

        if (remainingLoose[0].count === 0) {
          // All items received - update Transfer In status
          await connection.execute(
            `
            UPDATE tabTransferIn
            SET status = 'Received',
                received_by = ?,
                received_on = NOW(),
                updated_at = NOW()
            WHERE title = ?
          `,
            [received_by, title]
          );

          // Auto-create Putaway Task (within transaction)
          await createPutawayTaskFromTransferIn(
            connection,
            title,
            transferIn.to_warehouse
          );
        } else if (transferIn.status === "Submitted") {
          // Some items received - update status to In Transit
          await connection.execute(
            `
            UPDATE tabTransferIn
            SET status = 'In Transit',
                updated_at = NOW()
            WHERE title = ?
          `,
            [title]
          );
        }

        await connection.commit();

        res.json({
          ok: true,
          message: `Received ${newReceivedQty} units of ${item_code}`,
          data: {
            transfer_in: title,
            item_code: item_code,
            received_qty: finalReceivedQty,
            expected_qty: expectedQty,
          },
        });
      }
      // Invalid request
      else {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Either (carton_id) OR (item_code + received_qty) must be provided, but not both",
          },
        });
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Failed to receive Transfer In line:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to receive Transfer In line",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * Helper function to create Putaway Task from Transfer In
 */
async function createPutawayTaskFromTransferIn(
  connection,
  transferInTitle,
  warehouse
) {
  try {
    console.log(
      `🔄 Creating Putaway Task for Transfer In ${transferInTitle} (warehouse: ${warehouse || "N/A"})`
    );

    // Check if source_type and transfer_in columns exist FIRST
    // This must be done before checking for existing tasks
    const [sourceTypeCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'source_type'
    `);
    const hasSourceType = sourceTypeCols.length > 0;

    const [transferInCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'transfer_in'
    `);
    const hasTransferIn = transferInCols.length > 0;

    // Check if warehouse column exists
    const [warehouseCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'warehouse'
    `);
    const hasWarehouse = warehouseCols.length > 0;

    // Check if inbound_session column exists and if it's nullable
    const [inboundSessionCols] = await connection.execute(`
      SELECT COLUMN_NAME, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'inbound_session'
    `);
    const hasInboundSession = inboundSessionCols.length > 0;
    const inboundSessionNullable = hasInboundSession && inboundSessionCols[0].IS_NULLABLE === 'YES';
    
    // For Transfer In, we might not have an inbound session
    // Try to get it from tabInboundSession if it exists, otherwise use null or empty string
    let inboundSession = null;
    if (hasInboundSession && !inboundSessionNullable) {
      // Column exists and is NOT NULL - try to find an inbound session
      // Check if transfer_in column exists in tabInboundSession, otherwise use asn_no
      const [transferInColCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabInboundSession'
          AND COLUMN_NAME = 'transfer_in'
      `);
      const hasTransferInInSession = transferInColCheck.length > 0;
      
      // Check which column to use for started_at/started_on
      const [startedColCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabInboundSession'
          AND COLUMN_NAME IN ('started_at', 'started_on')
        LIMIT 1
      `);
      const startedColumn = startedColCheck.length > 0 ? startedColCheck[0].COLUMN_NAME : 'started_at';
      
      // Check which column to use for session ID
      const [sessionIdColCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabInboundSession'
          AND COLUMN_NAME IN ('inbound_session', 'title')
        LIMIT 1
      `);
      const sessionIdColumn = sessionIdColCheck.length > 0 ? sessionIdColCheck[0].COLUMN_NAME : 'inbound_session';
      
      if (hasTransferInInSession) {
        // Use transfer_in column if it exists
        const [sessionRows] = await connection.execute(
          `SELECT ${sessionIdColumn} as inbound_session FROM tabInboundSession WHERE transfer_in = ? ORDER BY ${startedColumn} DESC LIMIT 1`,
          [transferInTitle]
        );
        inboundSession = sessionRows.length > 0 ? sessionRows[0].inbound_session : null;
      } else {
        // Use asn_no column with Transfer In title as value
        const [sessionRows] = await connection.execute(
          `SELECT ${sessionIdColumn} as inbound_session FROM tabInboundSession WHERE asn_no = ? ORDER BY ${startedColumn} DESC LIMIT 1`,
          [transferInTitle]
        );
        inboundSession = sessionRows.length > 0 ? sessionRows[0].inbound_session : null;
      }
      
      // If no session found and column is NOT NULL, use empty string as placeholder
      if (!inboundSession) {
        inboundSession = ""; // Empty string placeholder
      }
    }

    // Check if Putaway Task already exists for this Transfer In
    // Only check if we have the required columns
    if (hasSourceType && hasTransferIn) {
      const [existingTasks] = await connection.execute(
        `
        SELECT title FROM tabPutawayTask
        WHERE source_type = 'TransferIn'
          AND transfer_in = ?
      `,
        [transferInTitle]
      );

      if (existingTasks.length > 0) {
        console.log(
          `⚠️ Putaway Task already exists for Transfer In ${transferInTitle}: ${existingTasks[0].title}`
        );
        return;
      }
    } else if (hasSourceType) {
      // Fallback: check by source_type and advance_shipping_notice
      const [existingTasks] = await connection.execute(
        `
        SELECT title FROM tabPutawayTask
        WHERE source_type = 'TransferIn'
          AND advance_shipping_notice = ?
      `,
        [transferInTitle]
      );

      if (existingTasks.length > 0) {
        console.log(
          `⚠️ Putaway Task already exists for Transfer In ${transferInTitle}: ${existingTasks[0].title}`
        );
        return;
      }
    } else {
      // Fallback: check by advance_shipping_notice only
      const [existingTasks] = await connection.execute(
        `
        SELECT title FROM tabPutawayTask
        WHERE advance_shipping_notice = ?
      `,
        [transferInTitle]
      );

      if (existingTasks.length > 0) {
        console.log(
          `⚠️ Putaway Task already exists for Transfer In ${transferInTitle}: ${existingTasks[0].title}`
        );
        return;
      }
    }

    // Get all received items from Transfer In
    const [items] = await connection.execute(
      `
      SELECT item_code, carton_id, received_qty
      FROM tabTransferInItem
      WHERE parent_title = ?
        AND received_qty > 0
      ORDER BY item_code
    `,
      [transferInTitle]
    );

    if (items.length === 0) {
      console.log(
        `⚠️ No items to put away for Transfer In ${transferInTitle} (all items have received_qty = 0)`
      );
      return;
    }

    console.log(
      `📦 Found ${items.length} item(s) to put away for Transfer In ${transferInTitle}`
    );

    // Generate Putaway Task title
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const [sequenceRows] = await connection.execute(
      `
      SELECT COUNT(*) + 1 as seq
      FROM tabPutawayTask
      WHERE title LIKE ?
    `,
      [`PUT-${dateStr}-%`]
    );
    const sequence = String(sequenceRows[0].seq).padStart(4, "0");
    const putawayTaskTitle = `PUT-${dateStr}-${sequence}`;

    console.log(
      `📝 Generated Putaway Task title: ${putawayTaskTitle} (columns: source_type=${hasSourceType}, transfer_in=${hasTransferIn}, warehouse=${hasWarehouse})`
    );

    // Create Putaway Task
    // Note: advance_shipping_notice cannot be NULL, so we store Transfer In number there
    // This allows the column to be used for both ASN (ASN number) and Transfer In (Transfer In number)

    // Build INSERT statement dynamically based on available columns
    const insertFields = ['title', 'status', 'created_by', 'created_at', 'updated_at'];
    const insertValues = [putawayTaskTitle, 'Draft', 'SYSTEM'];
    const insertPlaceholders = ['?', '?', '?', 'NOW()', 'NOW()'];

    if (hasSourceType) {
      insertFields.push('source_type');
      insertValues.push('TransferIn');
      insertPlaceholders.push('?');
    }

    if (hasTransferIn) {
      insertFields.push('transfer_in');
      insertValues.push(transferInTitle);
      insertPlaceholders.push('?');
    }

    if (hasWarehouse) {
      insertFields.push('warehouse');
      insertValues.push(warehouse);
      insertPlaceholders.push('?');
    }

    // advance_shipping_notice is required (NOT NULL), so always include it
    insertFields.push('advance_shipping_notice');
    insertValues.push(transferInTitle);
    insertPlaceholders.push('?');

    // inbound_session: include only if column exists
    if (hasInboundSession) {
      insertFields.push('inbound_session');
      insertValues.push(inboundSession);
      insertPlaceholders.push('?');
    }

    const sql = `
      INSERT INTO tabPutawayTask
        (${insertFields.join(', ')})
      VALUES (${insertPlaceholders.join(', ')})
    `;

    await connection.execute(sql, insertValues);

    // Create Putaway Lines
    // Check if status column exists in tabPutawayLine
    const [statusColCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayLine'
        AND COLUMN_NAME = 'status'
    `);
    const hasStatusInLine = statusColCheck.length > 0;

    for (const item of items) {
      if (hasStatusInLine) {
        await connection.execute(
          `
          INSERT INTO tabPutawayLine
            (parent_title, item_code, carton_id, qty, rack, bin, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'TBD', 'TBD', 'Pending', NOW(), NOW())
        `,
          [
            putawayTaskTitle,
            item.item_code,
            item.carton_id || null,
            item.received_qty,
          ]
        );
      } else {
        await connection.execute(
          `
          INSERT INTO tabPutawayLine
            (parent_title, item_code, carton_id, qty, rack, bin, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'TBD', 'TBD', NOW(), NOW())
        `,
          [
            putawayTaskTitle,
            item.item_code,
            item.carton_id || null,
            item.received_qty,
          ]
        );
      }
    }

    console.log(
      `✅ Created Putaway Task ${putawayTaskTitle} for Transfer In ${transferInTitle} with ${items.length} items`
    );
    console.log(
      `   - Putaway Task: ${putawayTaskTitle}`
    );
    console.log(
      `   - Items: ${items.length}`
    );
    console.log(
      `   - Warehouse: ${warehouse || "N/A"}`
    );
    console.log(
      `   - Source Type: TransferIn`
    );
    
    // Log carton_id information for debugging
    const itemsWithCartonId = items.filter(item => item.carton_id);
    const itemsWithoutCartonId = items.filter(item => !item.carton_id);
    console.log(
      `   - Items with carton_id: ${itemsWithCartonId.length}`
    );
    if (itemsWithoutCartonId.length > 0) {
      console.warn(
        `   ⚠️ Items without carton_id: ${itemsWithoutCartonId.length} - ${itemsWithoutCartonId.map(i => i.item_code).join(', ')}`
      );
    }
  } catch (error) {
    console.error(
      `❌ Failed to create Putaway Task for Transfer In ${transferInTitle}:`,
      error
    );
    console.error(
      `   Error details:`,
      {
        message: error.message,
        code: error.code,
        sqlState: error.sqlState,
        sql: error.sql
      }
    );
    // Don't throw - this is a helper function, errors are logged but don't fail the receive operation
    // But we should log it clearly so it can be debugged
  }
}
