// wms-api/src/modules/transfer-in/transferInController.js
// Transfer In API endpoints (Showroom to Warehouse)

import { getConnection } from "../../db/connection.js";

/**
 * Helper function to compute Transfer In item status based on received_qty vs qty
 * @param {number} receivedQty - Current received quantity
 * @param {number} expectedQty - Expected quantity
 * @returns {string} - Status: 'Pending', 'Picking', or 'Received'
 */
function computeTransferInItemStatus(receivedQty, expectedQty) {
  // Status should remain "Picking" when receiving, not automatically change to "Received"
  // Status will only be set to "Received" via explicit API call
  if (receivedQty > 0) {
    return 'Picking';
  } else {
    return 'Pending';
  }
}

/**
 * Recalculate Transfer In header status based on item received_qty and completion status
 * Status Rules:
 * - If completed (completed_at IS NOT NULL OR is_completed = 1) → "Received"
 * - If ANY item has received_qty > 0 → "Receiving"
 * - If no items received AND NOT completed → "Submitted"
 * 
 * @param {object} connection - Database connection
 * @param {string} transferInTitle - Transfer In title
 * @returns {Promise<string>} - New status
 */
export async function recalculateTransferInStatus(connection, transferInTitle) {
  try {
    // Check if completion fields exist
    const [completionCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferIn'
        AND COLUMN_NAME IN ('completed_at', 'is_completed')
    `);
    
    const hasCompletionFields = completionCols.length > 0;
    
    // Get Transfer In header with completion status
    let headerSql = `SELECT status`;
    if (hasCompletionFields) {
      if (completionCols.some(col => col.COLUMN_NAME === 'completed_at')) {
        headerSql += `, completed_at`;
      }
      if (completionCols.some(col => col.COLUMN_NAME === 'is_completed')) {
        headerSql += `, is_completed`;
      }
    }
    headerSql += ` FROM tabTransferIn WHERE title = ?`;
    
    const [headerRows] = await connection.execute(headerSql, [transferInTitle]);
    
    if (headerRows.length === 0) {
      console.warn(`⚠️  Transfer In ${transferInTitle} not found for status recalculation`);
      return null;
    }
    
    const header = headerRows[0];
    const currentStatus = header.status;
    
    // Check if completed
    let isCompleted = false;
    if (hasCompletionFields) {
      if (header.completed_at) {
        isCompleted = true;
      } else if (header.is_completed !== undefined && header.is_completed !== null) {
        isCompleted = header.is_completed === 1 || header.is_completed === true;
      }
    }
    
    // Calculate totals from lines
    // If multi-carton tables exist, use SUM from carton lines (more accurate)
    // Otherwise, use received_qty from tabTransferInItem (legacy mode)
    const [cartonTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCartonLine'
    `);
    
    const hasCartonLineTable = cartonTableCheck.length > 0;
    
    let totalReceived = 0;
    let totalRequired = 0;
    
    if (hasCartonLineTable) {
      // MULTI-CARTON MODE: Calculate from carton lines
      const [cartonLineTotals] = await connection.execute(`
        SELECT 
          COALESCE(SUM(cl.received_qty), 0) as total_received,
          COALESCE(SUM(DISTINCT i.qty), 0) as total_required
        FROM tabTransferInItem i
        LEFT JOIN tabTransferInCartonLine cl ON cl.transfer_in = i.parent_title AND cl.item_code = i.item_code
        WHERE i.parent_title = ?
      `, [transferInTitle]);
      
      totalReceived = parseFloat(cartonLineTotals[0]?.total_received || 0);
      totalRequired = parseFloat(cartonLineTotals[0]?.total_required || 0);
    } else {
      // LEGACY MODE: Use received_qty from tabTransferInItem
      const [itemRows] = await connection.execute(`
        SELECT SUM(received_qty) as total_received, SUM(qty) as total_required
        FROM tabTransferInItem
        WHERE parent_title = ?
      `, [transferInTitle]);
      
      totalReceived = parseFloat(itemRows[0]?.total_received || 0);
      totalRequired = parseFloat(itemRows[0]?.total_required || 0);
    }
    
    // Determine new status
    let newStatus;
    if (isCompleted) {
      newStatus = 'Received';
    } else if (totalReceived > 0) {
      newStatus = 'Receiving'; // ✅ Any partial receive = Receiving
    } else {
      newStatus = 'Submitted'; // No items received yet
    }
    
    // Update status if changed
    if (currentStatus !== newStatus) {
      await connection.execute(`
        UPDATE tabTransferIn
        SET status = ?,
            updated_at = NOW()
        WHERE title = ?
      `, [newStatus, transferInTitle]);
      
      console.log(`✅ Updated Transfer In ${transferInTitle} status: ${currentStatus} → ${newStatus} (total_received: ${totalReceived}, is_completed: ${isCompleted})`);
    }
    
    return newStatus;
  } catch (error) {
    console.error(`❌ Error recalculating Transfer In status for ${transferInTitle}:`, error);
    // Don't throw - allow operation to continue
    return null;
  }
}

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
        SELECT item_code, qty, carton_id, received_qty, status
        FROM tabTransferInItem
        WHERE parent_title = ?
        ORDER BY item_code
      `,
          [row.title]
        );

        const items = itemRows.map((item) => {
          const qty = parseFloat(item.qty) || 0;
          const receivedQty = parseFloat(item.received_qty) || 0;
          // Compute status if not present in database (backward compatibility)
          let status = item.status;
          if (!status) {
            if (receivedQty >= qty && qty > 0) {
              status = 'Received';
            } else if (receivedQty > 0) {
              status = 'Picking';
            } else {
              status = 'Pending';
            }
          }
          return {
            item_code: item.item_code,
            qty: qty,
            carton_id: item.carton_id || null,
            received_qty: receivedQty,
            status: status,
          };
        });

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
      SELECT item_code, qty, carton_id, received_qty, status
      FROM tabTransferInItem
      WHERE parent_title = ?
      ORDER BY item_code
    `,
      [title]
    );

    const items = itemRows.map((item) => {
      const qty = parseFloat(item.qty) || 0;
      const receivedQty = parseFloat(item.received_qty) || 0;
      // Compute status if not present in database (backward compatibility)
      let status = item.status;
      if (!status) {
        if (receivedQty >= qty && qty > 0) {
          status = 'Received';
        } else if (receivedQty > 0) {
          status = 'Picking';
        } else {
          status = 'Pending';
        }
      }
      return {
        item_code: item.item_code,
        qty: qty,
        carton_id: item.carton_id || null,
        received_qty: receivedQty,
        status: status,
      };
    });

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

    // Check if status column exists
    const [statusColCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInItem'
        AND COLUMN_NAME = 'status'
    `);
    const hasStatusColumn = statusColCheck.length > 0;
    
    // Insert items
    for (const item of items) {
      if (hasStatusColumn) {
        await connection.execute(
          `
          INSERT INTO tabTransferInItem 
            (parent_title, item_code, qty, carton_id, received_qty, status)
          VALUES (?, ?, ?, ?, 0, 'Pending')
        `,
          [title, item.item_code, item.qty, item.carton_id || null]
        );
      } else {
        await connection.execute(
          `
          INSERT INTO tabTransferInItem 
            (parent_title, item_code, qty, carton_id, received_qty)
          VALUES (?, ?, ?, ?, 0)
        `,
          [title, item.item_code, item.qty, item.carton_id || null]
        );
      }
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
        // Get all items with this carton_id OR items without carton_id (NULL)
        // This allows assigning carton_id to items that don't have it yet
        const [items] = await connection.execute(
          `
          SELECT item_code, qty, received_qty, carton_id
          FROM tabTransferInItem
          WHERE parent_title = ?
            AND (carton_id = ? OR carton_id IS NULL)
        `,
          [title, carton_id]
        );

        if (items.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: `No items found for carton_id ${carton_id} in Transfer In ${title}. Items may already have a different carton_id assigned.`,
            },
          });
        }

        // Update all items in carton to received
        // CRITICAL: Also ensure carton_id is set in tabTransferInItem if it was missing
        let updatedCount = 0;
        
        // Check if carton_id and status columns exist (once, outside the loop)
        const [cartonIdColCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInItem'
            AND COLUMN_NAME = 'carton_id'
        `);
        const hasCartonIdColumn = cartonIdColCheck.length > 0;
        
        const [statusColCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInItem'
            AND COLUMN_NAME = 'status'
        `);
        const hasStatusColumn = statusColCheck.length > 0;
        
        for (const item of items) {
          const newReceivedQty = parseFloat(item.qty);
          const expectedQty = parseFloat(item.qty);
          const itemStatus = computeTransferInItemStatus(newReceivedQty, expectedQty);
          
          if (newReceivedQty > parseFloat(item.received_qty)) {
            // Build UPDATE fields dynamically
            const updateFields = ['received_qty = ?'];
            const updateValues = [newReceivedQty];
            
            if (hasCartonIdColumn) {
              updateFields.push('carton_id = ?');
              updateValues.push(carton_id);
            }
            
            if (hasStatusColumn) {
              updateFields.push('status = ?');
              updateValues.push(itemStatus);
            }
            
            updateFields.push('updated_at = NOW()');
            updateValues.push(title, item.item_code, carton_id);
            
            await connection.execute(
              `
              UPDATE tabTransferInItem
              SET ${updateFields.join(', ')}
              WHERE parent_title = ?
                AND item_code = ?
                AND (carton_id = ? OR carton_id IS NULL)
              `,
              updateValues
            );
            
            const wasNull = item.carton_id === null;
            console.log(`[Transfer In] ✅ ${wasNull ? 'Assigned' : 'Updated'} carton_id=${carton_id} for item ${item.item_code} in Transfer In ${title}, status=${itemStatus}`);
            updatedCount++;
          } else {
            // Item already fully received, but still update carton_id and status if needed
            const updateFields = [];
            const updateValues = [];
            
            if (hasCartonIdColumn && item.carton_id === null) {
              updateFields.push('carton_id = ?');
              updateValues.push(carton_id);
            }
            
            if (hasStatusColumn) {
              const currentStatus = item.status || computeTransferInItemStatus(parseFloat(item.received_qty), expectedQty);
              if (currentStatus !== itemStatus) {
                updateFields.push('status = ?');
                updateValues.push(itemStatus);
              }
            }
            
            if (updateFields.length > 0) {
              updateFields.push('updated_at = NOW()');
              updateValues.push(title, item.item_code);
              
              await connection.execute(
                `
                UPDATE tabTransferInItem
                SET ${updateFields.join(', ')}
                WHERE parent_title = ?
                  AND item_code = ?
                `,
                updateValues
              );
              console.log(`[Transfer In] ✅ Updated carton_id/status for already-received item ${item.item_code} in Transfer In ${title}`);
            }
          }
        }

        // Recalculate Transfer In status based on received_qty and completion status
        await recalculateTransferInStatus(connection, title);
        
        // Check if all items are received (for putaway task creation only)
        // Note: Status is now managed by recalculation function, not here
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
          // All items received - check if completed before creating putaway task
          const [completionCheck] = await connection.execute(`
            SELECT completed_at, is_completed
            FROM tabTransferIn
            WHERE title = ?
          `, [title]);
          
          const isCompleted = completionCheck.length > 0 && (
            completionCheck[0].completed_at || 
            (completionCheck[0].is_completed !== null && completionCheck[0].is_completed === 1)
          );
          
          // Only create putaway task if completed
          // If not completed yet, putaway task will be created when Complete endpoint is called
          if (isCompleted) {
            // Auto-create Putaway Task (within transaction)
            await createPutawayTaskFromTransferIn(
              connection,
              title,
              transferIn.to_warehouse
            );
          }
        }

        await connection.commit();

        res.json({
          ok: true,
          message: `Received ${updatedCount} item(s) from carton ${carton_id}`,
          data: {
            transfer_in: title,
            carton_id: carton_id,
            items_received: updatedCount,
          },
        });
      }
      // Scenario B: Receive Loose Item (or update quantity for items with carton_id)
      else if (item_code && received_qty !== undefined) {
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

        // Get item (allow items with or without carton_id for quantity updates)
        const [items] = await connection.execute(
          `
          SELECT qty, received_qty, carton_id
          FROM tabTransferInItem
          WHERE parent_title = ?
            AND item_code = ?
        `,
          [title, item_code]
        );

        if (items.length === 0) {
          await connection.rollback();
          return res.status(404).json({
            ok: false,
            error: {
              code: "NOT_FOUND",
              message: `Item ${item_code} not found in Transfer In ${title}`,
            },
          });
        }

        const item = items[0];
        const expectedQty = parseFloat(item.qty);
        const currentReceivedQty = parseFloat(item.received_qty) || 0;
        const qtyDifference = parseFloat(received_qty); // This is the difference, not the total
        const finalReceivedQty = currentReceivedQty + qtyDifference;

        // Validate: received_qty should not be negative
        if (finalReceivedQty < 0) {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `Cannot decrease received_qty below 0. Current: ${currentReceivedQty}, Change: ${qtyDifference}`,
            },
          });
        }

        // Validate: new received_qty should not exceed expected qty (optional - you may want to allow over-receiving)
        if (finalReceivedQty > expectedQty) {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `Cannot receive ${qtyDifference}. Already received: ${currentReceivedQty}, Expected: ${expectedQty}. Maximum additional: ${
                expectedQty - currentReceivedQty
              }`,
            },
          });
        }

        // Compute status based on received_qty
        const itemStatus = computeTransferInItemStatus(finalReceivedQty, expectedQty);
        
        // Check if status column exists
        const [statusColCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInItem'
            AND COLUMN_NAME = 'status'
        `);
        const hasStatusColumn = statusColCheck.length > 0;
        
        // Build UPDATE statement
        const updateFields = ['received_qty = ?'];
        const updateValues = [finalReceivedQty];
        
        if (hasStatusColumn) {
          updateFields.push('status = ?');
          updateValues.push(itemStatus);
        }
        
        updateFields.push('updated_at = NOW()');
        updateValues.push(title, item_code);
        
        // Update received_qty (incremental - add qtyDifference to existing)
        // Allow updating items with or without carton_id
        await connection.execute(
          `
          UPDATE tabTransferInItem
          SET ${updateFields.join(', ')}
          WHERE parent_title = ?
            AND item_code = ?
        `,
          updateValues
        );
        
        console.log(`[Transfer In] ✅ Updated received_qty for item ${item_code} in Transfer In ${title}: ${currentReceivedQty} → ${finalReceivedQty} (${qtyDifference >= 0 ? '+' : ''}${qtyDifference}), status=${itemStatus}`);

        // Recalculate Transfer In status based on received_qty and completion status
        await recalculateTransferInStatus(connection, title);
        
        // Check if all items are received (for putaway task creation only)
        // Note: Status is now managed by recalculation function, not here
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
          // All items received - check if completed before creating putaway task
          const [completionCheck] = await connection.execute(`
            SELECT completed_at, is_completed
            FROM tabTransferIn
            WHERE title = ?
          `, [title]);
          
          const isCompleted = completionCheck.length > 0 && (
            completionCheck[0].completed_at || 
            (completionCheck[0].is_completed !== null && completionCheck[0].is_completed === 1)
          );
          
          // Only create putaway task if completed
          // If not completed yet, putaway task will be created when Complete endpoint is called
          if (isCompleted) {
            // Auto-create Putaway Task (within transaction)
            await createPutawayTaskFromTransferIn(
              connection,
              title,
              transferIn.to_warehouse
            );
          }
        }

        await connection.commit();

        res.json({
          ok: true,
          message: `Received ${qtyDifference >= 0 ? '+' : ''}${qtyDifference} units of ${item_code} (total: ${finalReceivedQty})`,
          data: {
            transfer_in: title,
            item_code: item_code,
            received_qty: finalReceivedQty,
            expected_qty: expectedQty,
            status: itemStatus,
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
 * POST /api/transfer-in/:title/update-line-carton
 * Update carton_id for a specific Transfer In line
 *
 * Request Body:
 * {
 *   "item_code": "ITEM-001",
 *   "carton_id": "CTN-TI-001"
 * }
 */
/**
 * POST /api/transfer-in/:title/mark-received
 * Explicitly mark Transfer In item(s) as "Received"
 * 
 * Request Body:
 * {
 *   "item_code": "SKU-001" (optional - if not provided, marks all items as Received)
 * }
 */
export const markTransferInItemReceived = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;
    const { item_code } = req.body;

    await connection.beginTransaction();

    // Check if Transfer In exists
    const [tiRows] = await connection.execute(
      `SELECT status FROM tabTransferIn WHERE title = ?`,
      [title]
    );

    if (tiRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${title} not found`,
        },
      });
    }

    // Check if status column exists
    const [statusColCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInItem'
        AND COLUMN_NAME = 'status'
    `);
    const hasStatusColumn = statusColCheck.length > 0;

    if (!hasStatusColumn) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "SCHEMA_ERROR",
          message: "status column does not exist in tabTransferInItem. Please run migration first.",
        },
      });
    }

    // Update status to "Received"
    if (item_code) {
      // Update specific item
      const [updateResult] = await connection.execute(
        `UPDATE tabTransferInItem
         SET status = 'Received', updated_at = NOW()
         WHERE parent_title = ? AND item_code = ?`,
        [title, item_code]
      );

      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: `Item ${item_code} not found in Transfer In ${title}`,
          },
        });
      }

      await connection.commit();

      res.json({
        ok: true,
        message: `Marked item ${item_code} as Received in Transfer In ${title}`,
        data: {
          transfer_in: title,
          item_code: item_code,
          status: 'Received',
        },
      });
    } else {
      // Update all items in Transfer In
      const [updateResult] = await connection.execute(
        `UPDATE tabTransferInItem
         SET status = 'Received', updated_at = NOW()
         WHERE parent_title = ?`,
        [title]
      );

      await connection.commit();

      res.json({
        ok: true,
        message: `Marked all items as Received in Transfer In ${title}`,
        data: {
          transfer_in: title,
          items_updated: updateResult.affectedRows,
          status: 'Received',
        },
      });
    }
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Error marking Transfer In item as Received:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to mark item as Received",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-in/:title/complete-receiving
 * Explicitly mark Transfer In as completed (sets completion markers and status to "Received")
 * 
 * Request Body:
 * {
 *   "completed_by": "USER-001"  // Optional - defaults to user from auth token
 * }
 */
