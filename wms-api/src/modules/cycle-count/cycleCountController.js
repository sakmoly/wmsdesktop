// wms-api/src/modules/cycle-count/cycleCountController.js
// Cycle Count API endpoints - Mobile App Compatible Format

import { getConnection } from '../../db/connection.js';

/**
 * Helper function to format cycle count line for mobile app
 */
function formatCycleCountLine(line) {
  const lineId = line.id;
  const actualQty = line.actual_qty ? parseFloat(line.actual_qty) : null;
  const expectedQty = line.expected_qty ? parseFloat(line.expected_qty) : null;
  const discrepancy = line.discrepancy ? parseFloat(line.discrepancy) : null;
  
  return {
    // Mobile app fields
    line_id: `LINE-${lineId}`, // String format for mobile app
    id: lineId, // Keep numeric ID for compatibility
    item_code: line.item_code,
    barcode: line.item_code, // Use item_code as barcode if not separate
    uom: 'EA', // Default unit of measure
    expected_qty: expectedQty,
    actual_qty: actualQty,
    counted_qty: actualQty, // Alias for actual_qty
    variance_qty: discrepancy, // Mobile app uses variance_qty
    discrepancy: discrepancy, // Keep for backward compatibility
    bin_location: line.bin_location || null,
    status: line.status || 'Pending',
    is_unexpected_item: false, // Default, can be set later
    reason_code: null, // Can map from discrepancy_reason if needed
    notes: line.discrepancy_reason || null,
    discrepancy_reason: line.discrepancy_reason || null, // Keep for backward compatibility
    counted_by: line.counted_by || null,
    counted_on: line.counted_on ? line.counted_on.toISOString() : null,
    reviewed_by: line.reviewed_by || null,
    reviewed_on: line.reviewed_on ? line.reviewed_on.toISOString() : null,
    approval_required: Boolean(line.approval_required),
    approved_by: line.approved_by || null,
    approved_on: line.approved_on ? line.approved_on.toISOString() : null
  };
}

/**
 * Helper function to format cycle count task for mobile app
 */
function formatCycleCountTask(row, lines = []) {
  // Map count_type: "Cycle" -> "Directed", "Full" -> "Adhoc", keep original
  const countType = row.count_type;
  const mobileCountType = countType === 'Cycle' ? 'Directed' : (countType === 'Full' ? 'Adhoc' : countType);
  
  // Determine if blind count (expected_qty is null for all lines)
  const isBlindCount = lines.length > 0 && lines.every(line => line.expected_qty === null);
  
  // Get started_at and started_by (if status changed to "In Progress", use updated_at as started_at)
  const startedAt = row.status === 'In Progress' && row.updated_at ? row.updated_at.toISOString() : null;
  const startedBy = row.status === 'In Progress' ? row.assigned_to || row.created_by : null;
  
  // Format lines for mobile app (support both 'items' and 'lines' field names)
  const formattedLines = lines.map(formatCycleCountLine);
  
  return {
    // Core fields
    title: row.title,
    status: row.status,
    count_type: mobileCountType, // Mobile app format
    count_type_original: countType, // Keep original for compatibility
    
    // Warehouse and location
    warehouse_id: row.warehouse, // Mobile app field
    warehouse: row.warehouse, // Keep for backward compatibility
    bin_code: row.zone || null, // Mobile app uses bin_code
    bin_id: row.zone || null, // Mobile app uses bin_id (can be same as bin_code)
    zone: row.zone || null, // Keep for backward compatibility
    
    // Dates and times
    count_date: row.count_date ? row.count_date.toISOString().split('T')[0] : null,
    scheduled_start_time: row.scheduled_start_time || null,
    scheduled_end_time: row.scheduled_end_time || null,
    started_at: startedAt,
    started_by: startedBy,
    created_at: row.created_at ? row.created_at.toISOString() : null,
    updated_at: row.updated_at ? row.updated_at.toISOString() : null,
    
    // Flags
    is_blind_count: isBlindCount,
    freeze_stock: Boolean(row.freeze_stock),
    
    // Users
    created_by: row.created_by,
    assigned_to: row.assigned_to || null,
    
    // Statistics
    total_items: parseInt(row.total_items) || 0,
    counted_items: parseInt(row.counted_items) || 0,
    items_with_discrepancy: parseInt(row.items_with_discrepancy) || 0,
    
    // Lines - support both 'items' and 'lines' field names for mobile app compatibility
    items: formattedLines, // Mobile app primary field
    lines: formattedLines // Alternative field name
  };
}

/**
 * GET /api/cycle-count
 * Get all Cycle Count Task documents
 * 
 * Query Parameters:
 * - status (optional): Filter by status (comma-separated values supported)
 * - warehouse (optional): Filter by warehouse
 * - zone (optional): Filter by zone
 * - count_type (optional): Filter by count type
 */
export const getCycleCountTasks = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { status, warehouse, zone, count_type } = req.query;
    
    let query = `
      SELECT 
        title,
        status,
        count_type,
        warehouse,
        zone,
        count_date,
        scheduled_start_time,
        scheduled_end_time,
        freeze_stock,
        created_by,
        assigned_to,
        total_items,
        counted_items,
        items_with_discrepancy,
        created_at,
        updated_at
      FROM tabCycleCountTask
      WHERE 1=1
    `;
    
    const params = [];
    
    // Support comma-separated status values
    if (status) {
      const statusList = status.split(',').map(s => s.trim()).filter(s => s);
      if (statusList.length > 0) {
        query += ` AND status IN (${statusList.map(() => '?').join(',')})`;
        params.push(...statusList);
      }
    }
    
    if (warehouse) {
      query += ' AND warehouse = ?';
      params.push(warehouse);
    }
    
    if (zone) {
      query += ' AND zone = ?';
      params.push(zone);
    }
    
    if (count_type) {
      query += ' AND count_type = ?';
      params.push(count_type);
    }
    
    query += ' ORDER BY count_date DESC, title';
    
    const [rows] = await connection.execute(query, params);
    
    // Get lines for each Cycle Count Task (only if needed - for list view, we might skip this)
    const cycleCountTasks = await Promise.all(rows.map(async (row) => {
      // For list view, we don't need all lines - just return task info
      // Mobile app will call detail endpoint for lines
      return formatCycleCountTask(row, []);
    }));
    
    res.json({
      ok: true,
      data: cycleCountTasks
    });
    
  } catch (error) {
    console.error('Failed to fetch Cycle Count Tasks:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch Cycle Count Tasks',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/cycle-count/:title
 * Get a single Cycle Count Task document by title
 */
export const getCycleCountTaskByTitle = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    const [rows] = await connection.execute(`
      SELECT 
        title,
        status,
        count_type,
        warehouse,
        zone,
        count_date,
        scheduled_start_time,
        scheduled_end_time,
        freeze_stock,
        created_by,
        assigned_to,
        total_items,
        counted_items,
        items_with_discrepancy,
        created_at,
        updated_at
      FROM tabCycleCountTask
      WHERE title = ?
    `, [title]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const row = rows[0];
    
    // Get lines
    const [lineRows] = await connection.execute(`
      SELECT 
        id,
        item_code,
        bin_location,
        expected_qty,
        actual_qty,
        discrepancy,
        counted_by,
        counted_on,
        reviewed_by,
        reviewed_on,
        approval_required,
        approved_by,
        approved_on,
        discrepancy_reason,
        status
      FROM tabCycleCountLine
      WHERE parent_title = ?
      ORDER BY item_code, bin_location
    `, [title]);
    
    const formattedTask = formatCycleCountTask(row, lineRows);
    
    res.json({
      ok: true,
      data: formattedTask
    });
    
  } catch (error) {
    console.error('Failed to fetch Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to fetch Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count
 * Create a new Cycle Count Task document
 */
export const createCycleCountTask = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title, count_type, warehouse, zone, count_date, scheduled_start_time, scheduled_end_time, freeze_stock, created_by, assigned_to, lines } = req.body;
    
    // Validation
    if (!title || !count_type || !warehouse || !count_date || !created_by) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'title, count_type, warehouse, count_date, and created_by are required'
        }
      });
    }
    
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'lines array is required and must not be empty'
        }
      });
    }
    
    const total_items = lines.length;
    
    // Insert Cycle Count Task
    await connection.execute(`
      INSERT INTO tabCycleCountTask 
        (title, status, count_type, warehouse, zone, count_date, scheduled_start_time, scheduled_end_time, freeze_stock, created_by, assigned_to, total_items, counted_items, items_with_discrepancy)
      VALUES (?, 'Draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `, [title, count_type, warehouse, zone || null, count_date, scheduled_start_time || null, scheduled_end_time || null, freeze_stock || false, created_by, assigned_to || null, total_items]);
    
    // Insert lines
    for (const line of lines) {
      await connection.execute(`
        INSERT INTO tabCycleCountLine 
          (parent_title, item_code, bin_location, expected_qty, status)
        VALUES (?, ?, ?, ?, 'Pending')
      `, [title, line.item_code, line.bin_location || null, line.expected_qty || null]);
    }
    
    res.status(201).json({
      ok: true,
      message: 'Cycle Count Task created successfully',
      data: {
        title: title,
        status: 'Draft',
        total_items: total_items
      }
    });
    
  } catch (error) {
    console.error('Failed to create Cycle Count Task:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        error: {
          code: 'DUPLICATE_ENTRY',
          message: 'Cycle Count Task with this title already exists'
        }
      });
    }
    
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to create Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/start
 * Start a Cycle Count Task (change status to "In Progress")
 */