export const completeTransferInReceiving = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;
    const { completed_by } = req.body;
    const userId = completed_by || req.user?.user_id || 'SYSTEM';

    await connection.beginTransaction();

    // Check if Transfer In exists
    const [tiRows] = await connection.execute(
      `SELECT status FROM tabTransferIn WHERE title = ?`,
      [title]
    );

    if (tiRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${title} not found`,
        },
      });
    }

    // Check if completion fields exist
    const [completionCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferIn'
        AND COLUMN_NAME IN ('completed_at', 'completed_by', 'is_completed')
    `);
    
    const hasCompletedAt = completionCols.some(col => col.COLUMN_NAME === 'completed_at');
    const hasCompletedBy = completionCols.some(col => col.COLUMN_NAME === 'completed_by');
    const hasIsCompleted = completionCols.some(col => col.COLUMN_NAME === 'is_completed');
    const hasCompletionFields = hasCompletedAt || hasCompletedBy || hasIsCompleted;

    if (!hasCompletionFields) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "SCHEMA_ERROR",
          message: "Completion fields (completed_at, completed_by, is_completed) do not exist in tabTransferIn. Please run migration first.",
        },
      });
    }

    // Build UPDATE statement dynamically
    const updateFields = [];
    const updateValues = [];
    
    if (hasCompletedAt) {
      updateFields.push('completed_at = NOW()');
    }
    
    if (hasCompletedBy) {
      updateFields.push('completed_by = ?');
      updateValues.push(userId);
    }
    
    if (hasIsCompleted) {
      updateFields.push('is_completed = 1');
    }
    
    updateFields.push('updated_at = NOW()');
    updateValues.push(title);
    
    // Set completion markers
    await connection.execute(
      `UPDATE tabTransferIn
       SET ${updateFields.join(', ')}
       WHERE title = ?`,
      updateValues
    );

    // Recalculate status (will set to "Received" since completed)
    const newStatus = await recalculateTransferInStatus(connection, title);

    // Update all item statuses to "Received" when Transfer In is completed
    // Check if status column exists in tabTransferInItem
    const [statusColCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInItem'
        AND COLUMN_NAME = 'status'
    `);
    const hasStatusColumn = statusColCheck.length > 0;
    
    if (hasStatusColumn) {
      await connection.execute(`
        UPDATE tabTransferInItem
        SET status = 'Received',
            updated_at = NOW()
        WHERE parent_title = ?
      `, [title]);
      console.log(`✅ Updated all item statuses to 'Received' for Transfer In ${title}`);
    }

    // Check if all items are received - create putaway task if ready
    const [remainingItems] = await connection.execute(
      `
      SELECT COUNT(*) as count
      FROM tabTransferInItem
      WHERE parent_title = ?
        AND received_qty < qty
    `,
      [title]
    );

    if (remainingItems[0].count === 0) {
      // All items received - create Putaway Task
      const [transferInInfo] = await connection.execute(
        `SELECT to_warehouse FROM tabTransferIn WHERE title = ?`,
        [title]
      );
      
      if (transferInInfo.length > 0) {
        await createPutawayTaskFromTransferIn(
          connection,
          title,
          transferInInfo[0].to_warehouse
        );
      }
    }

    await connection.commit();

    // Get updated Transfer In for response
    const [updatedRows] = await connection.execute(
      `SELECT status, completed_at, completed_by${hasIsCompleted ? ', is_completed' : ''} 
       FROM tabTransferIn WHERE title = ?`,
      [title]
    );

    const updated = updatedRows[0];

    res.json({
      ok: true,
      message: `Transfer In ${title} marked as completed`,
      data: {
        transfer_in: title,
        status: updated.status || newStatus || 'Received',
        completed_at: updated.completed_at ? updated.completed_at.toISOString() : null,
        completed_by: updated.completed_by || null,
        ...(hasIsCompleted && { is_completed: updated.is_completed || 1 }),
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Error completing Transfer In receiving:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to complete Transfer In receiving",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/transfer-in/:title/cartons
 * Get all cartons for a Transfer In
 */
export const getTransferInCartons = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;

    // Check if Transfer In exists
    const [tiRows] = await connection.execute(
      `SELECT title FROM tabTransferIn WHERE title = ?`,
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

    // Check if carton table exists
    const [cartonTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCarton'
    `);

    const hasCartonTable = cartonTableCheck.length > 0;

    if (!hasCartonTable) {
      return res.json({
        ok: true,
        data: {
          transfer_in: title,
          cartons: [],
          message: "Multi-carton tables not available. Using legacy mode."
        },
      });
    }

    // Get all cartons for this Transfer In
    const [cartonRows] = await connection.execute(`
      SELECT 
        name,
        carton_id,
        transfer_in,
        status,
        created_by,
        created_at,
        closed_by,
        closed_at
      FROM tabTransferInCarton
      WHERE transfer_in = ?
      ORDER BY created_at DESC
    `, [title]);

    // Get carton totals (qty per carton)
    const cartons = await Promise.all(
      cartonRows.map(async (carton) => {
        const [totalRows] = await connection.execute(`
          SELECT COALESCE(SUM(received_qty), 0) as total_qty
          FROM tabTransferInCartonLine
          WHERE transfer_in = ? AND carton_id = ?
        `, [title, carton.carton_id]);

        return {
          name: carton.name,
          carton_id: carton.carton_id,
          transfer_in: carton.transfer_in,
          status: carton.status,
          total_qty: parseFloat(totalRows[0]?.total_qty || 0),
          created_by: carton.created_by,
          created_at: carton.created_at ? carton.created_at.toISOString() : null,
          closed_by: carton.closed_by || null,
          closed_at: carton.closed_at ? carton.closed_at.toISOString() : null,
        };
      })
    );

    res.json({
      ok: true,
      data: {
        transfer_in: title,
        cartons: cartons,
      },
    });
  } catch (error) {
    console.error(`❌ Error getting Transfer In cartons:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get cartons",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-in/:title/cartons
 * Create or select a carton for Transfer In receiving
 * 
 * Request Body:
 * {
 *   "carton_id": "CTN-123"  // Required - carton ID to create or select
 * }
 */
export const createOrSelectTransferInCarton = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;
    const { carton_id } = req.body;
    const userId = req.user?.user_id || 'SYSTEM';

    if (!carton_id) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "carton_id is required",
        },
      });
    }

    await connection.beginTransaction();

    // Check if Transfer In exists
    const [tiRows] = await connection.execute(
      `SELECT title FROM tabTransferIn WHERE title = ?`,
      [title]
    );

    if (tiRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${title} not found`,
        },
      });
    }

    // Check if carton table exists
    const [cartonTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCarton'
    `);

    const hasCartonTable = cartonTableCheck.length > 0;

    if (!hasCartonTable) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "SCHEMA_ERROR",
          message: "tabTransferInCarton table does not exist. Please run migration first.",
        },
      });
    }

    // Check if carton already exists
    const [existingCarton] = await connection.execute(`
      SELECT name, carton_id, status, created_at
      FROM tabTransferInCarton
      WHERE carton_id = ? AND transfer_in = ?
    `, [carton_id, title]);

    if (existingCarton.length > 0) {
      // Carton exists - return existing
      await connection.commit();

      const carton = existingCarton[0];
      const [totalRows] = await connection.execute(`
        SELECT COALESCE(SUM(received_qty), 0) as total_qty
        FROM tabTransferInCartonLine
        WHERE transfer_in = ? AND carton_id = ?
      `, [title, carton_id]);

      res.json({
        ok: true,
        message: `Using existing carton ${carton_id}`,
        data: {
          name: carton.name,
          carton_id: carton.carton_id,
          transfer_in: title,
          status: carton.status,
          total_qty: parseFloat(totalRows[0]?.total_qty || 0),
          created_by: carton.created_by,
          created_at: carton.created_at ? carton.created_at.toISOString() : null,
        },
      });
    } else {
      // Create new carton
      const cartonName = `TIC-${title}-${carton_id}-${Date.now()}`;
      await connection.execute(`
        INSERT INTO tabTransferInCarton (name, carton_id, transfer_in, status, created_by, created_at)
        VALUES (?, ?, ?, 'Draft', ?, NOW())
      `, [cartonName, carton_id, title, userId]);

      await connection.commit();

      res.json({
        ok: true,
        message: `Created carton ${carton_id} for Transfer In ${title}`,
        data: {
          name: cartonName,
          carton_id: carton_id,
          transfer_in: title,
          status: 'Draft',
          total_qty: 0,
          created_by: userId,
          created_at: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Error creating/selecting Transfer In carton:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to create/select carton",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-in/:title/cartons/:carton_id/close
 * Close a carton (sets status to Closed)
 */
export const closeTransferInCarton = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title, carton_id } = req.params;
    const userId = req.user?.user_id || 'SYSTEM';

    await connection.beginTransaction();

    // Check if carton exists
    const [cartonRows] = await connection.execute(`
      SELECT name, status, closed_at
      FROM tabTransferInCarton
      WHERE carton_id = ? AND transfer_in = ?
    `, [carton_id, title]);

    if (cartonRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Carton ${carton_id} not found for Transfer In ${title}`,
        },
      });
    }

    const carton = cartonRows[0];

    // Check if already closed
    if (carton.status === 'Closed' && carton.closed_at) {
      await connection.rollback();
      return res.json({
        ok: true,
        message: `Carton ${carton_id} is already closed`,
        data: {
          carton_id: carton_id,
          status: 'Closed',
        },
      });
    }

    // Close carton
    await connection.execute(`
      UPDATE tabTransferInCarton
      SET status = 'Closed',
          closed_by = ?,
          closed_at = NOW(),
          updated_at = NOW()
      WHERE carton_id = ? AND transfer_in = ?
    `, [userId, carton_id, title]);

    await connection.commit();

    res.json({
      ok: true,
      message: `Closed carton ${carton_id} for Transfer In ${title}`,
      data: {
        carton_id: carton_id,
        transfer_in: title,
        status: 'Closed',
        closed_by: userId,
        closed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Error closing Transfer In carton:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to close carton",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/transfer-in/:title/cartons/:carton_id/reopen
 * Reopen a closed carton (sets status back to Draft)
 */
export const reopenTransferInCarton = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title, carton_id } = req.params;

    await connection.beginTransaction();

    // Check if carton exists
    const [cartonRows] = await connection.execute(`
      SELECT name, status
      FROM tabTransferInCarton
      WHERE carton_id = ? AND transfer_in = ?
    `, [carton_id, title]);

    if (cartonRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Carton ${carton_id} not found for Transfer In ${title}`,
        },
      });
    }

    const carton = cartonRows[0];

    // Check if already open
    if (carton.status !== 'Closed') {
      await connection.rollback();
      return res.json({
        ok: true,
        message: `Carton ${carton_id} is already open`,
        data: {
          carton_id: carton_id,
          status: carton.status,
        },
      });
    }

    // Reopen carton
    await connection.execute(`
      UPDATE tabTransferInCarton
      SET status = 'Draft',
          closed_by = NULL,
          closed_at = NULL,
          updated_at = NOW()
      WHERE carton_id = ? AND transfer_in = ?
    `, [carton_id, title]);

    await connection.commit();

    res.json({
      ok: true,
      message: `Reopened carton ${carton_id} for Transfer In ${title}`,
      data: {
        carton_id: carton_id,
        transfer_in: title,
        status: 'Draft',
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error(`❌ Error reopening Transfer In carton:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to reopen carton",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/transfer-in/:title/cartons/:carton_id/lines
 * Get all lines (items) in a carton
 */
export const getTransferInCartonLines = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title, carton_id } = req.params;

    // Check if carton line table exists
    const [cartonLineTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCartonLine'
    `);

    const hasCartonLineTable = cartonLineTableCheck.length > 0;

    if (!hasCartonLineTable) {
      return res.json({
        ok: true,
        data: {
          transfer_in: title,
          carton_id: carton_id,
          lines: [],
          message: "Multi-carton tables not available."
        },
      });
    }

    // Get carton lines
    const [lineRows] = await connection.execute(`
      SELECT 
        name,
        transfer_in,
        carton_id,
        item_code,
        received_qty,
        created_at,
        updated_at
      FROM tabTransferInCartonLine
      WHERE transfer_in = ? AND carton_id = ?
      ORDER BY item_code
    `, [title, carton_id]);

    const lines = lineRows.map(line => ({
      name: line.name,
      transfer_in: line.transfer_in,
      carton_id: line.carton_id,
      item_code: line.item_code,
      received_qty: parseFloat(line.received_qty || 0),
      created_at: line.created_at ? line.created_at.toISOString() : null,
      updated_at: line.updated_at ? line.updated_at.toISOString() : null,
    }));

    res.json({
      ok: true,
      data: {
        transfer_in: title,
        carton_id: carton_id,
        lines: lines,
      },
    });
  } catch (error) {
    console.error(`❌ Error getting Transfer In carton lines:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get carton lines",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

export const updateTransferInLineCarton = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;
    const { item_code, carton_id } = req.body;

    // Validation
    if (!item_code) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "item_code is required",
        },
      });
    }

    // Check if Transfer In exists
    const [tiRows] = await connection.execute(
      `
      SELECT status FROM tabTransferIn WHERE title = ?
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

    // Check if Transfer In item exists
    const [itemRows] = await connection.execute(
      `
      SELECT id, item_code, carton_id
      FROM tabTransferInItem
      WHERE parent_title = ? AND item_code = ?
    `,
      [title, item_code]
    );

    if (itemRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Item ${item_code} not found in Transfer In ${title}`,
        },
      });
    }

    // Check if carton_id column exists
    const [cartonIdColCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInItem'
        AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonIdColumn = cartonIdColCheck.length > 0;

    if (!hasCartonIdColumn) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "carton_id column does not exist in tabTransferInItem",
        },
      });
    }

    // Update carton_id
    await connection.execute(
      `
      UPDATE tabTransferInItem
      SET carton_id = ?,
          updated_at = NOW()
      WHERE parent_title = ?
        AND item_code = ?
    `,
      [carton_id || null, title, item_code]
    );

    res.json({
      ok: true,
      message: `Updated carton_id for item ${item_code} in Transfer In ${title}`,
      data: {
        transfer_in: title,
        item_code: item_code,
        carton_id: carton_id || null,
      },
    });
  } catch (error) {
    console.error("Failed to update Transfer In line carton:", error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to update Transfer In line carton",
        details: process.env.NODE_ENV === "development" ? error.message : null,
      },
    });
  } finally {
    connection.release();
  }
};

/**
 * Helper function to create Putaway Task from Transfer In
 * Exported for use in putaway scan endpoint
 */
export async function createPutawayTaskFromTransferIn(
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

    // Check if multi-carton tables exist
    const [cartonTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransferInCarton'
    `);
    const hasMultiCartonTables = cartonTableCheck.length > 0;
    
    let items = [];
    
    if (hasMultiCartonTables) {
      // MULTI-CARTON MODE: Get items from carton lines (one line per item per carton)
      // This ensures each carton gets its own putaway line
      // Note: Include items from all cartons (Draft or Closed) since they all need to be put away
      const [cartonItems] = await connection.execute(
        `
        SELECT 
          ticl.item_code,
          ticl.carton_id,
          ticl.received_qty
        FROM tabTransferInCartonLine ticl
        INNER JOIN tabTransferInCarton tic ON tic.carton_id = ticl.carton_id AND tic.transfer_in = ticl.transfer_in
        WHERE ticl.transfer_in = ?
          AND ticl.received_qty > 0
        ORDER BY ticl.carton_id, ticl.item_code
      `,
        [transferInTitle]
      );
      
      items = cartonItems.map(item => ({
        item_code: item.item_code,
        carton_id: item.carton_id,
        received_qty: parseFloat(item.received_qty) || 0
      }));
      
      console.log(`📦 Multi-carton mode: Found ${items.length} item-carton combination(s) for putaway`);
    } else {
      // LEGACY MODE: Get items from tabTransferInItem (single carton per item)
      const [legacyItems] = await connection.execute(
        `
        SELECT item_code, carton_id, received_qty
        FROM tabTransferInItem
        WHERE parent_title = ?
          AND received_qty > 0
        ORDER BY item_code
      `,
        [transferInTitle]
      );
      
      items = legacyItems.map(item => ({
        item_code: item.item_code,
        carton_id: item.carton_id || null,
        received_qty: parseFloat(item.received_qty) || 0
      }));
      
      console.log(`📦 Legacy mode: Found ${items.length} item(s) for putaway`);
    }

    if (items.length === 0) {
      console.log(
        `⚠️ No items to put away for Transfer In ${transferInTitle} (all items have received_qty = 0)`
      );
      return;
    }

    console.log(
      `📦 Found ${items.length} item(s) to put away for Transfer In ${transferInTitle}`
    );
    
    // Log carton_id status for debugging
    const itemsWithCarton = items.filter(item => item.carton_id).length;
    const itemsWithoutCarton = items.length - itemsWithCarton;
    console.log(
      `   - Items with carton_id: ${itemsWithCarton}`
    );
    console.log(
      `   - Items without carton_id: ${itemsWithoutCarton}`
    );
    if (itemsWithCarton > 0) {
      const cartonIds = [...new Set(items.map(item => item.carton_id).filter(Boolean))];
      console.log(
        `   - Carton IDs: ${cartonIds.join(', ')}`
      );
    }

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
    // CRITICAL: Set status to 'Open' (not 'Draft' or rely on DB default)
    // This ensures processPutawayCompletionEvent doesn't skip due to idempotency check
    const insertFields = ['title', 'status', 'created_by', 'created_at', 'updated_at'];
    const insertValues = [putawayTaskTitle, 'Open', 'SYSTEM'];
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

    // For Transfer In tasks, if all items have the same carton_id, set it as box_id
    // Check if box_id column exists
    const [boxIdColCheck] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabPutawayTask'
        AND COLUMN_NAME = 'box_id'
    `);
    const hasBoxId = boxIdColCheck.length > 0;
    
    let commonCartonId = null;
    if (hasBoxId && items.length > 0) {
      // Check if all items have the same carton_id
      const cartonIds = items.map(item => item.carton_id).filter(Boolean);
      if (cartonIds.length > 0) {
        const uniqueCartonIds = [...new Set(cartonIds)];
        if (uniqueCartonIds.length === 1) {
          // All items share the same carton_id - use it as box_id
          commonCartonId = uniqueCartonIds[0];
          insertFields.push('box_id');
          insertValues.push(commonCartonId);
          insertPlaceholders.push('?');
          console.log(`📦 Setting box_id=${commonCartonId} for Transfer In putaway task (all items share same carton)`);
        }
      }
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
      const cartonIdToUse = item.carton_id || null;
      
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
            cartonIdToUse,
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
            cartonIdToUse,
            item.received_qty,
          ]
        );
      }
      
      // Log each line creation for debugging
      if (cartonIdToUse) {
        console.log(`   - Created putaway line: ${item.item_code} with carton_id=${cartonIdToUse}, qty=${item.received_qty}`);
      } else {
        console.log(`   - ⚠️ Created putaway line: ${item.item_code} WITHOUT carton_id, qty=${item.received_qty}`);
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
    
    // CRITICAL: Create Putaway Boxes for Transfer In (similar to ASN)
    // This enables box-based putaway validation on mobile app
    await ensurePutawayBoxesForTransferIn(
      connection,
      {
        transferInNo: transferInTitle,
        putawayTaskTitle: putawayTaskTitle,
        warehouse: warehouse,
        createdBy: 'SYSTEM'
      }
    );
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

/**
 * Ensure Putaway Boxes exist for Transfer In Putaway
 * Creates boxes in tabSortBox for each carton, similar to ASN putaway flow
 * 
 * @param {Connection} connection - Database connection
 * @param {Object} params - Parameters
 * @param {string} params.transferInNo - Transfer In title
 * @param {string} params.putawayTaskTitle - Putaway task title
 * @param {string} params.warehouse - Warehouse code
 * @param {string} params.createdBy - User who created (default: 'SYSTEM')
 * @returns {Promise<{created: number, reused: number}>} - Count of boxes created/reused
 */
async function ensurePutawayBoxesForTransferIn(connection, {
  transferInNo,
  putawayTaskTitle,
  warehouse,
  createdBy = "SYSTEM",
}) {
  try {
    // 1) Check if tabSortBox table exists
    const [[sortBoxOk]] = await connection.execute(`
      SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabSortBox'
    `);
    if (!sortBoxOk || sortBoxOk.c === 0) {
      console.warn("⚠️ tabSortBox not found. Skipping putaway box creation.");
      return { created: 0, reused: 0 };
    }

    // 2) Check for optional columns in tabSortBox
    // Note: Use purpose field instead of source_type (purpose = 'PUTAWAY' for Transfer In)
    const [sortBoxColumns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabSortBox'
        AND COLUMN_NAME IN ('source_ref', 'carton_id', 'putaway_task_title', 'purpose')
    `);
    const columnNames = sortBoxColumns.map(col => col.COLUMN_NAME);
    const hasPurpose = columnNames.includes('purpose');
    const hasSourceRef = columnNames.includes('source_ref');
    const hasCartonId = columnNames.includes('carton_id');
    const hasPutawayTaskTitle = columnNames.includes('putaway_task_title');

    // 3) Read distinct cartons for this Transfer In that have items in putaway lines
    const [cartons] = await connection.execute(`
      SELECT DISTINCT pl.carton_id
      FROM tabPutawayLine pl
      WHERE pl.parent_title = ?
        AND pl.carton_id IS NOT NULL
        AND pl.carton_id != ''
    `, [putawayTaskTitle]);

    if (!cartons.length) {
      console.log(`📦 No cartons found for putaway task ${putawayTaskTitle} - skipping box creation`);
      return { created: 0, reused: 0 };
    }

    console.log(`📦 Found ${cartons.length} distinct carton(s) for putaway task ${putawayTaskTitle}`);

    let created = 0, reused = 0;

    for (const row of cartons) {
      const cartonId = row.carton_id;

      // 4) Try to reuse existing box mapped to same carton + transferin + putaway task
      // CRITICAL: Check for boxes regardless of format (BOX-WHMAIN-* or CTN-TI-*)
      // Note: For Transfer In, box_id = carton_id (e.g., CTN-TI-123457-20260120-160936-988)
      let existingBox = null;
      
      // Priority 1: Check by purpose, source_ref, carton_id, and putaway_task_title (most specific)
      // Note: Use purpose = 'PUTAWAY' instead of source_type = 'Transfer In'
      if (hasPurpose && hasSourceRef && hasPutawayTaskTitle && hasCartonId) {
        const [existing] = await connection.execute(`
          SELECT box_id FROM tabSortBox
          WHERE purpose = 'PUTAWAY'
            AND source_ref = ?
            AND carton_id = ?
            AND putaway_task_title = ?
          LIMIT 1
        `, [transferInNo, cartonId, putawayTaskTitle]);
        
        if (existing.length > 0) {
          existingBox = existing[0].box_id;
          console.log(`   🔍 Found existing box by purpose+source_ref+carton_id+putaway_task_title: ${existingBox}`);
        }
      }
      
      // Priority 2: Check by advance_shipping_notice (Transfer In title) and carton_id (works for both formats)
      if (!existingBox && hasCartonId) {
        const [existing] = await connection.execute(`
          SELECT box_id FROM tabSortBox
          WHERE advance_shipping_notice = ?
            AND carton_id = ?
          LIMIT 1
        `, [transferInNo, cartonId]);
        
        if (existing.length > 0) {
          existingBox = existing[0].box_id;
          console.log(`   🔍 Found existing box by advance_shipping_notice+carton_id: ${existingBox}`);
        }
      }
      
      // Priority 3: Check by source_ref and advance_shipping_notice (if used for Transfer In)
      if (!existingBox && hasSourceRef) {
        const [existing] = await connection.execute(`
          SELECT box_id FROM tabSortBox
          WHERE source_ref = ?
            AND advance_shipping_notice = ?
          LIMIT 1
        `, [transferInNo, transferInNo]);
        
        if (existing.length > 0) {
          existingBox = existing[0].box_id;
          console.log(`   🔍 Found existing box by source_ref+advance_shipping_notice: ${existingBox}`);
        }
      }
      
      // Priority 4: Check by putaway_task_title in putaway lines (if box_id column exists)
      if (!existingBox) {
        const [boxIdColCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabPutawayLine'
            AND COLUMN_NAME = 'box_id'
        `);
        const hasBoxIdInLine = boxIdColCheck.length > 0;
        
        if (hasBoxIdInLine) {
          // Find box_id from putaway lines that have this carton_id and task
          const [boxFromLines] = await connection.execute(`
            SELECT DISTINCT box_id FROM tabPutawayLine
            WHERE parent_title = ?
              AND carton_id = ?
              AND box_id IS NOT NULL
              AND box_id != ''
            LIMIT 1
          `, [putawayTaskTitle, cartonId]);
          
          if (boxFromLines.length > 0) {
            const boxIdFromLine = boxFromLines[0].box_id;
            // Verify this box exists in tabSortBox and matches Transfer In
            const [verifyBox] = await connection.execute(`
              SELECT box_id FROM tabSortBox
              WHERE box_id = ?
                AND advance_shipping_notice = ?
              LIMIT 1
            `, [boxIdFromLine, transferInNo]);
            
            if (verifyBox.length > 0) {
              existingBox = boxIdFromLine;
              console.log(`   🔍 Found existing box from putaway lines: ${existingBox}`);
            }
          }
        }
      }

      let boxId;
      if (existingBox) {
        boxId = existingBox;
        reused++;
        console.log(`   ♻️ Reusing existing box ${boxId} for carton ${cartonId}`);
        
        // CRITICAL: Update existing box with missing fields (if columns exist)
        // This ensures boxes created by desktop app get the Transfer In metadata
        // Note: Use purpose = 'PUTAWAY' instead of source_type = 'Transfer In'
        const updateFields = [];
        const updateValues = [];
        
        if (hasPurpose) {
          updateFields.push('purpose = ?');
          updateValues.push('PUTAWAY');
        }
        if (hasSourceRef) {
          updateFields.push('source_ref = ?');
          updateValues.push(transferInNo);
        }
        if (hasCartonId) {
          updateFields.push('carton_id = ?');
          updateValues.push(cartonId);
        }
        if (hasPutawayTaskTitle) {
          updateFields.push('putaway_task_title = ?');
          updateValues.push(putawayTaskTitle);
        }
        
        if (updateFields.length > 0) {
          updateValues.push(boxId);
          await connection.execute(
            `UPDATE tabSortBox SET ${updateFields.join(', ')} WHERE box_id = ?`,
            updateValues
          );
          console.log(`   ✅ Updated existing box ${boxId} with Transfer In metadata`);
        }
      } else {
        // CRITICAL: For Transfer In Putaway, use carton_id AS box_id (same as ASN behavior)
        // This matches the user requirement: box_id = carton_id (e.g., CTN-TI-123457-20260120-160936-988)
        // Check if box already exists with this carton_id as box_id
        const [existingBoxByCartonId] = await connection.execute(`
          SELECT box_id FROM tabSortBox
          WHERE box_id = ?
            AND advance_shipping_notice = ?
          LIMIT 1
        `, [cartonId, transferInNo]);
        
        if (existingBoxByCartonId.length > 0) {
          // Box already exists with carton_id as box_id - reuse it
          boxId = existingBoxByCartonId[0].box_id;
          reused++;
          console.log(`   ♻️ Reusing existing box ${boxId} (carton_id used as box_id) for Transfer In ${transferInNo}`);
          
          // Update existing box with missing fields
          // Note: Use purpose = 'PUTAWAY' instead of source_type = 'Transfer In'
          const updateFields = [];
          const updateValues = [];
          
          if (hasPurpose) {
            updateFields.push('purpose = ?');
            updateValues.push('PUTAWAY');
          }
          if (hasSourceRef) {
            updateFields.push('source_ref = ?');
            updateValues.push(transferInNo);
          }
          if (hasCartonId && cartonId) {
            updateFields.push('carton_id = ?');
            updateValues.push(cartonId);
          }
          if (hasPutawayTaskTitle) {
            updateFields.push('putaway_task_title = ?');
            updateValues.push(putawayTaskTitle);
          }
          
          if (updateFields.length > 0) {
            updateValues.push(boxId);
            await connection.execute(
              `UPDATE tabSortBox SET ${updateFields.join(', ')} WHERE box_id = ?`,
              updateValues
            );
            console.log(`   ✅ Updated existing box ${boxId} with Transfer In metadata`);
          }
        } else {
          // No existing box found - use carton_id AS box_id (same format as carton_id)
          // This matches ASN behavior where box_id = carton_id format
          boxId = cartonId; // Use carton_id directly as box_id
          console.log(`   📦 Using carton_id as box_id: ${boxId} (Transfer In Putaway - same as ASN)`);

          // 6) Build INSERT statement dynamically based on available columns
          // CRITICAL: box_id = carton_id for Transfer In Putaway (same as ASN)
          const insertFields = ['box_id', 'status', 'advance_shipping_notice', 'transfer_order', 'store', 'purpose', 'created_by', 'created_on'];
          const insertValues = [boxId, 'Open', transferInNo, '', warehouse || 'WH-MAIN', 'PUTAWAY', createdBy];
          const insertPlaceholders = ['?', '?', '?', '?', '?', '?', '?', 'NOW()'];
          
          console.log(`   📦 Creating box with box_id = carton_id: ${boxId}`);

          // Add optional columns if they exist
          // Note: purpose is already in the base fields above, don't add it again
          if (hasSourceRef) {
            insertFields.push('source_ref');
            insertValues.push(transferInNo);
            insertPlaceholders.push('?');
          }
          if (hasCartonId) {
            insertFields.push('carton_id');
            insertValues.push(cartonId);
            insertPlaceholders.push('?');
          }
          if (hasPutawayTaskTitle) {
            insertFields.push('putaway_task_title');
            insertValues.push(putawayTaskTitle);
            insertPlaceholders.push('?');
          }

          await connection.execute(
            `INSERT INTO tabSortBox (${insertFields.join(', ')})
             VALUES (${insertPlaceholders.join(', ')})`,
            insertValues
          );

          created++;
          console.log(`   ✅ Created box ${boxId} (box_id = carton_id) for Transfer In ${transferInNo}`);
        }
      }

      // 7) Check if tabSortBoxLine exists and create box lines
      const [[sortBoxLineOk]] = await connection.execute(`
        SELECT COUNT(*) as c FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabSortBoxLine'
      `);
      
      if (sortBoxLineOk && sortBoxLineOk.c > 0) {
        // Delete existing lines for this box (idempotent: rebuild from putaway lines)
        await connection.execute(`DELETE FROM tabSortBoxLine WHERE parent_box_id = ?`, [boxId]);

        // Get items for this carton from putaway lines
        const [lines] = await connection.execute(`
          SELECT item_code, SUM(qty) as qty
          FROM tabPutawayLine
          WHERE parent_title = ? AND carton_id = ?
          GROUP BY item_code
        `, [putawayTaskTitle, cartonId]);

        for (const l of lines) {
          // Check if carton_id column exists in tabSortBoxLine
          const [lineColumns] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabSortBoxLine'
              AND COLUMN_NAME = 'carton_id'
          `);
          const hasCartonIdInLine = lineColumns.length > 0;

          if (hasCartonIdInLine) {
            await connection.execute(`
              INSERT INTO tabSortBoxLine
                (parent_box_id, item_code, qty, carton_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, NOW(), NOW())
            `, [boxId, l.item_code, l.qty, cartonId]);
          } else {
            await connection.execute(`
              INSERT INTO tabSortBoxLine
                (parent_box_id, item_code, qty, created_at, updated_at)
              VALUES (?, ?, ?, NOW(), NOW())
            `, [boxId, l.item_code, l.qty]);
          }
        }
        console.log(`   ✅ Created ${lines.length} box line(s) for box ${boxId}`);
      }
      
      // 7b) CRITICAL: Map putaway lines to this box FIRST (update box_id in tabPutawayLine)
      // This must happen BEFORE event creation so mobile app can find the box even if events fail
      const [boxIdColCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabPutawayLine'
          AND COLUMN_NAME = 'box_id'
      `);
      const hasBoxIdInLine = boxIdColCheck.length > 0;

      if (hasBoxIdInLine) {
        const [updateResult] = await connection.execute(`
          UPDATE tabPutawayLine
          SET box_id = ?
          WHERE parent_title = ?
            AND carton_id = ?
            AND (box_id IS NULL OR box_id = '')
        `, [boxId, putawayTaskTitle, cartonId]);
        
        if (updateResult.affectedRows > 0) {
          console.log(`   ✅ Updated ${updateResult.affectedRows} putaway line(s) with box_id=${boxId}`);
        }
      }
      
      // 7c) CRITICAL: Also create SORT_TO_BOX events for desktop app compatibility
      // Desktop app reads box contents from SORT_TO_BOX events, not tabSortBoxLine
      // Wrap in try-catch so event creation failure doesn't break box creation
      try {
        // Get items for this carton from putaway lines
        const [eventLines] = await connection.execute(`
          SELECT item_code, SUM(qty) as qty
          FROM tabPutawayLine
          WHERE parent_title = ? AND carton_id = ?
          GROUP BY item_code
        `, [putawayTaskTitle, cartonId]);
        
        let eventsCreated = 0;
        for (const eventLine of eventLines) {
          // Check if SORT_TO_BOX event already exists (idempotent)
          const [existingEvent] = await connection.execute(`
            SELECT COUNT(*) as count FROM tabWmsScanEvent
            WHERE event_type = 'SORT_TO_BOX'
              AND box_id = ?
              AND item_code = ?
              AND carton_id = ?
          `, [boxId, eventLine.item_code, cartonId]);
          
          if (existingEvent[0].count === 0) {
            // Create SORT_TO_BOX event for desktop app compatibility
            // Generate shorter offline_uuid: SORT-{timestamp}-{random}
            const timestamp = Date.now();
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const offlineUuid = `SORT-${timestamp}-${random}`;
            
            await connection.execute(`
              INSERT INTO tabWmsScanEvent
                (offline_uuid, event_type, event_time, device_id, user_id,
                 advance_shipping_notice, transfer_order, inbound_session,
                 carton_id, item_code, qty, store, box_id, tc_id, rack, bin, notes)
              VALUES
                (?, 'SORT_TO_BOX', NOW(), 'SYSTEM', ?,
                 ?, '', '',
                 ?, ?, ?, ?, ?, NULL, NULL, NULL, 'Auto-created for Transfer In Putaway')
            `, [
              offlineUuid,
              createdBy,
              transferInNo, // advance_shipping_notice
              cartonId, // carton_id
              eventLine.item_code,
              eventLine.qty,
              warehouse || 'WH-MAIN', // store
              boxId // box_id
            ]);
            eventsCreated++;
          }
        }
        console.log(`   ✅ Created ${eventsCreated} SORT_TO_BOX event(s) for box ${boxId} (desktop app compatibility)`);
      } catch (eventError) {
        // Log error but don't fail - box_id is already set in putaway lines
        console.error(`   ⚠️  Warning: Failed to create SORT_TO_BOX events for box ${boxId}:`, eventError.message);
        console.error(`   ⚠️  Box ${boxId} is still valid for putaway, but desktop app may not show contents until events are created.`);
      }
    }

    console.log(`✅ Putaway box creation complete: ${created} created, ${reused} reused`);
    return { created, reused };
  } catch (error) {
    console.error(`❌ Error creating putaway boxes for Transfer In ${transferInNo}:`, error);
    // Don't throw - allow putaway task creation to succeed even if box creation fails
    return { created: 0, reused: 0 };
  }
}