export const startCycleCount = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { started_by } = req.body;
    
    // Check if task exists
    const [rows] = await connection.execute(`
      SELECT status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    if (rows[0].status !== 'Draft' && rows[0].status !== 'Scheduled') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot start Cycle Count Task. Current status: ${rows[0].status}`
        }
      });
    }
    
    // Update status to "In Progress" and set assigned_to if started_by provided
    const updateQuery = started_by 
      ? `UPDATE tabCycleCountTask SET status = 'In Progress', assigned_to = ?, updated_at = NOW() WHERE title = ?`
      : `UPDATE tabCycleCountTask SET status = 'In Progress', updated_at = NOW() WHERE title = ?`;
    const updateParams = started_by ? [started_by, title] : [title];
    
    await connection.execute(updateQuery, updateParams);
    
    res.json({
      ok: true,
      message: 'Cycle Count Task started successfully',
      data: {
        title: title,
        status: 'In Progress',
        started_at: new Date().toISOString(),
        started_by: started_by || null
      }
    });
    
  } catch (error) {
    console.error('Failed to start Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to start Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/update-line
 * Update a single cycle count line
 * Accepts both 'id' (number) and 'line_id' (string) formats
 */
export const updateCountLine = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { line_id, id, actual_qty, counted_qty, counted_by, discrepancy_reason, reason_code, notes } = req.body;
    
    // Support both 'id' (number) and 'line_id' (string "LINE-{id}") formats
    let lineId = line_id || id;
    if (typeof lineId === 'string' && lineId.startsWith('LINE-')) {
      lineId = parseInt(lineId.replace('LINE-', ''));
    }
    lineId = parseInt(lineId);
    
    // Support both actual_qty and counted_qty (they're the same)
    const qty = actual_qty !== undefined ? actual_qty : counted_qty;
    
    // Validation
    if (!lineId || (qty === undefined && qty === null)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'line_id (or id) and actual_qty (or counted_qty) are required'
        }
      });
    }
    
    // Check if task exists
    const [taskRows] = await connection.execute(`
      SELECT status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (taskRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    // Check if line exists and belongs to this task
    const [lineRows] = await connection.execute(`
      SELECT id, parent_title, expected_qty, actual_qty
      FROM tabCycleCountLine 
      WHERE id = ? AND parent_title = ?
    `, [lineId, title]);
    
    if (lineRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Line ${lineId} not found for task ${title}`
        }
      });
    }
    
    const line = lineRows[0];
    const wasCounted = line.actual_qty !== null;
    
    // Use discrepancy_reason, reason_code, or notes (prefer reason_code/notes for mobile app)
    const reason = reason_code || notes || discrepancy_reason || null;
    
    // Update line
    await connection.execute(`
      UPDATE tabCycleCountLine 
      SET 
        actual_qty = ?,
        counted_by = ?,
        counted_on = NOW(),
        discrepancy_reason = ?,
        status = 'Counted',
        updated_at = NOW()
      WHERE id = ?
    `, [qty, counted_by || null, reason, lineId]);
    
    // Recalculate task statistics
    const [countedRows] = await connection.execute(`
      SELECT 
        COUNT(*) as total_counted,
        SUM(CASE WHEN ABS(COALESCE(discrepancy, 0)) > 0 THEN 1 ELSE 0 END) as with_discrepancy
      FROM tabCycleCountLine 
      WHERE parent_title = ? AND actual_qty IS NOT NULL
    `, [title]);
    
    const counted_items = countedRows[0].total_counted || 0;
    const items_with_discrepancy = countedRows[0].with_discrepancy || 0;
    
    // Update task
    await connection.execute(`
      UPDATE tabCycleCountTask 
      SET 
        counted_items = ?,
        items_with_discrepancy = ?,
        updated_at = NOW()
      WHERE title = ?
    `, [counted_items, items_with_discrepancy, title]);
    
    res.json({
      ok: true,
      message: 'Cycle Count Line updated successfully',
      data: {
        line_id: `LINE-${lineId}`,
        id: lineId,
        actual_qty: parseFloat(qty),
        counted_qty: parseFloat(qty),
        variance_qty: parseFloat(qty) - parseFloat(line.expected_qty),
        was_counted: wasCounted
      }
    });
    
  } catch (error) {
    console.error('Failed to update Cycle Count Line:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update Cycle Count Line',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/count
 * Batch update multiple count lines (for mobile app)
 * Accepts both 'id' (number) and 'line_id' (string) formats
 */
export const updateCountLines = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    const { counted_by, lines } = req.body;
    
    // Validation
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'lines array is required and must not be empty'
        }
      });
    }
    
    // Check if task exists
    let [taskRows] = await connection.execute(`
      SELECT status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    // Note: Mobile app should send item_code in the request for proper line matching
    
    // If task doesn't exist, try to auto-create it for ad-hoc counts
    if (taskRows.length === 0) {
      // Extract task metadata from request body or title
      const { 
        warehouse_id, warehouse, 
        bin_code, bin_id, zone,
        count_type = 'Adhoc', // Default to Adhoc for auto-created tasks
        created_by, counted_by,
        count_date 
      } = req.body;
      
      // Determine warehouse and zone/bin from request
      const taskWarehouse = warehouse_id || warehouse || 'DEFAULT-WH';
      const taskZone = bin_code || bin_id || zone || null;
      const taskCreatedBy = created_by || counted_by || 'MOBILE-USER';
      const taskCountDate = count_date || new Date().toISOString().split('T')[0];
      
      // Parse bin code from title if available (e.g., "CC-BIN-A1-01-4B7A84C7" or "CC-A1-R01-L1-B1-7658B91F")
      let parsedBinCode = null;
      if (title.startsWith('CC-')) {
        const parts = title.replace('CC-', '').split('-');
        // Try to extract bin code (everything before the last part which is usually a hash)
        if (parts.length > 1) {
          // For "CC-BIN-A1-01-4B7A84C7", bin_code might be "BIN-A1-01"
          // For "CC-A1-R01-L1-B1-7658B91F", bin_code might be "A1-R01-L1-B1"
          const lastPart = parts[parts.length - 1];
          // If last part looks like a hash (8 hex chars), use everything before it
          if (/^[0-9A-F]{8}$/i.test(lastPart)) {
            parsedBinCode = parts.slice(0, -1).join('-');
          } else {
            parsedBinCode = parts.join('-');
          }
        }
      }
      
      const finalBinCode = bin_code || bin_id || zone || parsedBinCode;
      
      console.log(`[Cycle Count] Auto-creating ad-hoc task: ${title} (warehouse: ${taskWarehouse}, bin: ${finalBinCode})`);
      
      try {
        // Create the task with minimal required fields
        await connection.execute(`
          INSERT INTO tabCycleCountTask 
            (title, status, count_type, warehouse, zone, count_date, created_by, total_items, counted_items, items_with_discrepancy)
          VALUES (?, 'In Progress', ?, ?, ?, ?, ?, 0, 0, 0)
        `, [title, count_type, taskWarehouse, finalBinCode, taskCountDate, taskCreatedBy]);
        
        console.log(`[Cycle Count] ✅ Auto-created ad-hoc task: ${title}`);
        
        // Re-fetch the task
        [taskRows] = await connection.execute(`
          SELECT status FROM tabCycleCountTask WHERE title = ?
        `, [title]);
      } catch (createError) {
        // If creation fails (e.g., duplicate), try to fetch again
        if (createError.code === 'ER_DUP_ENTRY') {
          [taskRows] = await connection.execute(`
            SELECT status FROM tabCycleCountTask WHERE title = ?
          `, [title]);
        } else {
          console.error(`[Cycle Count] Failed to auto-create task ${title}:`, createError);
          return res.status(500).json({
            ok: false,
            error: {
              code: 'TASK_CREATION_FAILED',
              message: `Failed to auto-create Cycle Count Task: ${createError.message}`
            }
          });
        }
      }
    }
    
    let updatedCount = 0;
    const errors = [];
    
    // Update each line
    for (const line of lines) {
      // Log incoming line data for debugging
      console.log(`[Cycle Count] Processing line: ${JSON.stringify(line)}`);
      
      // Support both actual_qty and counted_qty (they're the same)
      const qty = line.actual_qty !== undefined ? line.actual_qty : line.counted_qty;
      
      // Log the extracted quantity
      console.log(`[Cycle Count] Extracted qty: ${qty} (actual_qty: ${line.actual_qty}, counted_qty: ${line.counted_qty})`);
      
      if ((qty === undefined || qty === null)) {
        console.log(`[Cycle Count] ⚠️ Skipping line - missing qty: ${JSON.stringify(line)}`);
        errors.push(`Line missing actual_qty/counted_qty: ${JSON.stringify(line)}`);
        continue;
      }
      
      // Extract line data from request - item_code is REQUIRED
      const itemCode = line.item_code || line.barcode || null;
      const binLocation = line.bin_location || null;
      const expectedQty = line.expected_qty !== undefined ? line.expected_qty : null;
      
      // Validation: item_code is required
      if (!itemCode) {
        errors.push(`Line missing required field: item_code or barcode. Line data: ${JSON.stringify(line)}`);
        continue;
      }
      
      try {
        let lineId = null;
        let lineRows = [];
        
        // Strategy 1: Try to find by database ID (if line_id is provided as "LINE-{id}" or direct number)
        if (line.line_id || line.id) {
          let providedId = line.line_id || line.id;
          if (typeof providedId === 'string' && providedId.startsWith('LINE-')) {
            providedId = parseInt(providedId.replace('LINE-', ''));
          }
          providedId = parseInt(providedId);
          
          if (providedId && !isNaN(providedId)) {
            [lineRows] = await connection.execute(`
              SELECT id, parent_title, expected_qty
              FROM tabCycleCountLine 
              WHERE id = ? AND parent_title = ?
            `, [providedId, title]);
            
            if (lineRows.length > 0) {
              lineId = lineRows[0].id;
              console.log(`[Cycle Count] Found line by database ID: ${lineId}`);
            }
          }
        }
        
        // Strategy 2: Find by item_code and bin_location (PRIMARY METHOD)
        // This is the most reliable method when mobile app sends item_code
        if (!lineId) {
          let findQuery = `
            SELECT id, parent_title, expected_qty
            FROM tabCycleCountLine 
            WHERE parent_title = ? AND item_code = ?
          `;
          const findParams = [title, itemCode];
          
          if (binLocation) {
            findQuery += ' AND (bin_location = ? OR bin_location IS NULL)';
            findParams.push(binLocation);
          } else {
            findQuery += ' AND bin_location IS NULL';
          }
          
          findQuery += ' LIMIT 1';
          
          [lineRows] = await connection.execute(findQuery, findParams);
          
          if (lineRows.length > 0) {
            lineId = lineRows[0].id;
            console.log(`[Cycle Count] ✅ Found line by item_code: ${lineId} (item: ${itemCode})`);
          }
        }
        
        // Strategy 3: If still not found, create the line (for ad-hoc counts)
        if (!lineId) {
          const [insertResult] = await connection.execute(`
            INSERT INTO tabCycleCountLine 
              (parent_title, item_code, bin_location, expected_qty, status)
            VALUES (?, ?, ?, ?, 'Pending')
          `, [title, itemCode, binLocation, expectedQty]);
          
          lineId = insertResult.insertId;
          
          console.log(`[Cycle Count] ✅ Auto-created line for task ${title} (item: ${itemCode}, line_id: ${lineId})`);
          
          // Re-fetch the line
          [lineRows] = await connection.execute(`
            SELECT id, parent_title, expected_qty
            FROM tabCycleCountLine 
            WHERE id = ?
          `, [lineId]);
        }
        
        // Ensure lineId is set before updating
        if (!lineId) {
          errors.push(`Could not find or create line for item ${itemCode} in task ${title}`);
          continue;
        }
        
        // Use discrepancy_reason, reason_code, or notes
        const reason = line.reason_code || line.notes || line.discrepancy_reason || null;
        
        // Check if this is a duplicate update (same line being updated again)
        const [currentLine] = await connection.execute(`
          SELECT actual_qty FROM tabCycleCountLine WHERE id = ?
        `, [lineId]);
        
        if (currentLine.length > 0) {
          const currentQty = currentLine[0].actual_qty;
          if (currentQty !== null && currentQty !== qty) {
            console.log(`[Cycle Count] ⚠️ Updating line ${lineId} from qty ${currentQty} to qty ${qty} (item: ${itemCode})`);
          }
        }
        
        // Update line
        const [updateResult] = await connection.execute(`
          UPDATE tabCycleCountLine 
          SET 
            actual_qty = ?,
            counted_by = ?,
            counted_on = NOW(),
            discrepancy_reason = ?,
            status = 'Counted',
            updated_at = NOW()
          WHERE id = ?
        `, [qty, counted_by || null, reason, lineId]);
        
        // Check if update actually affected a row
        if (updateResult.affectedRows === 0) {
          errors.push(`Update failed: No rows affected for line ${lineId} (item: ${itemCode})`);
          continue;
        }
        
        console.log(`[Cycle Count] ✅ Updated line ${lineId} for task ${title} (item: ${itemCode}, qty: ${qty})`);
        updatedCount++;
      } catch (error) {
        errors.push(`Failed to update line ${lineId}: ${error.message}`);
      }
    }
    
    // Recalculate task statistics
    const [countedRows] = await connection.execute(`
      SELECT 
        COUNT(*) as total_counted,
        SUM(CASE WHEN ABS(COALESCE(discrepancy, 0)) > 0 THEN 1 ELSE 0 END) as with_discrepancy
      FROM tabCycleCountLine 
      WHERE parent_title = ? AND actual_qty IS NOT NULL
    `, [title]);
    
    // Get total items count (in case new lines were auto-created)
    const [totalRows] = await connection.execute(`
      SELECT COUNT(*) as total_items
      FROM tabCycleCountLine 
      WHERE parent_title = ?
    `, [title]);
    
    const counted_items = countedRows[0].total_counted || 0;
    const items_with_discrepancy = countedRows[0].with_discrepancy || 0;
    const total_items = totalRows[0].total_items || 0;
    
    // Update task (including total_items in case new lines were created)
    await connection.execute(`
      UPDATE tabCycleCountTask 
      SET 
        total_items = ?,
        counted_items = ?,
        items_with_discrepancy = ?,
        updated_at = NOW()
      WHERE title = ?
    `, [total_items, counted_items, items_with_discrepancy, title]);
    
    if (errors.length > 0) {
      return res.status(207).json({
        ok: true,
        message: `Updated ${updatedCount} lines with ${errors.length} errors`,
        data: {
          updated_count: updatedCount,
          errors: errors
        }
      });
    }
    
    res.json({
      ok: true,
      message: `Successfully updated ${updatedCount} lines`,
      data: {
        title: title,
        updated_count: updatedCount,
        counted_items: counted_items,
        items_with_discrepancy: items_with_discrepancy
      }
    });
    
  } catch (error) {
    console.error('Failed to update Cycle Count Lines:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to update Cycle Count Lines',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/submit
 * Submit a Cycle Count Task (change status to "Review" if there are discrepancies, or "Completed" if none)
 */
export const submitCycleCount = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    // Check if task exists
    const [taskRows] = await connection.execute(`
      SELECT status, total_items, counted_items, items_with_discrepancy
      FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (taskRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const task = taskRows[0];
    
    if (task.status !== 'In Progress') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot submit Cycle Count Task. Current status: ${task.status}`
        }
      });
    }
    
    // Check if all items are counted
    if (parseInt(task.counted_items) < parseInt(task.total_items)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'INCOMPLETE_COUNT',
          message: `Not all items have been counted. Counted: ${task.counted_items}/${task.total_items}`
        }
      });
    }
    
    // Determine new status based on discrepancies
    const newStatus = parseInt(task.items_with_discrepancy) > 0 ? 'Review' : 'Completed';
    
    // Update status
    await connection.execute(`
      UPDATE tabCycleCountTask 
      SET status = ?, updated_at = NOW()
      WHERE title = ?
    `, [newStatus, title]);
    
    res.json({
      ok: true,
      message: `Cycle Count Task submitted successfully. Status: ${newStatus}`,
      data: {
        title: title,
        status: newStatus,
        items_with_discrepancy: parseInt(task.items_with_discrepancy)
      }
    });
    
  } catch (error) {
    console.error('Failed to submit Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to submit Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/cycle-count/:title/complete
 * Complete a Cycle Count Task (change status to "Completed")
 * This should be called after stock adjustments are made
 */
export const completeCycleCount = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    // Check if task exists
    const [taskRows] = await connection.execute(`
      SELECT status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (taskRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const currentStatus = taskRows[0].status;
    
    if (currentStatus === 'Completed') {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'ALREADY_COMPLETED',
          message: 'Cycle Count Task is already completed'
        }
      });
    }
    
    // Update status to "Completed"
    await connection.execute(`
      UPDATE tabCycleCountTask 
      SET status = 'Completed', updated_at = NOW()
      WHERE title = ?
    `, [title]);
    
    // Unfreeze stock if it was frozen
    await connection.execute(`
      UPDATE tabCycleCountTask 
      SET freeze_stock = FALSE
      WHERE title = ? AND freeze_stock = TRUE
    `, [title]);
    
    res.json({
      ok: true,
      message: 'Cycle Count Task completed successfully',
      data: {
        title: title,
        status: 'Completed'
      }
    });
    
  } catch (error) {
    console.error('Failed to complete Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to complete Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * DELETE /api/cycle-count/:title
 * Delete a Cycle Count Task and all its lines
 * This should only be allowed for Draft tasks or tasks that haven't been started
 */
export const deleteCycleCount = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { title } = req.params;
    
    // Check if task exists
    const [taskRows] = await connection.execute(`
      SELECT title, status FROM tabCycleCountTask WHERE title = ?
    `, [title]);
    
    if (taskRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: `Cycle Count Task ${title} not found`
        }
      });
    }
    
    const task = taskRows[0];
    const currentStatus = task.status;
    
    // Optional: Prevent deletion of tasks that are in progress or completed
    // Uncomment if you want to restrict deletion to Draft tasks only
    // if (currentStatus !== 'Draft') {
    //   return res.status(400).json({
    //     ok: false,
    //     error: {
    //       code: 'INVALID_STATUS',
    //       message: `Cannot delete Cycle Count Task. Current status: ${currentStatus}. Only Draft tasks can be deleted.`
    //     }
    //   });
    // }
    
    // Start transaction
    await connection.beginTransaction();
    
    try {
      // Delete all lines first (foreign key constraint)
      const [deleteLinesResult] = await connection.execute(`
        DELETE FROM tabCycleCountLine WHERE parent_title = ?
      `, [title]);
      
      const deletedLinesCount = deleteLinesResult.affectedRows;
      
      // Delete the task
      const [deleteTaskResult] = await connection.execute(`
        DELETE FROM tabCycleCountTask WHERE title = ?
      `, [title]);
      
      if (deleteTaskResult.affectedRows === 0) {
        // This shouldn't happen since we checked above, but handle it anyway
        await connection.rollback();
        return res.status(500).json({
          ok: false,
          error: {
            code: 'DELETE_FAILED',
            message: 'Failed to delete Cycle Count Task'
          }
        });
      }
      
      // Commit transaction
      await connection.commit();
      
      console.log(`[Cycle Count] ✅ Deleted task ${title} with ${deletedLinesCount} lines`);
      
      res.json({
        ok: true,
        message: 'Cycle Count Task deleted successfully',
        data: {
          title: title,
          deleted_lines: deletedLinesCount
        }
      });
      
    } catch (deleteError) {
      // Rollback transaction on error
      await connection.rollback();
      throw deleteError;
    }
    
  } catch (error) {
    console.error('Failed to delete Cycle Count Task:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to delete Cycle Count Task',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