/**
 * GET /api/transfer-in/:title/putaway-boxes
 * Get all putaway boxes for a Transfer In
 * 
 * Returns boxes created for Transfer In putaway (box_id = carton_id, e.g., CTN-TI-123457-20260120-160936-988)
 */
export const getTransferInPutawayBoxes = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;

    // Check if Transfer In exists
    const [tiRows] = await connection.execute(
      `SELECT title FROM tabTransferIn WHERE title = ?`,
      [title]
    );

    if (tiRows.length === 0) {
      // Try to find similar Transfer In titles (in case of typo)
      const [similarTIs] = await connection.execute(
        `SELECT title FROM tabTransferIn WHERE title LIKE ? LIMIT 5`,
        [`%${title.slice(-6)}%`] // Last 6 characters
      );
      
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${title} not found`,
          suggestions: similarTIs.length > 0 ? similarTIs.map(ti => ti.title) : undefined
        },
      });
    }

    console.log(`[Validate Carton] ✅ Transfer In ${title} exists (status: ${tiRows[0].status})`);

    // Check for optional columns in tabSortBox
    // Note: Use purpose field instead of source_type (purpose = 'PUTAWAY' for Transfer In)
    const [sortBoxColumns] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabSortBox'
        AND COLUMN_NAME IN ('source_ref', 'putaway_task_title', 'purpose')
    `);
    const columnNames = sortBoxColumns.map(col => col.COLUMN_NAME);
    const hasSourceRef = columnNames.includes('source_ref');
    const hasPutawayTaskTitle = columnNames.includes('putaway_task_title');
    const hasPurpose = columnNames.includes('purpose');

    // Build query based on available columns
    let query = `
      SELECT 
        box_id,
        status,
        advance_shipping_notice,
        transfer_order,
        store,
        purpose,
        created_by,
        created_on
    `;
    
    if (hasSourceRef) query += `, source_ref`;
    if (hasPutawayTaskTitle) query += `, putaway_task_title`;
    
    query += `
      FROM tabSortBox
      WHERE advance_shipping_notice = ?
        AND status != 'Closed'
    `;
    
    const params = [title];
    
    // Match ASN pattern: No purpose filter, rely on advance_shipping_notice matching Transfer In title
    // CRITICAL: Exclude closed boxes - they've already been put away
    query += ` ORDER BY created_on DESC`;

    const [boxes] = await connection.execute(query, params);

    // Get putaway task for each box if putaway_task_title column exists
    if (hasPutawayTaskTitle && boxes.length > 0) {
      for (const box of boxes) {
        if (box.putaway_task_title) {
          const [task] = await connection.execute(
            `SELECT title, status FROM tabPutawayTask WHERE title = ? LIMIT 1`,
            [box.putaway_task_title]
          );
          box.putaway_task = task.length > 0 ? task[0] : null;
        }
      }
    }

    connection.release();

    res.json({
      ok: true,
      message: `Found ${boxes.length} putaway box(es) for Transfer In ${title}`,
      data: {
        transfer_in: title,
        boxes: boxes
      }
    });
  } catch (error) {
    connection.release();
    console.error(`❌ Error getting putaway boxes for Transfer In ${req.params.title}:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get putaway boxes",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  }
};

/**
 * POST /api/transfer-in/:title/validate-carton
 * Validate carton exists in Transfer In and return box_id for putaway
 * 
 * Request Body:
 * {
 *   "carton_id": "CTN-555444"
 * }
 * 
 * Response:
 * {
 *   "ok": true,
 *   "validated": {
 *     "carton_id": "CTN-555444",
 *     "box_id": "CTN-TI-123457-20260120-160936-988",
 *     "putaway_task": "PUT-20260120-0001",
 *     "exists": true
 *   }
 * }
 */
export const validateTransferInCarton = async (req, res) => {
  const connection = await getConnection();

  try {
    const { title } = req.params;
    // CRITICAL: For Transfer In Putaway, carton_id IS the box_id (same as ASN)
    // Accept both carton_id and box_id parameters (they should be the same)
    // create_carton_if_missing: when true, if box exists in tabCarton/tabCartonStock but not in this Transfer In, add it so user can "scan to existing box"
    const { carton_id, box_id, create_carton_if_missing } = req.body || {};
    const actualBoxId = box_id || carton_id; // Use box_id if provided, otherwise use carton_id

    // Validate title parameter
    if (!title || title.trim() === '') {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Transfer In title is required in URL path",
        },
      });
    }

    if (!actualBoxId) {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "carton_id or box_id is required (for Transfer In Putaway, carton_id is used as box_id)",
        },
      });
    }

    // Normalize title (trim whitespace)
    const normalizedTitle = title.trim();
    console.log(`[Validate Carton] Starting validation for box_id ${actualBoxId} in Transfer In ${normalizedTitle}`);
    console.log(`[Validate Carton] Request params: title="${title}", normalized="${normalizedTitle}", box_id="${actualBoxId}"`);
    console.log(`[Validate Carton] Note: For Transfer In Putaway, carton_id is used as box_id (same as ASN)`);

    // Check if Transfer In exists (use normalized title)
    const [tiRows] = await connection.execute(
      `SELECT title, status FROM tabTransferIn WHERE title = ?`,
      [normalizedTitle]
    );

    if (tiRows.length === 0) {
      // Try to find similar Transfer In titles (in case of typo)
      const [similarTIs] = await connection.execute(
        `SELECT title FROM tabTransferIn WHERE title LIKE ? LIMIT 5`,
        [`%${title.slice(-6)}%`] // Last 6 characters
      );
      
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Transfer In ${title} not found`,
          suggestions: similarTIs.length > 0 ? similarTIs.map(ti => ti.title) : undefined
        },
      });
    }

    const transferInStatus = tiRows[0].status;
    const actualTitle = tiRows[0].title; // Get actual title from DB (in case of case sensitivity)
    console.log(`[Validate Carton] ✅ Transfer In ${actualTitle} exists (status: ${transferInStatus})`);

    // Allow validation for "Submitted" status - user needs to validate carton before scanning items
    // Only block "Draft" status where Transfer In hasn't been submitted yet
    if (transferInStatus === 'Draft') {
      connection.release();
      return res.status(400).json({
        ok: false,
        error: {
          code: "TRANSFER_IN_NOT_SUBMITTED",
          message: `Transfer In ${actualTitle} is in "Draft" status. Please submit the Transfer In first before validating cartons.`,
        },
      });
    }

    // Use actual title from database for all subsequent queries (handles case sensitivity)
    const titleToUse = actualTitle;

    // CRITICAL: For Transfer In Putaway, validate box_id directly in tabSortBox (same as ASN)
    // box_id = carton_id (e.g., CTN-TI-123457-20260120-160936-988)
    // Priority 1: Check tabSortBox directly by box_id (most reliable - same as ASN)
    // Priority 2: Check putaway lines (fallback)
    // Priority 3: Check tabTransferInCarton (multi-carton mode)
    // Priority 4: Check tabTransferInItem (legacy mode)
    
    let cartonExists = false;
    let putawayTaskTitle = null;
    let boxId = actualBoxId; // Use the provided box_id (which is the carton_id)

    // Priority 1: Check tabSortBox directly by box_id (same as ASN validation)
    // Match ASN pattern: simple query, validate advance_shipping_notice in code
    const [sortBoxCheck] = await connection.execute(
      `SELECT box_id, status, advance_shipping_notice, store 
       FROM tabSortBox 
       WHERE box_id = ? 
       LIMIT 1`,
      [actualBoxId]
    );

    if (sortBoxCheck.length > 0) {
      const box = sortBoxCheck[0];
      
      // Validate advance_shipping_notice matches Transfer In title (same as ASN validation)
      if (box.advance_shipping_notice !== titleToUse) {
        console.log(`[Validate Carton] ⚠️ Box ${actualBoxId} exists but advance_shipping_notice (${box.advance_shipping_notice}) doesn't match Transfer In ${titleToUse}`);
      } else {
        cartonExists = true;
        console.log(`[Validate Carton] ✅ Found box ${actualBoxId} in tabSortBox for Transfer In ${titleToUse} (status: ${box.status})`);
        
        // Try to find putaway task from advance_shipping_notice (Transfer In title)
        const [taskFromAsn] = await connection.execute(
          `SELECT title FROM tabPutawayTask 
           WHERE transfer_in = ? OR advance_shipping_notice = ?
           ORDER BY created_at DESC LIMIT 1`,
          [titleToUse, titleToUse]
        );
        if (taskFromAsn.length > 0) {
          putawayTaskTitle = taskFromAsn[0].title;
        }
      }
    }

    // Priority 2: Check putaway lines (carton is linked to putaway task) - fallback
    if (!cartonExists) {
      const [putawayLineCheck] = await connection.execute(
        `SELECT DISTINCT pl.parent_title, pl.carton_id
         FROM tabPutawayLine pl
         JOIN tabPutawayTask pt ON pl.parent_title = pt.title
         WHERE pl.carton_id = ?
           AND (
             (pt.source_type = 'TransferIn' AND pt.transfer_in = ?)
             OR (pt.advance_shipping_notice = ?)
           )
         LIMIT 1`,
        [actualBoxId, titleToUse, titleToUse]
      );

      if (putawayLineCheck.length > 0) {
        cartonExists = true;
        putawayTaskTitle = putawayLineCheck[0].parent_title;
        console.log(`[Validate Carton] ✅ Found box ${actualBoxId} in putaway lines for Transfer In ${titleToUse}`);
      }
    }

    // Priority 3: Check tabTransferInCarton (if not found in putaway lines)
    if (!cartonExists) {
      const [cartonTableCheck] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransferInCarton'
      `);
      const hasMultiCartonTables = cartonTableCheck.length > 0;

      if (hasMultiCartonTables) {
        // Multi-carton mode: Check tabTransferInCarton
        const [cartonRows] = await connection.execute(
          `SELECT carton_id, transfer_in, status 
           FROM tabTransferInCarton 
           WHERE carton_id = ? AND transfer_in = ? 
           LIMIT 1`,
          [actualBoxId, titleToUse]
        );

        if (cartonRows.length > 0) {
          cartonExists = true;
          console.log(`[Validate Carton] ✅ Found carton ${actualBoxId} in tabTransferInCarton for Transfer In ${titleToUse}`);
        } else {
          console.log(`[Validate Carton] ⚠️ Carton ${actualBoxId} not found in tabTransferInCarton for Transfer In ${titleToUse}`);
        }
      }
    }

    // Priority 3: Check tabTransferInItem (legacy mode)
    if (!cartonExists) {
      const [itemRows] = await connection.execute(
        `SELECT DISTINCT carton_id, received_qty
         FROM tabTransferInItem 
         WHERE parent_title = ? AND carton_id = ? AND received_qty > 0
         LIMIT 1`,
        [titleToUse, actualBoxId]
      );

      if (itemRows.length > 0) {
        cartonExists = true;
        console.log(`[Validate Carton] ✅ Found carton ${actualBoxId} in tabTransferInItem for Transfer In ${titleToUse} (received_qty: ${itemRows[0].received_qty})`);
      } else {
        // Debug: Check if carton exists but with received_qty = 0
        const [debugItemRows] = await connection.execute(
          `SELECT DISTINCT carton_id, received_qty
           FROM tabTransferInItem 
           WHERE parent_title = ? AND carton_id = ?
           LIMIT 1`,
          [titleToUse, actualBoxId]
        );
        if (debugItemRows.length > 0) {
          console.log(`[Validate Carton] ⚠️ Carton ${actualBoxId} exists in tabTransferInItem but received_qty = ${debugItemRows[0].received_qty} (not received yet)`);
        }
      }
    }

    // Priority 5: Also check tabTransferInCartonLine (multi-carton mode, even if carton table check failed)
    if (!cartonExists) {
      const [cartonLineCheck] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransferInCartonLine'
      `);
      const hasCartonLineTable = cartonLineCheck.length > 0;

      if (hasCartonLineTable) {
        const [cartonLineRows] = await connection.execute(
          `SELECT DISTINCT carton_id, SUM(received_qty) as total_received
           FROM tabTransferInCartonLine 
           WHERE transfer_in = ? AND carton_id = ?
           GROUP BY carton_id
           HAVING total_received > 0
           LIMIT 1`,
          [titleToUse, actualBoxId]
        );

        if (cartonLineRows.length > 0) {
          cartonExists = true;
          console.log(`[Validate Carton] ✅ Found carton ${actualBoxId} in tabTransferInCartonLine for Transfer In ${titleToUse} (total_received: ${cartonLineRows[0].total_received})`);
        } else {
          // Debug: Check if carton exists but with received_qty = 0
          const [debugCartonLineRows] = await connection.execute(
            `SELECT DISTINCT carton_id, SUM(received_qty) as total_received
             FROM tabTransferInCartonLine 
             WHERE transfer_in = ? AND carton_id = ?
             GROUP BY carton_id
             LIMIT 1`,
            [titleToUse, actualBoxId]
          );
          if (debugCartonLineRows.length > 0) {
            console.log(`[Validate Carton] ⚠️ Carton ${actualBoxId} exists in tabTransferInCartonLine but total_received = ${debugCartonLineRows[0].total_received} (not received yet)`);
          }
        }
      }
    }

    // Scan to existing box: if carton not in Transfer In but exists in system, add it when create_carton_if_missing is true
    if (!cartonExists && create_carton_if_missing) {
      let existingCartonFound = false;
      const [cartonTableCheck] = await connection.execute(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabTransferInCarton'
      `);
      const hasMultiCartonTables = cartonTableCheck.length > 0;

      if (hasMultiCartonTables) {
        // Check if carton exists in tabCarton or tabCartonStock (any transfer)
        const [tabCartonExists] = await connection.execute(
          `SELECT 1 FROM tabCarton WHERE carton_id = ? LIMIT 1`,
          [actualBoxId]
        );
        let [tabCartonStockExists] = [[]];
        try {
          [tabCartonStockExists] = await connection.execute(
            `SELECT 1 FROM tabCartonStock WHERE carton_id = ? LIMIT 1`,
            [actualBoxId]
          );
        } catch (_) {
          // tabCartonStock may not exist
        }
        if (tabCartonExists.length > 0 || tabCartonStockExists.length > 0) {
          try {
            await connection.beginTransaction();
            const cartonName = `TIC-${titleToUse}-${actualBoxId}-${Date.now()}`.replace(/\s/g, '-');
            await connection.execute(
              `INSERT INTO tabTransferInCarton (name, carton_id, transfer_in, status, created_by, created_at)
               VALUES (?, ?, ?, 'Draft', 'SYSTEM', NOW())
               ON DUPLICATE KEY UPDATE updated_at = NOW()`,
              [cartonName, actualBoxId, titleToUse]
            );
            // Add carton lines from Transfer In items so putaway can use this box
            const [lineTableCheck] = await connection.execute(`
              SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabTransferInCartonLine'
            `);
            if (lineTableCheck.length > 0) {
              const [items] = await connection.execute(
                `SELECT item_code FROM tabTransferInItem WHERE parent_title = ? GROUP BY item_code`,
                [titleToUse]
              );
              for (const row of items) {
                const lineName = `TICL-${titleToUse}-${actualBoxId}-${row.item_code}-${Date.now()}`.replace(/\s/g, '-');
                await connection.execute(
                  `INSERT IGNORE INTO tabTransferInCartonLine (name, transfer_in, carton_id, item_code, received_qty, created_at)
                   VALUES (?, ?, ?, ?, 0, NOW())`,
                  [lineName, titleToUse, actualBoxId, row.item_code]
                );
              }
            }
            await connection.commit();
            cartonExists = true;
            existingCartonFound = true;
            console.log(`[Validate Carton] ✅ Added existing box ${actualBoxId} to Transfer In ${titleToUse} (create_carton_if_missing)`);
          } catch (err) {
            await connection.rollback();
            console.error(`[Validate Carton] Failed to add existing box to Transfer In:`, err);
          }
        }
      }
      if (!existingCartonFound) {
        console.log(`[Validate Carton] create_carton_if_missing=true but carton ${actualBoxId} not found in tabCarton/tabCartonStock`);
      }
    }

    if (!cartonExists) {
      // Debug: Check what boxes/cartons actually exist
      const [debugBoxes] = await connection.execute(
        `SELECT DISTINCT box_id FROM tabSortBox WHERE advance_shipping_notice = ? LIMIT 10`,
        [titleToUse]
      );
      const [debugItems] = await connection.execute(
        `SELECT DISTINCT carton_id FROM tabTransferInItem WHERE parent_title = ? AND carton_id IS NOT NULL LIMIT 10`,
        [titleToUse]
      );
      const [debugCartons] = await connection.execute(
        `SELECT DISTINCT carton_id FROM tabTransferInCarton WHERE transfer_in = ? LIMIT 10`,
        [titleToUse]
      );
      
      // Also check tabTransferInCartonLine
      const [debugCartonLines] = await connection.execute(
        `SELECT DISTINCT carton_id FROM tabTransferInCartonLine WHERE transfer_in = ? LIMIT 10`,
        [titleToUse]
      );
      
      console.log(`[Validate Carton] ❌ Box ${actualBoxId} not found in Transfer In ${titleToUse}`);
      console.log(`   Available boxes in tabSortBox: ${debugBoxes.map(r => r.box_id).join(', ') || 'NONE'}`);
      console.log(`   Available cartons in tabTransferInItem: ${debugItems.map(r => r.carton_id).join(', ') || 'NONE'}`);
      console.log(`   Available cartons in tabTransferInCarton: ${debugCartons.map(r => r.carton_id).join(', ') || 'NONE'}`);
      console.log(`   Available cartons in tabTransferInCartonLine: ${debugCartonLines.map(r => r.carton_id).join(', ') || 'NONE'}`);
      
      connection.release();
      return res.status(404).json({
        ok: false,
        error: {
          code: "BOX_NOT_FOUND",
          message: `Box ${actualBoxId} not found in Transfer In ${titleToUse}. For Transfer In Putaway, box_id should equal carton_id. To scan an existing box, send create_carton_if_missing: true in the request body.`,
          debug: process.env.NODE_ENV === 'development' ? {
            searched_box_id: actualBoxId,
            transfer_in: titleToUse,
            transfer_in_status: transferInStatus,
            available_boxes_in_sortbox: debugBoxes.map(r => r.box_id),
            available_cartons_in_items: debugItems.map(r => r.carton_id),
            available_cartons_in_cartons: debugCartons.map(r => r.carton_id),
            available_cartons_in_carton_lines: debugCartonLines.map(r => r.carton_id)
          } : undefined
        },
      });
    }

    // Find putaway task for this Transfer In (if not already found from putaway lines)
    if (!putawayTaskTitle) {
      const [taskColumns] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabPutawayTask'
          AND COLUMN_NAME IN ('source_type', 'transfer_in')
      `);
      const columnNames = taskColumns.map(col => col.COLUMN_NAME);
      const hasSourceType = columnNames.includes('source_type');
      const hasTransferIn = columnNames.includes('transfer_in');

      let taskQuery = `SELECT title FROM tabPutawayTask WHERE `;
      const taskParams = [];

      if (hasSourceType && hasTransferIn) {
        taskQuery += `source_type = 'TransferIn' AND transfer_in = ?`;
        taskParams.push(titleToUse);
      } else if (hasSourceType) {
        taskQuery += `source_type = 'TransferIn' AND advance_shipping_notice = ?`;
        taskParams.push(titleToUse);
      } else {
        taskQuery += `advance_shipping_notice = ?`;
        taskParams.push(titleToUse);
      }

      taskQuery += ` ORDER BY created_at DESC LIMIT 1`;

      const [taskRows] = await connection.execute(taskQuery, taskParams);

      if (taskRows.length > 0) {
        putawayTaskTitle = taskRows[0].title;
        console.log(`[Validate Carton] Found putaway task ${putawayTaskTitle} for Transfer In ${titleToUse}`);
      } else {
        console.log(`[Validate Carton] ⚠️ No putaway task found for Transfer In ${titleToUse} - carton is valid but putaway task needs to be created`);
        
        // AUTO-CREATE PUTAWAY TASK: Check if items have been received (regardless of status)
        // This ensures validation can return ready_for_putaway=true immediately
        // Check if any items have been received (received_qty > 0)
        const [receivedItemsCheck] = await connection.execute(`
          SELECT COUNT(*) as received_count
          FROM tabTransferInItem
          WHERE parent_title = ? AND received_qty > 0
        `, [titleToUse]);
        
        const hasReceivedItems = receivedItemsCheck.length > 0 && receivedItemsCheck[0].received_count > 0;
        const shouldAutoCreate = transferInStatus === 'Received' || 
                                 transferInStatus === 'Receiving' || 
                                 (transferInStatus === 'Submitted' && hasReceivedItems);
        
        if (shouldAutoCreate) {
          console.log(`[Validate Carton] 🔄 Auto-creating putaway task for Transfer In ${titleToUse} (status: ${transferInStatus}, hasReceivedItems: ${hasReceivedItems})`);
          
          try {
            // Get warehouse from Transfer In
            const [warehouseCols] = await connection.execute(`
              SELECT COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferIn'
                AND COLUMN_NAME = 'to_warehouse'
            `);
            const hasToWarehouse = warehouseCols.length > 0;
            
            let warehouse = 'WH-MAIN'; // Default
            if (hasToWarehouse) {
              const [warehouseRows] = await connection.execute(
                `SELECT to_warehouse FROM tabTransferIn WHERE title = ? LIMIT 1`,
                [titleToUse]
              );
              if (warehouseRows.length > 0 && warehouseRows[0].to_warehouse) {
                warehouse = warehouseRows[0].to_warehouse;
              }
            }
            
            // Create putaway task (this function handles idempotency)
            await createPutawayTaskFromTransferIn(connection, titleToUse, warehouse);
            
            // Re-query for the newly created task
            const [newTaskRows] = await connection.execute(taskQuery, taskParams);
            
            if (newTaskRows.length > 0) {
              putawayTaskTitle = newTaskRows[0].title;
              console.log(`[Validate Carton] ✅ Auto-created putaway task ${putawayTaskTitle} for Transfer In ${titleToUse}`);
              
              // Also ensure boxes are created for the putaway task
              await ensurePutawayBoxesForTransferIn(connection, {
                transferInNo: titleToUse,
                putawayTaskTitle: putawayTaskTitle,
                warehouse: warehouse,
                createdBy: "SYSTEM"
              });
            } else {
              console.log(`[Validate Carton] ⚠️ Putaway task creation completed but task not found - may need to retry`);
            }
          } catch (createError) {
            console.error(`[Validate Carton] ❌ Error auto-creating putaway task:`, createError);
            // Don't fail validation - just log error and continue
            // The putaway task will be created later during receiving
          }
        } else {
          console.log(`[Validate Carton] ⚠️ Cannot auto-create putaway task: Transfer In status is "${transferInStatus}" and no items received yet. Please receive items first.`);
        }
      }
    }

    // Find box_id if putaway task exists
    if (putawayTaskTitle) {
      // Find box_id for this carton in putaway lines
      const [boxIdColCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabPutawayLine'
          AND COLUMN_NAME = 'box_id'
      `);
      const hasBoxIdInLine = boxIdColCheck.length > 0;

      if (hasBoxIdInLine) {
        const [boxRows] = await connection.execute(
          `SELECT DISTINCT box_id 
           FROM tabPutawayLine 
           WHERE parent_title = ? AND carton_id = ? AND box_id IS NOT NULL AND box_id != ''
           LIMIT 1`,
          [putawayTaskTitle, actualBoxId]
        );

        if (boxRows.length > 0) {
          boxId = boxRows[0].box_id;
          console.log(`[Validate Carton] Found box_id ${boxId} in putaway lines (box_id = carton_id: ${actualBoxId})`);
        }
      }

      // If box_id not found in putaway lines, try to find in tabSortBox
      if (!boxId) {
        const [sortBoxColumns] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabSortBox'
            AND COLUMN_NAME IN ('source_ref', 'carton_id', 'putaway_task_title', 'purpose')
        `);
        const sortBoxColumnNames = sortBoxColumns.map(col => col.COLUMN_NAME);
        const hasPurposeInBox = sortBoxColumnNames.includes('purpose');
        const hasSourceRef = sortBoxColumnNames.includes('source_ref');
        const hasCartonIdInBox = sortBoxColumnNames.includes('carton_id');
        const hasPutawayTaskTitleInBox = sortBoxColumnNames.includes('putaway_task_title');

        // Match ASN pattern: Simple query by advance_shipping_notice (Transfer In title)
        // No purpose filter - rely on advance_shipping_notice matching Transfer In title
        let boxQuery = `SELECT box_id, status, advance_shipping_notice, store FROM tabSortBox WHERE advance_shipping_notice = ?`;
        const boxParams = [titleToUse];

        // Add carton_id filter if available (most specific for Transfer In)
        // Note: For Transfer In, box_id = carton_id, so this filter helps with validation
        if (hasCartonIdInBox) {
          boxQuery += ` AND carton_id = ?`;
          boxParams.push(actualBoxId);
        } else if (hasPutawayTaskTitleInBox && putawayTaskTitle) {
          // Fallback: filter by putaway_task_title
          boxQuery += ` AND putaway_task_title = ?`;
          boxParams.push(putawayTaskTitle);
        }

        boxQuery += ` ORDER BY created_on DESC LIMIT 1`;

        const [boxRows] = await connection.execute(boxQuery, boxParams);

        if (boxRows.length > 0) {
          boxId = boxRows[0].box_id;
          console.log(`[Validate Carton] Found box_id ${boxId} in tabSortBox (box_id = carton_id: ${actualBoxId})`);
        }
      }
    }

    connection.release();

    // Determine if ready for putaway
    const readyForPutaway = boxId !== null && putawayTaskTitle !== null;
    
    if (!readyForPutaway) {
      console.log(`[Validate Carton] ⚠️ Box ${actualBoxId} validated but not ready for putaway:`);
      console.log(`   - box_id: ${boxId || 'NOT FOUND'}`);
      console.log(`   - putaway_task: ${putawayTaskTitle || 'NOT FOUND'}`);
      if (!putawayTaskTitle) {
        console.log(`   - ⚠️ Putaway task not created yet. Please wait for putaway task creation to complete.`);
      }
    } else {
      console.log(`[Validate Carton] ✅ Box ${actualBoxId} validated and ready for putaway:`);
      console.log(`   - box_id: ${boxId} (box_id = carton_id for Transfer In)`);
      console.log(`   - putaway_task: ${putawayTaskTitle}`);
    }

    res.json({
      ok: true,
      message: readyForPutaway 
        ? `Box ${actualBoxId} validated successfully and ready for putaway`
        : `Box ${actualBoxId} validated successfully but putaway task not ready yet`,
      validated: {
        carton_id: actualBoxId, // For Transfer In, carton_id = box_id
        box_id: boxId || actualBoxId, // Return box_id (same as carton_id)
        exists: true,
        putaway_task: putawayTaskTitle || null,
        ready_for_putaway: readyForPutaway
      }
    });
  } catch (error) {
    connection.release();
    console.error(`❌ Error validating carton for Transfer In ${req.params.title}:`, error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to validate carton",
        details: process.env.NODE_ENV === 'development' ? error.message : null,
      },
    });
  }
};
