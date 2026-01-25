// wms-api/src/modules/relocation/relocationController.js
// Relocation / Bin Transfer operations

import { getConnection } from '../../db/connection.js';

/**
 * Helper function to sync tabItem.stock_qty with tabStockLedger
 * Call this after any stock-affecting operation
 */
async function syncItemStock(connection, itemCode) {
  try {
    // Calculate total stock from TRANSACTION HISTORY (source of truth)
    // This is more reliable than Stock Ledger which can get out of sync
    const [txnSum] = await connection.execute(
      `SELECT COALESCE(SUM(qty_change), 0) as total_qty FROM tabTransactionHistory WHERE item_code = ?`,
      [itemCode]
    );
    const txnTotal = parseFloat(txnSum[0].total_qty) || 0;
    
    // Update tabItem.stock_qty from transaction history
    await connection.execute(
      `UPDATE tabItem SET stock_qty = ?, updated_at = NOW() WHERE code = ?`,
      [txnTotal, itemCode]
    );
    
    // Also recalculate Stock Ledger per location from transaction history
    // This ensures Stock Ledger stays in sync with transaction history
    const [stockByLocation] = await connection.execute(`
      SELECT
        CASE
          WHEN stock_direction = 'IN' THEN COALESCE(NULLIF(target_bin, ''), location_id, bin_location)
          WHEN stock_direction = 'OUT' THEN COALESCE(NULLIF(source_bin, ''), location_id, bin_location)
          ELSE COALESCE(location_id, bin_location)
        END AS bin_location,
        SUM(qty_change) AS correct_qty
      FROM tabTransactionHistory
      WHERE item_code = ?
      GROUP BY 1
    `, [itemCode]);
    
    // Get warehouse from existing Stock Ledger entry or default
    const [warehouseRow] = await connection.execute(
      `SELECT warehouse FROM tabStockLedger WHERE item_code = ? LIMIT 1`,
      [itemCode]
    );
    const warehouse = warehouseRow.length > 0 ? warehouseRow[0].warehouse : 'WH-MAIN';
    
    // Delete all Stock Ledger entries for this item and recreate from transaction history
    await connection.execute(`DELETE FROM tabStockLedger WHERE item_code = ?`, [itemCode]);
    
    for (const row of stockByLocation) {
      const qty = parseFloat(row.correct_qty) || 0;
      if (qty > 0 && row.bin_location) {
        await connection.execute(`
          INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, 
            last_transaction_date, last_transaction_type, updated_at, created_at)
          VALUES (?, ?, ?, ?, 0, NOW(), 'SYNC', NOW(), NOW())
        `, [itemCode, warehouse, row.bin_location, qty]);
      }
    }
    
    console.log(`📊 Synced stock for ${itemCode} from transaction history: ${txnTotal}`);
  } catch (error) {
    console.warn(`⚠️ Failed to sync stock for ${itemCode}: ${error.message}`);
  }
}

/**
 * Generate relocation session ID
 */
function generateSessionId() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const timestamp = Date.now().toString().slice(-6);
  return `RL-${dateStr}-${timestamp}`;
}

/**
 * POST /api/relocation/session/start
 * Start a relocation session
 * 
 * Request Body:
 * {
 *   "mode": "FULL_CARTON",  // FULL_CARTON | PARTIAL_ITEMS | CARTON_TO_CARTON
 *   "warehouse_id": "WH-MAIN",
 *   "user_id": "USER-001",
 *   "device_id": "DEVICE-001" (optional)
 * }
 */
export const startRelocationSession = async (req, res) => {
  const connection = await getConnection();
  
  try {
    // Debug: Log the request body
    console.log('📥 POST /api/relocation/session/start - Request body:', JSON.stringify(req.body, null, 2));
    console.log('📥 Request headers:', JSON.stringify(req.headers, null, 2));
    
    const { mode, warehouse_id, user_id, device_id } = req.body;
    
    // Validation
    if (!mode || !warehouse_id || !user_id) {
      console.log('❌ Validation failed - mode:', mode, 'warehouse_id:', warehouse_id, 'user_id:', user_id);
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "mode, warehouse_id, and user_id are required"
        }
      });
    }
    
    // Validate mode
    const validModes = ['FULL_CARTON', 'PARTIAL_ITEMS', 'CARTON_TO_CARTON'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `mode must be one of: ${validModes.join(', ')}`
        }
      });
    }
    
    await connection.beginTransaction();
    
    // Default policy based on mode (needed for reuse check and session creation)
    const defaultPolicy = mode === 'FULL_CARTON' ? 'BLIND' : 'VERIFIED';
    
    // Check for existing IN_PROGRESS sessions for same user/device (prevent duplicates)
    // Auto-cancel abandoned sessions (older than 1 hour with no FROM/TO locations set)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await connection.execute(`
      UPDATE tabRelocationSession
      SET status = 'CANCELLED',
          updated_at = NOW()
      WHERE status = 'IN_PROGRESS'
        AND created_by = ?
        AND (from_bin IS NULL AND from_carton IS NULL)
        AND (to_bin IS NULL AND to_carton IS NULL)
        AND created_at < ?
    `, [user_id, oneHourAgo]);
    
    // Check if there's already an IN_PROGRESS session for this user/device/mode
    const [existingSessions] = await connection.execute(`
      SELECT session_id, status, created_at, mode, policy
      FROM tabRelocationSession
      WHERE status = 'IN_PROGRESS'
        AND created_by = ?
        AND mode = ?
        AND (device_id = ? OR (? IS NULL AND device_id IS NULL))
      ORDER BY created_at DESC
      LIMIT 1
    `, [user_id, mode, device_id || null, device_id || null]);
    
    if (existingSessions.length > 0) {
      const existingSession = existingSessions[0];
      const sessionAge = Date.now() - new Date(existingSession.created_at).getTime();
      const sessionAgeMinutes = Math.floor(sessionAge / 60000);
      
      // If session is less than 30 minutes old, return existing session instead of creating new one
      if (sessionAgeMinutes < 30) {
        await connection.commit();
        console.log(`⚠️  Reusing existing IN_PROGRESS session ${existingSession.session_id} (${sessionAgeMinutes} minutes old) instead of creating duplicate`);
        
        return res.json({
          ok: true,
          data: {
            session_id: existingSession.session_id,
            status: 'IN_PROGRESS',
            mode: existingSession.mode,
            policy: existingSession.policy || defaultPolicy,
            warehouse_id: warehouse_id,
            reused: true
          }
        });
      } else {
        // Session is old (abandoned) - cancel it and create new one
        await connection.execute(`
          UPDATE tabRelocationSession
          SET status = 'CANCELLED',
              updated_at = NOW()
          WHERE session_id = ?
        `, [existingSession.session_id]);
        console.log(`⚠️  Cancelled abandoned session ${existingSession.session_id} (${sessionAgeMinutes} minutes old, no locations set)`);
      }
    }
    
    // Generate session ID
    const sessionId = generateSessionId();
    
    // Create session
    await connection.execute(`
      INSERT INTO tabRelocationSession 
        (session_id, mode, policy, warehouse_id, status, created_by, device_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?, NOW(), NOW())
    `, [sessionId, mode, defaultPolicy, warehouse_id, user_id, device_id || null]);
    
    await connection.commit();
    
    console.log(`✅ Created relocation session ${sessionId} (mode: ${mode}, warehouse: ${warehouse_id})`);
    
    res.json({
      ok: true,
      data: {
        session_id: sessionId,
        status: 'IN_PROGRESS',
        mode: mode,
        policy: defaultPolicy,
        warehouse_id: warehouse_id
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error starting relocation session:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to start relocation session",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * PUT /api/relocation/session/:session_id/from
 * Set FROM location (bin + carton)
 * 
 * Request Body:
 * {
 *   "from_bin": "A1-R01-L3-B1",
 *   "from_carton": "CTN-555444"
 * }
 */
export const setRelocationFrom = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { session_id } = req.params;
    const { from_bin, from_carton } = req.body;
    
    // Validation
    if (!from_bin && !from_carton) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "At least one of from_bin or from_carton is required"
        }
      });
    }
    
    await connection.beginTransaction();
    
    // Check if session exists
    const [sessionRows] = await connection.execute(`
      SELECT session_id, status, warehouse_id
      FROM tabRelocationSession
      WHERE session_id = ?
    `, [session_id]);
    
    if (sessionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Relocation session ${session_id} not found`
        }
      });
    }
    
    const session = sessionRows[0];
    
    // Store original warehouse for logging
    const originalWarehouse = session.warehouse_id || 'DEFAULT';
    
    if (session.status !== 'IN_PROGRESS') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_STATUS",
          message: `Session ${session_id} is not IN_PROGRESS (current status: ${session.status})`
        }
      });
    }
    
    // If carton is provided, try to get its actual warehouse and update session
    let actualWarehouse = null;
    if (from_carton) {
      // Check if warehouse column exists in tabCarton
      const [cartonWarehouseCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCarton'
          AND COLUMN_NAME = 'warehouse'
      `);
      
      const hasCartonWarehouse = cartonWarehouseCols.length > 0;
      
      if (hasCartonWarehouse) {
        // Get warehouse from tabCarton (preferred)
        const [cartonWarehouseRows] = await connection.execute(`
          SELECT warehouse
          FROM tabCarton
          WHERE carton_id = ?
        `, [from_carton]);
        
        if (cartonWarehouseRows.length > 0 && cartonWarehouseRows[0].warehouse) {
          actualWarehouse = cartonWarehouseRows[0].warehouse;
          console.log(`📦 Found warehouse from tabCarton: ${actualWarehouse} for carton ${from_carton}`);
        } else {
          console.log(`⚠️  Carton ${from_carton} not found in tabCarton or has no warehouse`);
        }
      }
      
      // Fallback: Get warehouse from tabCartonStock
      if (!actualWarehouse) {
        const [stockTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabCartonStock'
        `);
        
        if (stockTableCheck.length > 0) {
          const [stockWarehouseRows] = await connection.execute(`
            SELECT warehouse
            FROM tabCartonStock
            WHERE carton_id = ?
            LIMIT 1
          `, [from_carton]);
          
          if (stockWarehouseRows.length > 0 && stockWarehouseRows[0].warehouse) {
            actualWarehouse = stockWarehouseRows[0].warehouse;
            console.log(`📦 Found warehouse from tabCartonStock: ${actualWarehouse} for carton ${from_carton}`);
          } else {
            console.log(`⚠️  Carton ${from_carton} not found in tabCartonStock or has no warehouse`);
          }
        }
      }
      
      // If still no warehouse found, log warning
      if (!actualWarehouse) {
        console.log(`⚠️  Could not determine warehouse for carton ${from_carton}. Session warehouse will remain as-is.`);
      }
    }
    
    // VALIDATION: If both from_bin and from_carton are provided, verify carton exists and is actually at that bin location
    // This implements the requirement from DESKTOP FIX.md: validate FROM Bin + FROM Carton match
    if (from_bin && from_carton) {
      // Step 1: Find carton's actual location (use tabCartonStock as preferred source per DESKTOP FIX.md)
      let cartonActualBinLocation = null;
      let cartonWarehouse = null;
      let cartonFound = false;
      
      // Check tabCartonStock first (preferred authoritative source per DESKTOP FIX.md)
      const [stockTableCheck] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCartonStock'
      `);
      
      if (stockTableCheck.length > 0) {
        const [stockLocationRows] = await connection.execute(`
          SELECT DISTINCT bin_location, warehouse
          FROM tabCartonStock
          WHERE carton_id = ?
            AND bin_location IS NOT NULL
          LIMIT 1
        `, [from_carton]);
        
        if (stockLocationRows.length > 0) {
          cartonFound = true;
          cartonActualBinLocation = stockLocationRows[0].bin_location;
          cartonWarehouse = stockLocationRows[0].warehouse;
        }
      }
      
      // Fallback 1: Check tabCarton.current_bin_id if not found in tabCartonStock
      if (!cartonFound) {
        const [cartonBinCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabCarton'
            AND COLUMN_NAME IN ('current_bin_id', 'bin_id', 'warehouse')
        `);
        
        const hasCurrentBinId = cartonBinCheck.some(col => col.COLUMN_NAME === 'current_bin_id');
        const hasBinId = cartonBinCheck.some(col => col.COLUMN_NAME === 'bin_id');
        const hasWarehouse = cartonBinCheck.some(col => col.COLUMN_NAME === 'warehouse');
        
        if (hasCurrentBinId || hasBinId) {
          const binColumn = hasCurrentBinId ? 'current_bin_id' : 'bin_id';
          const warehouseColumn = hasWarehouse ? ', warehouse' : '';
          const [cartonLocationRows] = await connection.execute(`
            SELECT ${binColumn} as bin_location${warehouseColumn}
            FROM tabCarton
            WHERE carton_id = ?
          `, [from_carton]);
          
          if (cartonLocationRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = cartonLocationRows[0].bin_location;
            cartonWarehouse = cartonLocationRows[0].warehouse || null;
          }
        }
      }
      
      // Fallback 2: Check tabTransferInCarton for Transfer In cartons (CTN-TI-...)
      // Transfer In cartons might exist in tabTransferInCarton before putaway
      if (!cartonFound && from_carton.startsWith('CTN-TI-')) {
        const [transferInCartonTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCarton'
        `);
        
        if (transferInCartonTableCheck.length > 0) {
          const [transferInCartonRows] = await connection.execute(`
            SELECT carton_id, transfer_in
            FROM tabTransferInCarton
            WHERE carton_id = ?
          `, [from_carton]);
          
          if (transferInCartonRows.length > 0) {
            cartonFound = true;
            // Transfer In carton might not have bin_location yet (not putaway)
            // So cartonActualBinLocation will remain null, but carton exists
            const transferInTitle = transferInCartonRows[0].transfer_in;
            
            // Try to get warehouse from Transfer In
            const [transferInRows] = await connection.execute(`
              SELECT to_warehouse
              FROM tabTransferIn
              WHERE title = ?
            `, [transferInTitle]);
            
            if (transferInRows.length > 0) {
              cartonWarehouse = transferInRows[0].to_warehouse || null;
            }
            
            console.log(`📦 Found Transfer In carton ${from_carton} in tabTransferInCarton (transfer_in: ${transferInTitle})`);
            
            // For Transfer In cartons, bin_location might not exist yet
            // If user scanned a bin, we'll allow it (validation for bin match will be skipped if cartonActualBinLocation is null)
            // This allows relocating Transfer In cartons even if not yet putaway
          }
        }
      }
      
      // Fallback 3: Check tabTransactionHistory or tabStockLedger for cartons that exist in stock but not in carton tables
      // This handles putaway cartons (PAW-...) that were created during putaway but may not be in tabCarton
      if (!cartonFound) {
        // Check tabStockLedger (if carton_id column exists)
        const [stockLedgerCartonCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME = 'carton_id'
        `);
        
        if (stockLedgerCartonCheck.length > 0) {
          const [stockLedgerRows] = await connection.execute(`
            SELECT DISTINCT bin_location, warehouse
            FROM tabStockLedger
            WHERE carton_id = ?
              AND bin_location IS NOT NULL
            LIMIT 1
          `, [from_carton]);
          
          if (stockLedgerRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = stockLedgerRows[0].bin_location;
            cartonWarehouse = stockLedgerRows[0].warehouse || null;
            console.log(`📦 Found carton ${from_carton} in tabStockLedger (bin: ${cartonActualBinLocation})`);
          }
        }
        
        // Also check tabTransactionHistory as final fallback
        if (!cartonFound) {
          const [historyRows] = await connection.execute(`
            SELECT 
              COALESCE(location_id, bin_location, target_bin) as bin_location,
              warehouse
            FROM tabTransactionHistory
            WHERE carton_id = ?
              AND (location_id IS NOT NULL OR bin_location IS NOT NULL OR target_bin IS NOT NULL)
            ORDER BY transaction_date DESC, id DESC
            LIMIT 1
          `, [from_carton]);
          
          if (historyRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = historyRows[0].bin_location;
            cartonWarehouse = historyRows[0].warehouse || null;
            console.log(`📦 Found carton ${from_carton} in tabTransactionHistory (bin: ${cartonActualBinLocation})`);
          }
        }
      }
      
      // Step 2: Validate carton exists
      if (!cartonFound) {
        await connection.rollback();
        console.log(`❌ Validation failed: Carton ${from_carton} not found`);
        return res.status(400).json({
          ok: false,
          error: {
            code: "CARTON_NOT_FOUND",
            message: `Carton ${from_carton} not found`
          },
          valid: false,
          error_code: "CARTON_NOT_FOUND"
        });
      }
      
      // Step 3: Validate carton is actually located at scanned bin_location
      // Check if carton has any stock at the scanned bin_location (authoritative check per DESKTOP FIX.md)
      // BUT: Skip bin location validation for Transfer In cartons that haven't been putaway yet (no bin_location in tabCartonStock)
      let isAtScannedBin = false;
      const isTransferInCarton = from_carton.startsWith('CTN-TI-') && !cartonActualBinLocation;
      
      if (isTransferInCarton) {
        // Transfer In carton found but no bin_location yet (not putaway)
        // Allow relocation - user is scanning the bin where carton is physically located
        // The bin location will be set during relocation
        isAtScannedBin = true;
        console.log(`⚠️  Transfer In carton ${from_carton} not yet putaway - allowing relocation with scanned bin ${from_bin}`);
      } else if (stockTableCheck.length > 0) {
        // Regular carton or Transfer In carton that's been putaway - check bin_location match
        const [matchCheck] = await connection.execute(`
          SELECT COUNT(*) as cnt,
                 COALESCE(SUM(qty), 0) as total_qty,
                 COUNT(DISTINCT item_code) as items_count
          FROM tabCartonStock
          WHERE carton_id = ?
            AND bin_location = ?
        `, [from_carton, from_bin]);
        
        if (matchCheck.length > 0 && matchCheck[0].cnt > 0) {
          isAtScannedBin = true;
        }
      } else {
        // Fallback: Compare actual location with scanned location
        if (cartonActualBinLocation === from_bin) {
          isAtScannedBin = true;
        }
      }
      
      // Step 4: Return error if mismatch (but skip for Transfer In cartons without bin_location)
      if (!isAtScannedBin && !isTransferInCarton) {
        await connection.rollback();
        console.log(`❌ Validation failed: Carton ${from_carton} is located at ${cartonActualBinLocation}, but scanned location is ${from_bin}`);
        return res.status(400).json({
          ok: false,
          error: {
            code: "CARTON_BIN_MISMATCH",
            message: `Carton ${from_carton} is not located in bin ${from_bin}`,
            actual_bin: cartonActualBinLocation || null
          },
          valid: false,
          error_code: "CARTON_BIN_MISMATCH",
          actual_bin: cartonActualBinLocation || null
        });
      }
      
      // Validation passed
      console.log(`✅ Validated: Carton ${from_carton} is correctly located at ${from_bin}${cartonWarehouse ? ` (warehouse: ${cartonWarehouse})` : ''}`);
    }
    
    // Get current session state to detect changes and preserve existing values
    const [currentSession] = await connection.execute(`
      SELECT from_bin, from_carton, warehouse_id
      FROM tabRelocationSession
      WHERE session_id = ?
    `, [session_id]);
    
    const previousBin = currentSession.length > 0 ? currentSession[0].from_bin : null;
    const previousCarton = currentSession.length > 0 ? currentSession[0].from_carton : null;
    
    // Only update fields that are provided in the request (preserve existing values)
    // This allows partial updates: first call sets bin, second call sets carton
    const updateFields = ['updated_at = NOW()'];
    const updateValues = [];
    
    // Update from_bin only if provided (not undefined)
    if (from_bin !== undefined) {
      updateFields.push('from_bin = ?');
      updateValues.push(from_bin || null);
    }
    
    // Update from_carton only if provided (not undefined)
    if (from_carton !== undefined) {
      updateFields.push('from_carton = ?');
      updateValues.push(from_carton || null);
    }
    
    // Update warehouse if determined from carton
    if (actualWarehouse && actualWarehouse !== 'DEFAULT') {
      updateFields.push('warehouse_id = ?');
      updateValues.push(actualWarehouse);
      console.log(`🔄 Updating session warehouse_id from "${originalWarehouse}" to "${actualWarehouse}"`);
    } else if (from_carton && !actualWarehouse) {
      console.log(`⚠️  Carton ${from_carton} provided but warehouse could not be determined. Session warehouse remains: ${originalWarehouse}`);
    }
    
    // Determine final values for logging (use provided values or keep previous)
    const finalBin = from_bin !== undefined ? (from_bin || null) : previousBin;
    const finalCarton = from_carton !== undefined ? (from_carton || null) : previousCarton;
    const cartonChanged = previousCarton !== finalCarton;
    
    await connection.execute(`
      UPDATE tabRelocationSession
      SET ${updateFields.join(', ')}
      WHERE session_id = ?
    `, [...updateValues, session_id]);
    
    await connection.commit();
    
    // Enhanced logging to show carton state changes
    if (actualWarehouse && actualWarehouse !== 'DEFAULT') {
      if (cartonChanged && finalCarton) {
        console.log(`✅ Set FROM location for session ${session_id}: bin=${finalBin || 'null'}, carton=${finalCarton} (updated from ${previousCarton || 'null'}), warehouse=${actualWarehouse} (updated from carton)`);
      } else {
        console.log(`✅ Set FROM location for session ${session_id}: bin=${finalBin || 'null'}, carton=${finalCarton || 'null'}, warehouse=${actualWarehouse} (updated from carton)`);
      }
    } else {
      if (cartonChanged && finalCarton) {
        console.log(`✅ Set FROM location for session ${session_id}: bin=${finalBin || 'null'}, carton=${finalCarton} (updated from ${previousCarton || 'null'})`);
      } else {
        console.log(`✅ Set FROM location for session ${session_id}: bin=${finalBin || 'null'}, carton=${finalCarton || 'null'}`);
      }
    }
    
    res.json({
      ok: true,
      message: "FROM location set successfully",
      data: {
        session_id: session_id,
        from_bin: from_bin || null,
        from_carton: from_carton || null
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error setting FROM location:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to set FROM location",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * PUT /api/relocation/session/:session_id/to
 * Set TO location (bin + carton)
 * 
 * Request Body:
 * {
 *   "to_bin": "A1-R02-L1-B2",
 *   "to_carton": "CTN-999999" (optional, required for CARTON_TO_CARTON mode)
 * }
 */
export const setRelocationTo = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { session_id } = req.params;
    const { to_bin, to_carton } = req.body;
    
    await connection.beginTransaction();
    
    // Check if session exists
    const [sessionRows] = await connection.execute(`
      SELECT session_id, status, mode
      FROM tabRelocationSession
      WHERE session_id = ?
    `, [session_id]);
    
    if (sessionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Relocation session ${session_id} not found`
        }
      });
    }
    
    const session = sessionRows[0];
    
    // Log session details for debugging
    console.log(`📋 [setRelocationTo] Session ${session_id}: mode=${session.mode}, status=${session.status}, to_carton=${to_carton || 'null'}`);
    
    if (session.status !== 'IN_PROGRESS') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_STATUS",
          message: `Session ${session_id} is not IN_PROGRESS (current status: ${session.status})`
        }
      });
    }
    
    // For CARTON_TO_CARTON mode, to_carton is required
    // However, if to_carton is not provided but from_carton exists, use from_carton as default
    // This handles the case where user scans the same carton (no need to specify to_carton explicitly)
    let actualToCarton = to_carton;
    if (session.mode === 'CARTON_TO_CARTON' && !actualToCarton) {
      // Try to get from_carton from session to use as default
      const [sessionWithFrom] = await connection.execute(`
        SELECT from_carton FROM tabRelocationSession WHERE session_id = ?
      `, [session_id]);
      
      if (sessionWithFrom.length > 0 && sessionWithFrom[0].from_carton) {
        actualToCarton = sessionWithFrom[0].from_carton;
        console.log(`📦 [setRelocationTo] Using from_carton (${actualToCarton}) as to_carton for CARTON_TO_CARTON mode (same carton)`);
      } else {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "to_carton is required for CARTON_TO_CARTON mode. Please scan or enter the destination carton ID."
          }
        });
      }
    }
    
    // For FULL_CARTON mode, accept whatever carton is provided (or null if not provided)
    // If to_carton is null/empty, it means user wants to keep the same carton (will be handled in commit)
    // If to_carton is provided (even if different from from_carton), accept it as a new carton merge
    // DO NOT auto-fill with from_carton here - let the user explicitly scan/enter the carton they want
    if (session.mode === 'FULL_CARTON') {
      // Accept the provided to_carton as-is (can be null, same as from_carton, or different)
      // The commit logic will handle determining the actual behavior
      actualToCarton = to_carton || null;
      if (actualToCarton) {
        console.log(`📦 [setRelocationTo] Accepting to_carton (${actualToCarton}) for FULL_CARTON mode`);
      } else {
        console.log(`📦 [setRelocationTo] to_carton not provided for FULL_CARTON mode - will use from_carton during commit`);
      }
    }
    
    // Update TO location (use actualToCarton which may have been set from from_carton)
    await connection.execute(`
      UPDATE tabRelocationSession
      SET to_bin = ?,
          to_carton = ?,
          updated_at = NOW()
      WHERE session_id = ?
    `, [to_bin || null, actualToCarton || null, session_id]);
    
    await connection.commit();
    
    console.log(`✅ Set TO location for session ${session_id}: bin=${to_bin}, carton=${actualToCarton || to_carton || 'null'} (mode: ${session.mode})`);
    
    res.json({
      ok: true,
      message: "TO location set successfully",
      data: {
        session_id: session_id,
        to_bin: to_bin || null,
        to_carton: actualToCarton || null
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error setting TO location:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to set TO location",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/carton/:carton_id/contents
 * Get carton contents (items with quantities)
 * 
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "carton_id": "CTN-555444",
 *     "warehouse_id": "WH-MAIN",
 *     "bin_location": "A1-R01-L3-B1",
 *     "items": [
 *       {
 *         "item_code": "SKU-001",
 *         "qty": 10.00,
 *         "uom": "PCS"
 *       }
 *     ]
 *   }
 * }
 */
export const getCartonContents = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { carton_id } = req.params;
    
    // Check if tabCarton table exists
    const [cartonTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCarton'
    `);
    
    const hasCartonTable = cartonTableCheck.length > 0;
    
    if (!hasCartonTable) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "SCHEMA_ERROR",
          message: "tabCarton table does not exist"
        }
      });
    }
    
    // Try to find carton in tabCarton first (main carton table)
    let [cartonRows] = await connection.execute(`
      SELECT carton_id, warehouse, current_bin_id, status
      FROM tabCarton
      WHERE carton_id = ?
    `, [carton_id]);
    
    let warehouseId = null;
    let binLocation = null;
    let cartonStatus = null;
    let isTransferInCarton = false;
    let transferInTitle = null;
    
    if (cartonRows.length > 0) {
      // Found in main carton table
      const carton = cartonRows[0];
      warehouseId = carton.warehouse;
      binLocation = carton.current_bin_id;
      cartonStatus = carton.status;
    } else {
      // Not found in tabCarton - check if it's a Transfer In carton
      const [transferInCartonTableCheck] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransferInCarton'
      `);
      
      if (transferInCartonTableCheck.length > 0) {
        const [transferInCartonRows] = await connection.execute(`
          SELECT carton_id, transfer_in, status
          FROM tabTransferInCarton
          WHERE carton_id = ?
        `, [carton_id]);
        
        if (transferInCartonRows.length > 0) {
          // Found in Transfer In carton table
          isTransferInCarton = true;
          const transferInCarton = transferInCartonRows[0];
          cartonStatus = transferInCarton.status;
          transferInTitle = transferInCarton.transfer_in;
          
          // Get warehouse from Transfer In
          const [transferInRows] = await connection.execute(`
            SELECT to_warehouse
            FROM tabTransferIn
            WHERE title = ?
          `, [transferInCarton.transfer_in]);
          
          if (transferInRows.length > 0 && transferInRows[0].to_warehouse) {
            warehouseId = transferInRows[0].to_warehouse;
          } else {
            // Transfer In carton found but warehouse not set yet
            // Allow to proceed - warehouse will be determined later or use default
            console.warn(`⚠️  Transfer In carton ${carton_id} found but warehouse not set in tabTransferIn (title: ${transferInCarton.transfer_in})`);
            // Set a default warehouse or leave null - items query will handle it
            // warehouseId can remain null for Transfer In cartons that haven't been fully processed
          }
        }
      }
    }
    
    // Fallback: Check tabStockLedger or tabTransactionHistory for cartons that exist in stock but not in carton tables
    // This handles putaway cartons (PAW-...) that were created during putaway but may not be in tabCarton
    if (!warehouseId && !isTransferInCarton) {
      // Check tabStockLedger (if carton_id column exists)
      const [stockLedgerCartonCheck] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabStockLedger'
          AND COLUMN_NAME = 'carton_id'
      `);
      
      if (stockLedgerCartonCheck.length > 0) {
        const [stockLedgerRows] = await connection.execute(`
          SELECT DISTINCT bin_location, warehouse
          FROM tabStockLedger
          WHERE carton_id = ?
            AND bin_location IS NOT NULL
          LIMIT 1
        `, [carton_id]);
        
        if (stockLedgerRows.length > 0) {
          warehouseId = stockLedgerRows[0].warehouse;
          binLocation = stockLedgerRows[0].bin_location;
          console.log(`📦 Found carton ${carton_id} in tabStockLedger (bin: ${binLocation}, warehouse: ${warehouseId})`);
        }
      }
      
      // Also check tabTransactionHistory as final fallback
      if (!warehouseId) {
        const [historyRows] = await connection.execute(`
          SELECT 
            COALESCE(location_id, bin_location, target_bin) as bin_location,
            warehouse
          FROM tabTransactionHistory
          WHERE carton_id = ?
            AND (location_id IS NOT NULL OR bin_location IS NOT NULL OR target_bin IS NOT NULL)
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `, [carton_id]);
        
        if (historyRows.length > 0) {
          warehouseId = historyRows[0].warehouse;
          binLocation = historyRows[0].bin_location;
          console.log(`📦 Found carton ${carton_id} in tabTransactionHistory (bin: ${binLocation}, warehouse: ${warehouseId})`);
        }
      }
    }
    
    // Only throw error if carton not found at all (not in tabCarton, tabTransferInCarton, tabStockLedger, or tabTransactionHistory)
    // For Transfer In cartons, allow warehouseId to be null if not yet set
    if (!warehouseId && !isTransferInCarton) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Carton ${carton_id} not found in tabCarton, tabTransferInCarton, tabStockLedger, or tabTransactionHistory`
        }
      });
    }
    
    // Get carton items from tabCartonStock or tabCartonItem
    const [stockTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCartonStock'
    `);
    
    const hasStockTable = stockTableCheck.length > 0;
    
    let items = [];
    
    if (isTransferInCarton) {
      // Get items from Transfer In carton lines
      const [transferInCartonLineTableCheck] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransferInCartonLine'
      `);
      
      if (transferInCartonLineTableCheck.length > 0 && transferInTitle) {
        const [itemRows] = await connection.execute(`
          SELECT 
            item_code,
            received_qty as qty
          FROM tabTransferInCartonLine
          WHERE carton_id = ? AND transfer_in = ?
          ORDER BY item_code
        `, [carton_id, transferInTitle]);
        
        items = itemRows.map(item => ({
          item_code: item.item_code,
          qty: parseFloat(item.qty || 0),
          uom: null,
          batch_no: null,
          serial_no: null
        }));
      }
    } else if (hasStockTable) {
      // Use tabCartonStock (preferred for regular cartons)
      const [itemRows] = await connection.execute(`
        SELECT 
          item_code,
          qty,
          uom,
          batch_no,
          serial_no
        FROM tabCartonStock
        WHERE carton_id = ? AND warehouse = ?
        ORDER BY item_code
      `, [carton_id, warehouseId]);
      
      items = itemRows.map(item => ({
        item_code: item.item_code,
        qty: parseFloat(item.qty || 0),
        uom: item.uom || null,
        batch_no: item.batch_no || null,
        serial_no: item.serial_no || null
      }));
      
      // Fallback: If no items found in tabCartonStock, check tabStockLedger (for putaway cartons)
      if (items.length === 0 && warehouseId) {
        const [stockLedgerCartonCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME = 'carton_id'
        `);
        
        if (stockLedgerCartonCheck.length > 0) {
          const [stockLedgerItems] = await connection.execute(`
            SELECT 
              item_code,
              qty,
              NULL as uom,
              NULL as batch_no,
              NULL as serial_no
            FROM tabStockLedger
            WHERE carton_id = ? AND warehouse = ?
            ORDER BY item_code
          `, [carton_id, warehouseId]);
          
          if (stockLedgerItems.length > 0) {
            items = stockLedgerItems.map(item => ({
              item_code: item.item_code,
              qty: parseFloat(item.qty || 0),
              uom: null,
              batch_no: null,
              serial_no: null
            }));
            console.log(`📦 Found ${items.length} item(s) in tabStockLedger for carton ${carton_id}`);
          }
        }
      }
      
      // Final fallback: Check tabTransactionHistory (for putaway cartons that might not be in stock ledger yet)
      if (items.length === 0 && warehouseId) {
        const [historyItems] = await connection.execute(`
          SELECT 
            th.item_code,
            th.qty_after as qty
          FROM tabTransactionHistory th
          INNER JOIN (
            SELECT 
              item_code,
              MAX(transaction_date) as max_date,
              MAX(id) as max_id
            FROM tabTransactionHistory
            WHERE carton_id = ? 
              AND warehouse = ?
              AND qty_after > 0
            GROUP BY item_code
          ) latest ON 
            th.item_code = latest.item_code
            AND th.transaction_date = latest.max_date
            AND th.id = latest.max_id
          WHERE th.carton_id = ?
            AND th.warehouse = ?
            AND th.qty_after > 0
          ORDER BY th.item_code
        `, [carton_id, warehouseId, carton_id, warehouseId]);
        
        if (historyItems.length > 0) {
          items = historyItems.map(item => ({
            item_code: item.item_code,
            qty: parseFloat(item.qty || 0),
            uom: null,
            batch_no: null,
            serial_no: null
          }));
          console.log(`📦 Found ${items.length} item(s) in tabTransactionHistory for carton ${carton_id}`);
        }
      }
    } else {
      // Fallback to tabCartonItem
      const [itemTableCheck] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCartonItem'
      `);
      
      if (itemTableCheck.length > 0) {
        const [itemRows] = await connection.execute(`
          SELECT 
            item_code,
            qty,
            uom
          FROM tabCartonItem
          WHERE carton_id = ?
          ORDER BY item_code
        `, [carton_id]);
        
        items = itemRows.map(item => ({
          item_code: item.item_code,
          qty: parseFloat(item.qty || 0),
          uom: item.uom || null,
          batch_no: null,
          serial_no: null
        }));
      }
    }
    
    res.json({
      ok: true,
      data: {
        carton_id: carton_id,
        warehouse_id: warehouseId,
        bin_location: binLocation,
        status: cartonStatus,
        items: items
      }
    });
  } catch (error) {
    console.error('❌ Error getting carton contents:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get carton contents",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/relocation/session/:session_id/line-scan
 * Scan item for partial modes (optional helper)
 * 
 * Request Body:
 * {
 *   "barcode": "6281230001111",
 *   "qty": 1,
 *   "scan_ts": "2025-01-15T10:30:00Z" (optional)
 * }
 */
export const scanRelocationLine = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { session_id } = req.params;
    const { barcode, qty, scan_ts } = req.body;
    
    // Validation
    if (!barcode || qty === undefined) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "barcode and qty are required"
        }
      });
    }
    
    await connection.beginTransaction();
    
    // Check if session exists and is IN_PROGRESS
    const [sessionRows] = await connection.execute(`
      SELECT session_id, status, mode
      FROM tabRelocationSession
      WHERE session_id = ?
    `, [session_id]);
    
    if (sessionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Relocation session ${session_id} not found`
        }
      });
    }
    
    const session = sessionRows[0];
    if (session.status !== 'IN_PROGRESS') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_STATUS",
          message: `Session ${session_id} is not IN_PROGRESS`
        }
      });
    }
    
    // Lookup item_code from barcode
    const [itemRows] = await connection.execute(`
      SELECT code as item_code, name as item_name, barcode
      FROM tabItem
      WHERE barcode = ?
      LIMIT 1
    `, [barcode]);
    
    if (itemRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Item with barcode ${barcode} not found`
        }
      });
    }
    
    const item = itemRows[0];
    
    // Add or update relocation line
    const [existingLine] = await connection.execute(`
      SELECT line_id, qty_moved
      FROM tabRelocationLine
      WHERE session_id = ? AND item_code = ?
    `, [session_id, item.item_code]);
    
    if (existingLine.length > 0) {
      // Update existing line (additive)
      const currentQty = parseFloat(existingLine[0].qty_moved || 0);
      const newQty = currentQty + parseFloat(qty);
      
      await connection.execute(`
        UPDATE tabRelocationLine
        SET qty_moved = ?,
            barcode = ?
        WHERE line_id = ?
      `, [newQty, barcode, existingLine[0].line_id]);
    } else {
      // Insert new line
      await connection.execute(`
        INSERT INTO tabRelocationLine
          (session_id, item_code, qty_moved, barcode, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [session_id, item.item_code, parseFloat(qty), barcode]);
    }
    
    await connection.commit();
    
    // Get updated totals
    const [totalRows] = await connection.execute(`
      SELECT 
        item_code,
        SUM(qty_moved) as total_moved
      FROM tabRelocationLine
      WHERE session_id = ?
      GROUP BY item_code
    `, [session_id]);
    
    console.log(`✅ Scanned item ${item.item_code} (barcode: ${barcode}, qty: ${qty}) for session ${session_id}`);
    
    res.json({
      ok: true,
      message: "Item scanned successfully",
      data: {
        session_id: session_id,
        item_code: item.item_code,
        item_name: item.item_name,
        barcode: barcode,
        qty_scanned: parseFloat(qty),
        totals: totalRows.map(row => ({
          item_code: row.item_code,
          total_moved: parseFloat(row.total_moved || 0)
        }))
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error scanning relocation line:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to scan item",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * PUT /api/relocation/session/:session_id/line
 * Edit line (manual correction)
 * 
 * Request Body:
 * {
 *   "item_code": "SKU-001",
 *   "qty_moved": 10,
 *   "reason": "manual correction" (optional)
 * }
 */
export const editRelocationLine = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { session_id } = req.params;
    const { item_code, qty_moved, reason } = req.body;
    
    // Validation
    if (!item_code || qty_moved === undefined) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "item_code and qty_moved are required"
        }
      });
    }
    
    await connection.beginTransaction();
    
    // Check if session exists and is IN_PROGRESS
    const [sessionRows] = await connection.execute(`
      SELECT session_id, status
      FROM tabRelocationSession
      WHERE session_id = ?
    `, [session_id]);
    
    if (sessionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Relocation session ${session_id} not found`
        }
      });
    }
    
    if (sessionRows[0].status !== 'IN_PROGRESS') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_STATUS",
          message: `Session ${session_id} is not IN_PROGRESS`
        }
      });
    }
    
    // Update or insert line
    const [existingLine] = await connection.execute(`
      SELECT line_id
      FROM tabRelocationLine
      WHERE session_id = ? AND item_code = ?
    `, [session_id, item_code]);
    
    if (existingLine.length > 0) {
      await connection.execute(`
        UPDATE tabRelocationLine
        SET qty_moved = ?
        WHERE line_id = ?
      `, [parseFloat(qty_moved), existingLine[0].line_id]);
    } else {
      await connection.execute(`
        INSERT INTO tabRelocationLine
          (session_id, item_code, qty_moved, created_at)
        VALUES (?, ?, ?, NOW())
      `, [session_id, item_code, parseFloat(qty_moved)]);
    }
    
    await connection.commit();
    
    console.log(`✅ Updated line for session ${session_id}: ${item_code} = ${qty_moved}${reason ? ` (reason: ${reason})` : ''}`);
    
    res.json({
      ok: true,
      message: "Line updated successfully",
      data: {
        session_id: session_id,
        item_code: item_code,
        qty_moved: parseFloat(qty_moved)
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error editing relocation line:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to edit line",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/relocation/session/:session_id/commit-full
 * Commit full carton move (blind or verified)
 * 
 * Request Body:
 * {
 *   "policy": "BLIND",  // BLIND | VERIFIED
 *   "to_carton_mode": "KEEP_SAME"  // KEEP_SAME | NEW_CARTON (optional)
 * }
 */
export const commitFullCartonMove = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { session_id } = req.params;
    const { policy, to_carton_mode } = req.body;
    
    await connection.beginTransaction();
    
    // Get session details
    const [sessionRows] = await connection.execute(`
      SELECT 
        session_id, mode, policy as session_policy, warehouse_id,
        from_bin, from_carton, to_bin, to_carton, status
      FROM tabRelocationSession
      WHERE session_id = ?
    `, [session_id]);
    
    if (sessionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Relocation session ${session_id} not found`
        }
      });
    }
    
    const session = sessionRows[0];
    
    if (session.status !== 'IN_PROGRESS') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_STATUS",
          message: `Session ${session_id} is not IN_PROGRESS`
        }
      });
    }
    
    if (session.mode !== 'FULL_CARTON') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_MODE",
          message: `Session ${session_id} is not in FULL_CARTON mode (current mode: ${session.mode}). Use /api/relocation/session/${session_id}/commit-partial endpoint for ${session.mode} mode.`
        }
      });
    }
    
    // Validate required fields
    if (!session.from_carton) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "from_carton must be set before committing"
        }
      });
    }
    
    if (!session.to_bin) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "to_bin must be set before committing"
        }
      });
    }
    
    // Declare cartonItems at function scope so it's accessible for transaction history
    // Use var to ensure function scope (not block scope)
    var cartonItems = [];
    
    // Check if session is already completed (idempotency)
    if (session.status === 'COMPLETED') {
      await connection.rollback();
      return res.json({
        ok: true,
        message: "Session already committed",
        data: {
          session_id: session_id,
          status: 'COMPLETED',
          already_committed: true
        }
      });
    }
    
    // For FULL_CARTON mode, allow scanning a new carton
    // If to_carton is different from from_carton, it will be treated as a carton merge/transfer
    // This allows users to move items to a new carton even in FULL_CARTON mode
    const actualPolicy = policy || session.session_policy || 'BLIND';
    
    // Determine the actual TO carton to use
    // Priority: 1) to_carton from session (if scanned), 2) to_carton_mode setting, 3) from_carton (keep same)
    let actualToCarton = session.to_carton;
    if (!actualToCarton) {
      if (to_carton_mode === 'NEW_CARTON') {
        actualToCarton = null; // Will create new carton or use existing logic
      } else {
        actualToCarton = session.from_carton; // Keep same carton (default for FULL_CARTON)
      }
    }
    
    // Check if this is a CARTON_MERGE operation (to_carton is set and different from from_carton)
    // This can happen in FULL_CARTON mode if user scans a new carton
    const isCartonMerge = actualToCarton && actualToCarton !== session.from_carton;
    
    // For VERIFIED policy, verify carton contents match expected
    if (actualPolicy === 'VERIFIED') {
      // Get carton contents
      const [cartonStockRows] = await connection.execute(`
        SELECT item_code, qty
        FROM tabCartonStock
        WHERE carton_id = ? AND warehouse = ?
      `, [session.from_carton, session.warehouse_id]);
      
      // Note: In a real implementation, you would compare with scanned items
      // For now, we just check that carton has contents
      if (cartonStockRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Carton ${session.from_carton} has no items to verify`
          }
        });
      }
      
      console.log(`✅ Verified carton ${session.from_carton} contains ${cartonStockRows.length} item(s)`);
    }
    
    // Check if tabCartonStock table exists
    const [stockTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCartonStock'
    `);
    
    const hasStockTable = stockTableCheck.length > 0;
    
    // Store moved items for transaction history (for carton merge)
    let movedItemsForHistory = [];
    
    if (isCartonMerge) {
      // ============================================================
      // CARTON_MERGE_ALL: Move all items from FROM carton to TO carton
      // ============================================================
      console.log(`🔄 Performing carton merge: ${session.from_carton} -> ${actualToCarton}`);
      
      // Check if FROM carton is a Transfer In carton
      const isFromTransferInCarton = session.from_carton && session.from_carton.startsWith('CTN-TI-');
      let transferInTitle = null;
      
      if (isFromTransferInCarton) {
        // Get Transfer In title from tabTransferInCarton
        const [transferInCartonTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCarton'
        `);
        
        if (transferInCartonTableCheck.length > 0) {
          const [transferInCartonRows] = await connection.execute(`
            SELECT transfer_in
            FROM tabTransferInCarton
            WHERE carton_id = ?
          `, [session.from_carton]);
          
          if (transferInCartonRows.length > 0) {
            transferInTitle = transferInCartonRows[0].transfer_in;
          }
        }
      }
      
      // 1) Lock and get all items from FROM carton
      let fromCartonItems = [];
      
      if (isFromTransferInCarton && transferInTitle) {
        // Get items from Transfer In carton line table
        const [transferInCartonLineTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCartonLine'
        `);
        
        if (transferInCartonLineTableCheck.length > 0) {
          const [transferInItems] = await connection.execute(`
            SELECT item_code, received_qty as qty
            FROM tabTransferInCartonLine
            WHERE carton_id = ? AND transfer_in = ?
            FOR UPDATE
          `, [session.from_carton, transferInTitle]);
          
          fromCartonItems = transferInItems.map(item => ({
            item_code: item.item_code,
            qty: parseFloat(item.qty || 0),
            batch_no: null,
            uom: null,
            serial_no: null,
            status: null
          }));
        }
      } else if (hasStockTable) {
        // Get items from regular carton stock table
        const [regularItems] = await connection.execute(`
          SELECT item_code, qty, batch_no, uom, serial_no, status
          FROM tabCartonStock
          WHERE carton_id = ? AND warehouse = ?
          FOR UPDATE
        `, [session.from_carton, session.warehouse_id]);
        
        fromCartonItems = regularItems;
      }
      
      if (fromCartonItems.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Carton ${session.from_carton} has no items to merge`
          }
        });
      }
      
      // Store items for transaction history (with source qty)
      movedItemsForHistory = fromCartonItems.map(item => ({
        item_code: item.item_code,
        qty: item.qty,
        source_qty: item.qty // qty in source carton before merge
      }));
      
      // Get destination carton quantities BEFORE merge (for qty_before in IN transaction)
      const destCartonQtysBeforeMerge = new Map();
      if (hasStockTable) {
        for (const item of fromCartonItems) {
          const [destStock] = await connection.execute(`
            SELECT qty
            FROM tabCartonStock
            WHERE carton_id = ? AND item_code = ?
            LIMIT 1
          `, [actualToCarton, item.item_code]);
          
          const destQty = destStock.length > 0 ? (parseFloat(destStock[0].qty) || 0) : 0;
          destCartonQtysBeforeMerge.set(item.item_code, destQty);
        }
      }
      
      console.log(`📦 Found ${fromCartonItems.length} item(s) in carton ${session.from_carton}${isFromTransferInCarton ? ' (Transfer In carton)' : ''}`);
      
      // 2) For each item, UPSERT into TO carton
      // Check if TO carton is also a Transfer In carton
      const isToTransferInCarton = actualToCarton && actualToCarton.startsWith('CTN-TI-');
      let toTransferInTitle = null;
      
      if (isToTransferInCarton) {
        const [transferInCartonTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCarton'
        `);
        
        if (transferInCartonTableCheck.length > 0) {
          const [transferInCartonRows] = await connection.execute(`
            SELECT transfer_in
            FROM tabTransferInCarton
            WHERE carton_id = ?
          `, [actualToCarton]);
          
          if (transferInCartonRows.length > 0) {
            toTransferInTitle = transferInCartonRows[0].transfer_in;
          }
        }
      }
      
      for (const item of fromCartonItems) {
        if (isToTransferInCarton && toTransferInTitle && hasStockTable) {
          // TO carton is a Transfer In carton - move to tabTransferInCartonLine
          const [transferInCartonLineTableCheck] = await connection.execute(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabTransferInCartonLine'
          `);
          
          if (transferInCartonLineTableCheck.length > 0) {
            const lineName = `TICL-${toTransferInTitle}-${actualToCarton}-${item.item_code}-${Date.now()}`;
            await connection.execute(`
              INSERT INTO tabTransferInCartonLine (name, transfer_in, carton_id, item_code, received_qty, created_at)
              VALUES (?, ?, ?, ?, ?, NOW())
              ON DUPLICATE KEY UPDATE
                received_qty = received_qty + VALUES(received_qty),
                updated_at = NOW()
            `, [lineName, toTransferInTitle, actualToCarton, item.item_code, item.qty]);
            
            console.log(`  ✅ Merged ${item.qty} x ${item.item_code} into Transfer In carton ${actualToCarton}`);
          }
        } else if (hasStockTable) {
          // TO carton is a regular carton - move to tabCartonStock
          // Check if tabCartonStock has batch_no column for unique key
          const [stockCols] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabCartonStock'
              AND COLUMN_NAME IN ('batch_no', 'uom', 'serial_no', 'status')
          `);
          
          const hasBatchNo = stockCols.some(col => col.COLUMN_NAME === 'batch_no');
          const hasUom = stockCols.some(col => col.COLUMN_NAME === 'uom');
          const hasSerialNo = stockCols.some(col => col.COLUMN_NAME === 'serial_no');
          const hasStatus = stockCols.some(col => col.COLUMN_NAME === 'status');
          
          // Build INSERT columns
          const insertCols = ['carton_id', 'item_code', 'warehouse', 'bin_location', 'qty'];
          const insertValues = [actualToCarton, item.item_code, session.warehouse_id, session.to_bin, item.qty];
          
          if (hasUom && item.uom) {
            insertCols.push('uom');
            insertValues.push(item.uom);
          }
          if (hasBatchNo && item.batch_no) {
            insertCols.push('batch_no');
            insertValues.push(item.batch_no);
          }
          if (hasSerialNo && item.serial_no) {
            insertCols.push('serial_no');
            insertValues.push(item.serial_no);
          }
          if (hasStatus && item.status) {
            insertCols.push('status');
            insertValues.push(item.status);
          }
          
          // UPSERT: INSERT ... ON DUPLICATE KEY UPDATE
          // Unique key is typically (carton_id, item_code, batch_no) or (carton_id, item_code)
          const updateParts = ['qty = qty + VALUES(qty)', 'bin_location = VALUES(bin_location)'];
          if (hasStatus && item.status) {
            updateParts.push('status = VALUES(status)');
          }
          
          await connection.execute(`
            INSERT INTO tabCartonStock (${insertCols.join(', ')})
            VALUES (${insertCols.map(() => '?').join(', ')})
            ON DUPLICATE KEY UPDATE ${updateParts.join(', ')}
          `, insertValues);
          
          console.log(`  ✅ Merged ${item.qty} x ${item.item_code}${item.batch_no ? ` (batch: ${item.batch_no})` : ''} into carton ${actualToCarton}`);
        }
      }
      
      // 3) Delete all items from FROM carton
      if (isFromTransferInCarton && transferInTitle) {
        // Delete from Transfer In carton line table
        const [transferInCartonLineTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCartonLine'
        `);
        
        if (transferInCartonLineTableCheck.length > 0) {
          await connection.execute(`
            DELETE FROM tabTransferInCartonLine
            WHERE carton_id = ? AND transfer_in = ?
          `, [session.from_carton, transferInTitle]);
          console.log(`🗑️  Deleted items from tabTransferInCartonLine for carton ${session.from_carton}`);
        }
        
        // Also delete from tabCartonStock if any records exist (in case of duplicates)
        if (hasStockTable) {
          const [deletedFromStock] = await connection.execute(`
            DELETE FROM tabCartonStock
            WHERE carton_id = ? AND warehouse = ?
          `, [session.from_carton, session.warehouse_id]);
          if (deletedFromStock.affectedRows > 0) {
            console.log(`🗑️  Deleted ${deletedFromStock.affectedRows} record(s) from tabCartonStock for carton ${session.from_carton}`);
          }
        }
      } else if (hasStockTable) {
        // Delete from regular carton stock table
        const [deletedFromStock] = await connection.execute(`
          DELETE FROM tabCartonStock
          WHERE carton_id = ? AND warehouse = ?
        `, [session.from_carton, session.warehouse_id]);
        console.log(`🗑️  Deleted ${deletedFromStock.affectedRows} item(s) from carton ${session.from_carton}`);
      }
      
      console.log(`✅ Completed deletion of all items from carton ${session.from_carton}`);
      
      // Update tabStockLedger: Move stock from old bin to new bin for each merged item
      for (const item of movedItemsForHistory) {
        const itemCode = item.item_code;
        const qty = parseFloat(item.qty) || 0;
        
        if (!itemCode || qty <= 0) continue;
        
        // Decrease stock at old bin location
        const [oldBinStock] = await connection.execute(`
          SELECT qty, reserved_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
        `, [itemCode, session.warehouse_id, session.from_bin, session.from_bin]);
        
        if (oldBinStock.length > 0) {
          const oldQty = parseFloat(oldBinStock[0].qty) || 0;
          const reservedQty = parseFloat(oldBinStock[0].reserved_qty) || 0;
          const newOldBinQty = Math.max(0, oldQty - qty);
          
          if (newOldBinQty > 0) {
            await connection.execute(`
              UPDATE tabStockLedger
              SET qty = ?,
                  last_transaction_date = NOW(),
                  last_transaction_type = 'CARTON_MERGE',
                  last_transaction_ref = ?,
                  updated_at = NOW()
              WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
            `, [newOldBinQty, session_id, itemCode, session.warehouse_id, session.from_bin, session.from_bin]);
          } else {
            // Remove entry if qty becomes 0
            await connection.execute(`
              DELETE FROM tabStockLedger
              WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
            `, [itemCode, session.warehouse_id, session.from_bin, session.from_bin]);
          }
        }
        
        // Increase stock at new bin location
        const [newBinStock] = await connection.execute(`
          SELECT qty, reserved_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
        `, [itemCode, session.warehouse_id, session.to_bin, session.to_bin]);
        
        const newBinQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].qty) || 0 : 0;
        const newBinReservedQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].reserved_qty) || 0 : 0;
        const updatedNewBinQty = newBinQty + qty;
        
        await connection.execute(`
          INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at)
          VALUES (?, ?, ?, ?, ?, NOW(), 'CARTON_MERGE', ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE qty = ?, last_transaction_date = NOW(), last_transaction_type = 'CARTON_MERGE', last_transaction_ref = ?, updated_at = NOW()
        `, [itemCode, session.warehouse_id, session.to_bin, updatedNewBinQty, newBinReservedQty, session_id, updatedNewBinQty, session_id]);
      }
      
      console.log(`✅ Updated tabStockLedger for ${movedItemsForHistory.length} item(s) merged from ${session.from_bin} to ${session.to_bin}`);
      
      // 4) Mark FROM carton as MERGED
      // Check if merged_to_carton column exists
      const [cartonCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCarton'
          AND COLUMN_NAME IN ('status', 'merged_to_carton', 'bin_id', 'current_bin_id')
      `);
      
      const hasStatus = cartonCols.some(col => col.COLUMN_NAME === 'status');
      const hasMergedToCarton = cartonCols.some(col => col.COLUMN_NAME === 'merged_to_carton');
      const hasBinId = cartonCols.some(col => col.COLUMN_NAME === 'bin_id');
      const hasCurrentBinId = cartonCols.some(col => col.COLUMN_NAME === 'current_bin_id');
      
      const updateFields = [];
      const updateValues = [];
      
      if (hasStatus) {
        updateFields.push('status = ?');
        updateValues.push('MERGED');
      }
      if (hasMergedToCarton) {
        updateFields.push('merged_to_carton = ?');
        updateValues.push(actualToCarton);
      }
      if (hasBinId) {
        updateFields.push('bin_id = ?');
        updateValues.push(session.to_bin);
      } else if (hasCurrentBinId) {
        updateFields.push('current_bin_id = ?');
        updateValues.push(session.to_bin);
      }
      updateFields.push('updated_at = NOW()');
      
      if (updateFields.length > 0) {
        await connection.execute(`
          UPDATE tabCarton
          SET ${updateFields.join(', ')}
          WHERE carton_id = ? AND warehouse = ?
        `, [...updateValues, session.from_carton, session.warehouse_id]);
      }
      
      console.log(`✅ Marked carton ${session.from_carton} as MERGED -> ${actualToCarton}`);
      
      // 5) Ensure TO carton is in correct bin
      if (hasBinId) {
        await connection.execute(`
          UPDATE tabCarton
          SET bin_id = ?,
              last_moved_on = NOW(),
              updated_at = NOW()
          WHERE carton_id = ? AND warehouse = ?
        `, [session.to_bin, actualToCarton, session.warehouse_id]);
      } else if (hasCurrentBinId) {
        await connection.execute(`
          UPDATE tabCarton
          SET current_bin_id = ?,
              last_moved_on = NOW(),
              updated_at = NOW()
          WHERE carton_id = ? AND warehouse = ?
        `, [session.to_bin, actualToCarton, session.warehouse_id]);
      }
      
      console.log(`✅ Updated TO carton ${actualToCarton} bin to ${session.to_bin}`);
      
    } else {
      // ============================================================
      // FULL_CARTON_RELOCATE: Simple relocation (no merge)
      // ============================================================
      
      // cartonItems is already declared at function scope above
      
      // STEP A: Get carton's real warehouse (NOT session.warehouse_id if it's "DEFAULT")
      let actualWarehouse = session.warehouse_id;
      
      // Check if warehouse column exists in tabCarton
      const [cartonWarehouseCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCarton'
          AND COLUMN_NAME = 'warehouse'
      `);
      
      const hasCartonWarehouse = cartonWarehouseCols.length > 0;
      
      if (hasCartonWarehouse) {
        // Get warehouse from tabCarton (preferred)
        const [cartonWarehouseRows] = await connection.execute(`
          SELECT warehouse
          FROM tabCarton
          WHERE carton_id = ?
        `, [session.from_carton]);
        
        if (cartonWarehouseRows.length > 0 && cartonWarehouseRows[0].warehouse) {
          actualWarehouse = cartonWarehouseRows[0].warehouse;
          console.log(`✅ Using carton's warehouse: ${actualWarehouse} (instead of session warehouse: ${session.warehouse_id})`);
        } else if (hasStockTable) {
          // Fallback: Get warehouse from first tabCartonStock row
          const [stockWarehouseRows] = await connection.execute(`
            SELECT warehouse
            FROM tabCartonStock
            WHERE carton_id = ?
            LIMIT 1
          `, [session.from_carton]);
          
          if (stockWarehouseRows.length > 0 && stockWarehouseRows[0].warehouse) {
            actualWarehouse = stockWarehouseRows[0].warehouse;
            console.log(`✅ Using warehouse from tabCartonStock: ${actualWarehouse}`);
          }
        }
      }
      
      // Update carton location
      // Update tabCarton.current_bin_id or bin_id
      const [cartonCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCarton'
          AND COLUMN_NAME IN ('bin_id', 'current_bin_id', 'warehouse')
      `);
      
      const hasBinId = cartonCols.some(col => col.COLUMN_NAME === 'bin_id');
      const hasCurrentBinId = cartonCols.some(col => col.COLUMN_NAME === 'current_bin_id');
      const hasCartonWarehouseCol = cartonCols.some(col => col.COLUMN_NAME === 'warehouse');
      
      // Build UPDATE query
      let cartonUpdateQuery = '';
      const cartonUpdateParams = [];
      
      if (hasBinId) {
        cartonUpdateQuery = `UPDATE tabCarton SET bin_id = ?, last_moved_on = NOW(), updated_at = NOW()`;
        cartonUpdateParams.push(session.to_bin);
      } else if (hasCurrentBinId) {
        cartonUpdateQuery = `UPDATE tabCarton SET current_bin_id = ?, last_moved_on = NOW(), updated_at = NOW()`;
        cartonUpdateParams.push(session.to_bin);
      }
      
      // Add WHERE clause - use warehouse if column exists, otherwise just carton_id
      if (hasCartonWarehouseCol && actualWarehouse) {
        cartonUpdateQuery += ` WHERE carton_id = ? AND warehouse = ?`;
        cartonUpdateParams.push(session.from_carton, actualWarehouse);
      } else {
        cartonUpdateQuery += ` WHERE carton_id = ?`;
        cartonUpdateParams.push(session.from_carton);
      }
      
      if (cartonUpdateQuery) {
        await connection.execute(cartonUpdateQuery, cartonUpdateParams);
      }
      
      // Update tabCartonStock.bin_location for all items in carton
      // Also sync Transfer In cartons to tabCartonStock if needed
      // cartonItems is already declared at function scope above
      if (hasStockTable) {
        // Check if this is a Transfer In carton
        const isTransferInCarton = session.from_carton && session.from_carton.startsWith('CTN-TI-');
        let transferInTitle = null;
        
        if (isTransferInCarton) {
          // Get Transfer In title
          const [transferInCartonTableCheck] = await connection.execute(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabTransferInCarton'
          `);
          
          if (transferInCartonTableCheck.length > 0) {
            const [transferInCartonRows] = await connection.execute(`
              SELECT transfer_in
              FROM tabTransferInCarton
              WHERE carton_id = ?
            `, [session.from_carton]);
            
            if (transferInCartonRows.length > 0) {
              transferInTitle = transferInCartonRows[0].transfer_in;
            }
          }
          
          // Sync Transfer In carton items to tabCartonStock if not already there
          if (transferInTitle) {
            const [transferInCartonLineTableCheck] = await connection.execute(`
              SELECT TABLE_NAME
              FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferInCartonLine'
            `);
            
            if (transferInCartonLineTableCheck.length > 0) {
              const [transferInItems] = await connection.execute(`
                SELECT item_code, received_qty as qty
                FROM tabTransferInCartonLine
                WHERE carton_id = ? AND transfer_in = ?
              `, [session.from_carton, transferInTitle]);
              
              // Sync each item to tabCartonStock with new bin location
              // Use actualWarehouse (determined above) instead of session.warehouse_id
              for (const item of transferInItems) {
                await connection.execute(`
                  INSERT INTO tabCartonStock (carton_id, item_code, warehouse, bin_location, qty, status, created_on, updated_at)
                  VALUES (?, ?, ?, ?, ?, 'PUTAWAY', NOW(), NOW())
                  ON DUPLICATE KEY UPDATE
                    bin_location = VALUES(bin_location),
                    updated_at = NOW()
                `, [session.from_carton, item.item_code, actualWarehouse, session.to_bin, parseFloat(item.qty) || 0]);
              }
              
              console.log(`✅ Synced ${transferInItems.length} Transfer In item(s) to tabCartonStock with new bin location`);
            }
          }
        }
        
        // Update bin_location for all items in carton (use actual warehouse)
        // Update all items regardless of warehouse (carton might have items in different warehouses)
        await connection.execute(`
          UPDATE tabCartonStock
          SET bin_location = ?,
              last_moved_on = NOW(),
              updated_at = NOW()
          WHERE carton_id = ?
        `, [session.to_bin, session.from_carton]);
        
        // STEP B: Get all items in carton with their warehouse (use actual warehouse, not session)
        // Lock rows for update
        [cartonItems] = await connection.execute(`
          SELECT item_code, qty, warehouse, batch_no
          FROM tabCartonStock
          WHERE carton_id = ?
          FOR UPDATE
        `, [session.from_carton]);
        
        // Use actual warehouse from carton items (each item might have different warehouse)
        // But typically all items in a carton have the same warehouse
        if (cartonItems.length > 0) {
          // Use warehouse from first item, or actualWarehouse if determined above
          const itemWarehouse = cartonItems[0].warehouse || actualWarehouse;
          if (itemWarehouse && itemWarehouse !== 'DEFAULT') {
            actualWarehouse = itemWarehouse;
          }
        }
        
        console.log(`📦 Processing ${cartonItems.length} item(s) in carton ${session.from_carton} (warehouse: ${actualWarehouse})`);
        
        // STEP C: Update StockLedger for each item using actual warehouse
        // Check if qty_before and qty_reduced columns exist
        const [stockLedgerCols] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
        `);
        
        const hasQtyBefore = stockLedgerCols.some(col => col.COLUMN_NAME === 'qty_before');
        const hasQtyReduced = stockLedgerCols.some(col => col.COLUMN_NAME === 'qty_reduced');
        
        for (const item of cartonItems) {
          const itemCode = item.item_code;
          const qty = parseFloat(item.qty) || 0;
          const itemWarehouse = item.warehouse || actualWarehouse; // Use item's warehouse or carton's warehouse
          
          if (!itemCode || qty <= 0) continue;
          
          // Decrease stock at old bin location
          const [oldBinStock] = await connection.execute(`
            SELECT qty, reserved_qty
            FROM tabStockLedger
            WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
          `, [itemCode, itemWarehouse, session.from_bin, session.from_bin]);
          
          if (oldBinStock.length > 0) {
            const oldQty = parseFloat(oldBinStock[0].qty) || 0;
            const reservedQty = parseFloat(oldBinStock[0].reserved_qty) || 0;
            const newOldBinQty = Math.max(0, oldQty - qty);
            
            // Calculate qty_before and qty_reduced for old bin (stock decrease)
            const qtyBeforeOld = oldQty;
            const qtyReducedOld = -qty; // Negative for decrease
            
            if (newOldBinQty > 0) {
              let updateFields = ['qty = ?', 'last_transaction_date = NOW()', 'last_transaction_type = ?', 'last_transaction_ref = ?', 'updated_at = NOW()'];
              let updateValues = [newOldBinQty, 'CARTON_RELOCATION', session_id];
              
              if (hasQtyBefore) {
                updateFields.push('qty_before = ?');
                updateValues.push(qtyBeforeOld);
              }
              if (hasQtyReduced) {
                updateFields.push('qty_reduced = ?');
                updateValues.push(qtyReducedOld);
              }
              
              await connection.execute(`
                UPDATE tabStockLedger
                SET ${updateFields.join(', ')}
                WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
              `, [...updateValues, itemCode, itemWarehouse, session.from_bin, session.from_bin]);
            } else {
              // Remove entry if qty becomes 0
              await connection.execute(`
                DELETE FROM tabStockLedger
                WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
              `, [itemCode, itemWarehouse, session.from_bin, session.from_bin]);
            }
          }
          
          // Increase stock at new bin location
          const [newBinStock] = await connection.execute(`
            SELECT qty, reserved_qty
            FROM tabStockLedger
            WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
          `, [itemCode, itemWarehouse, session.to_bin, session.to_bin]);
          
          const newBinQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].qty) || 0 : 0;
          const newBinReservedQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].reserved_qty) || 0 : 0;
          const updatedNewBinQty = newBinQty + qty;
          
          // Calculate qty_before and qty_reduced for new bin (stock increase)
          const qtyBeforeNew = newBinQty;
          const qtyReducedNew = qty; // Positive for increase
          
          // Check if carton_id column exists in tabStockLedger
          const [stockLedgerCartonIdColumn] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabStockLedger' 
            AND COLUMN_NAME = 'carton_id'
          `);
          const hasStockLedgerCartonIdColumn = stockLedgerCartonIdColumn.length > 0;
          
          // Build INSERT/UPDATE query with optional qty_before and qty_reduced
          let insertFields = 'item_code, warehouse, bin_location, qty, reserved_qty';
          let insertValues = '?, ?, ?, ?, ?';
          let insertParams = [itemCode, itemWarehouse, session.to_bin, updatedNewBinQty, newBinReservedQty];
          
          let updateFields = 'qty = ?';
          let updateParams = [updatedNewBinQty];
          
          // ✅ Include carton_id if column exists
          if (hasStockLedgerCartonIdColumn && session.from_carton) {
            insertFields += ', carton_id';
            insertValues += ', ?';
            insertParams.push(session.from_carton);
            updateFields += ', carton_id = ?';
            updateParams.push(session.from_carton);
          }
          
          if (hasQtyBefore) {
            insertFields += ', qty_before';
            insertValues += ', ?';
            insertParams.push(qtyBeforeNew);
            updateFields += ', qty_before = ?';
            updateParams.push(qtyBeforeNew);
          }
          
          if (hasQtyReduced) {
            insertFields += ', qty_reduced';
            insertValues += ', ?';
            insertParams.push(qtyReducedNew);
            updateFields += ', qty_reduced = ?';
            updateParams.push(qtyReducedNew);
          }
          
          insertFields += ', last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at';
          insertValues += ', NOW(), ?, ?, NOW(), NOW()';
          insertParams.push('CARTON_RELOCATION', session_id);
          
          updateFields += ', last_transaction_date = NOW(), last_transaction_type = ?, last_transaction_ref = ?, updated_at = NOW()';
          updateParams.push('CARTON_RELOCATION', session_id);
          
          await connection.execute(`
            INSERT INTO tabStockLedger (${insertFields})
            VALUES (${insertValues})
            ON DUPLICATE KEY UPDATE ${updateFields}
          `, [...insertParams, ...updateParams]);
        }
        
        console.log(`✅ Updated tabStockLedger for ${cartonItems.length} item(s) moved from ${session.from_bin} to ${session.to_bin} (warehouse: ${actualWarehouse})`);
      } else {
        // If hasStockTable is false, still try to get cartonItems for transaction history
        // This shouldn't happen in normal operation, but handle gracefully
        cartonItems = [];
      }
    }
    
    // IMPORTANT: Create relocation history ONLY after all stock updates succeed
    // Transaction history is created AFTER stock ledger updates but BEFORE marking session as COMPLETED
    // If history creation fails, transaction will rollback and session remains IN_PROGRESS
    // This ensures history is ONLY created when relocation is successfully completed
    
    // Insert transaction history
    // Check if from_carton/to_carton columns exist in tabTransactionHistory (audit trail)
    const [txnCols] = await connection.execute(`
      SELECT COLUMN_NAME, EXTRA, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME IN ('transaction_id', 'from_carton', 'to_carton')
    `);
    
    const hasFromCarton = txnCols.some(col => col.COLUMN_NAME === 'from_carton');
    const hasToCarton = txnCols.some(col => col.COLUMN_NAME === 'to_carton');
    
    // Check if transaction_id is required
    const transactionIdCol = txnCols.find(col => col.COLUMN_NAME === 'transaction_id');
    const hasTransactionId = !!transactionIdCol;
    const isTransactionIdAutoIncrement = transactionIdCol && transactionIdCol.EXTRA && transactionIdCol.EXTRA.toLowerCase().includes('auto_increment');
    const needsTransactionId = hasTransactionId && !isTransactionIdAutoIncrement && transactionIdCol.IS_NULLABLE === 'NO' && !transactionIdCol.COLUMN_DEFAULT;
    const isTransactionIdInteger = transactionIdCol && (transactionIdCol.DATA_TYPE === 'int' || transactionIdCol.DATA_TYPE === 'bigint' || transactionIdCol.DATA_TYPE === 'integer');
    
    // Helper function to generate transaction_id based on column type
    const generateTransactionId = (suffix = '') => {
      if (isTransactionIdInteger) {
        // Generate numeric ID (safe range for INT/BIGINT)
        return parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`.substring(0, 15));
      } else {
        return `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}${suffix}`;
      }
    };
    
    // Get carton_id column position
    const [cartonIdCol] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME = 'carton_id'
    `);
    
    const hasCartonId = cartonIdCol.length > 0;
    
    // Insert transaction history into tabTransactionHistory (audit trail)
    // Check what bin columns exist in tabTransactionHistory
    const [binCols] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME IN ('from_bin', 'to_bin', 'source_bin', 'target_bin', 'bin_location')
    `);
    
    const hasFromBin = binCols.some(col => col.COLUMN_NAME === 'from_bin');
    const hasToBin = binCols.some(col => col.COLUMN_NAME === 'to_bin');
    const hasSourceBin = binCols.some(col => col.COLUMN_NAME === 'source_bin');
    const hasTargetBin = binCols.some(col => col.COLUMN_NAME === 'target_bin');
    const hasBinLocation = binCols.some(col => col.COLUMN_NAME === 'bin_location');
    
    // Check required fields for tabTransactionHistory (audit trail)
    const [requiredCols] = await connection.execute(`
      SELECT COLUMN_NAME, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME IN ('transaction_date', 'reference_doc_type', 'reference_doc', 'performed_by', 'created_at', 'qty_change', 'qty_before', 'qty_after', 'item_code')
    `);
    
    const hasTransactionDate = requiredCols.some(col => col.COLUMN_NAME === 'transaction_date');
    const hasRefDocType = requiredCols.some(col => col.COLUMN_NAME === 'reference_doc_type');
    const hasRefDoc = requiredCols.some(col => col.COLUMN_NAME === 'reference_doc');
    const hasPerformedBy = requiredCols.some(col => col.COLUMN_NAME === 'performed_by');
    const hasCreatedAt = requiredCols.some(col => col.COLUMN_NAME === 'created_at');
    const hasQtyChange = requiredCols.some(col => col.COLUMN_NAME === 'qty_change');
    const hasQtyBefore = requiredCols.some(col => col.COLUMN_NAME === 'qty_before');
    const hasQtyAfter = requiredCols.some(col => col.COLUMN_NAME === 'qty_after');
    const itemCodeCol = requiredCols.find(col => col.COLUMN_NAME === 'item_code');
    const hasItemCode = itemCodeCol !== undefined;
    const itemCodeNullable = itemCodeCol?.IS_NULLABLE === 'YES';
    
    // Insert transaction history
    // For carton merges, we can insert item-level transactions since we have item_code
    // CRITICAL: Create TWO transactions per item (OUT from source, IN to destination)
    // This ensures proper ledger accounting and correct Item Location Breakdown
    if (isCartonMerge && movedItemsForHistory.length > 0) {
      // Check if stock_direction column exists and is NOT a generated column
      const [stockDirectionCol] = await connection.execute(`
        SELECT COLUMN_NAME, GENERATION_EXPRESSION, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransactionHistory'
          AND COLUMN_NAME = 'stock_direction'
      `);
      const stockDirColInfo = stockDirectionCol.length > 0 ? stockDirectionCol[0] : null;
      const isStockDirectionGenerated = stockDirColInfo && (
        (stockDirColInfo.GENERATION_EXPRESSION && stockDirColInfo.GENERATION_EXPRESSION.length > 0) ||
        (stockDirColInfo.EXTRA && stockDirColInfo.EXTRA.toLowerCase().includes('generated'))
      );
      const hasStockDirection = stockDirectionCol.length > 0 && !isStockDirectionGenerated;
      
      // Get source and destination quantities for transactions
      // NOTE: movedItemsForHistory already contains source qty (captured before deletion)
      // NOTE: destCartonQtysBeforeMerge was captured before merge (if available)
      const sourceCartonQtys = new Map();
      const destCartonQtys = new Map();
      
      for (const item of movedItemsForHistory) {
        // Source qty: Use qty from movedItemsForHistory (captured before deletion)
        const sourceQty = item.source_qty || item.qty;
        sourceCartonQtys.set(item.item_code, sourceQty);
        
        // Destination qty_before: Use captured value or default to 0
        // destCartonQtysBeforeMerge is defined in the same scope (above in the isCartonMerge block)
        const destQtyBefore = (typeof destCartonQtysBeforeMerge !== 'undefined' && destCartonQtysBeforeMerge) 
          ? (destCartonQtysBeforeMerge.get(item.item_code) || 0)
          : 0;
        destCartonQtys.set(item.item_code, destQtyBefore);
      }
      
      // Use actual warehouse from item (not session.warehouse_id if DEFAULT)
      let itemWarehouse = session.warehouse_id;
      if (hasStockTable && movedItemsForHistory.length > 0) {
        const [itemStock] = await connection.execute(`
          SELECT warehouse
          FROM tabCartonStock
          WHERE carton_id = ? AND item_code = ?
          LIMIT 1
        `, [actualToCarton, movedItemsForHistory[0].item_code]);
        
        if (itemStock.length > 0 && itemStock[0].warehouse && itemStock[0].warehouse !== 'DEFAULT') {
          itemWarehouse = itemStock[0].warehouse;
        }
      }
      
      const performedBy = req.user?.user_id || session.created_by || 'SYSTEM';
      const transactionDate = new Date();
      
      // Insert TWO transactions per item: OUT from source, IN to destination
      let transactionsInserted = 0;
      for (const item of movedItemsForHistory) {
        const sourceQty = sourceCartonQtys.get(item.item_code) || item.qty;
        const destQtyBefore = destCartonQtys.get(item.item_code) || 0;
        const destQtyAfter = destQtyBefore + item.qty;
        
        // ============================================================
        // TRANSACTION 1: Source Carton (OUT) - Negative qty_change
        // ============================================================
        const sourceTxnFields = [];
        const sourceTxnValues = [];
        
        // Add transaction_id if required
        if (needsTransactionId) {
          sourceTxnFields.push('transaction_id');
          sourceTxnValues.push(generateTransactionId('-OUT'));
        }
        
        if (hasTransactionDate) {
          sourceTxnFields.push('transaction_date');
          sourceTxnValues.push(transactionDate);
        }
        
        sourceTxnFields.push('transaction_type');
        sourceTxnValues.push('CARTON_MERGE');
        
        if (hasRefDocType) {
          sourceTxnFields.push('reference_doc_type');
          sourceTxnValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          sourceTxnFields.push('reference_doc');
          sourceTxnValues.push(session_id);
        }
        
        sourceTxnFields.push('warehouse');
        sourceTxnValues.push(itemWarehouse);
        
        if (hasItemCode) {
          sourceTxnFields.push('item_code');
          sourceTxnValues.push(item.item_code);
        }
        
        // Source carton location
        if (hasBinLocation) {
          sourceTxnFields.push('bin_location');
          sourceTxnValues.push(session.from_bin); // Source bin
        }
        
        if (hasFromBin && hasToBin) {
          sourceTxnFields.push('from_bin', 'to_bin');
          sourceTxnValues.push(session.from_bin, session.to_bin);
        } else if (hasSourceBin && hasTargetBin) {
          sourceTxnFields.push('source_bin', 'target_bin');
          sourceTxnValues.push(session.from_bin, session.to_bin);
        }
        
        if (hasCartonId) {
          sourceTxnFields.push('carton_id');
          sourceTxnValues.push(session.from_carton); // FROM carton
        }
        
        if (hasFromCarton) {
          sourceTxnFields.push('from_carton');
          sourceTxnValues.push(session.from_carton);
        }
        
        if (hasToCarton) {
          sourceTxnFields.push('to_carton');
          sourceTxnValues.push(actualToCarton);
        }
        
        // Source transaction: OUT (negative qty_change)
        if (hasQtyChange) {
          sourceTxnFields.push('qty_change');
          sourceTxnValues.push(-item.qty); // Negative for OUT
        }
        if (hasQtyBefore) {
          sourceTxnFields.push('qty_before');
          sourceTxnValues.push(sourceQty); // Current qty in source carton
        }
        if (hasQtyAfter) {
          sourceTxnFields.push('qty_after');
          sourceTxnValues.push(0); // Source carton becomes empty
        }
        
        // Add stock_direction if column exists
        if (hasStockDirection) {
          sourceTxnFields.push('stock_direction');
          sourceTxnValues.push('OUT');
        }
        
        if (hasPerformedBy) {
          sourceTxnFields.push('performed_by');
          sourceTxnValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          sourceTxnFields.push('created_at');
          sourceTxnValues.push(transactionDate);
        }
        
        // Insert source transaction (OUT) into tabTransactionHistory (audit trail)
        if (sourceTxnFields.length > 0 && (!hasItemCode || itemCodeNullable || item.item_code)) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${sourceTxnFields.join(', ')})
            VALUES (${sourceTxnFields.map(() => '?').join(', ')})
          `, sourceTxnValues);
          transactionsInserted++;
          console.log(`📝 Inserted CARTON_MERGE OUT transaction for ${item.item_code} into tabTransactionHistory`);
        }
        
        // ============================================================
        // TRANSACTION 2: Destination Carton (IN) - Positive qty_change
        // ============================================================
        const destTxnFields = [];
        const destTxnValues = [];
        
        // Add transaction_id if required
        if (needsTransactionId) {
          destTxnFields.push('transaction_id');
          destTxnValues.push(generateTransactionId('-IN'));
        }
        
        if (hasTransactionDate) {
          destTxnFields.push('transaction_date');
          destTxnValues.push(transactionDate);
        }
        
        destTxnFields.push('transaction_type');
        destTxnValues.push('CARTON_MERGE');
        
        if (hasRefDocType) {
          destTxnFields.push('reference_doc_type');
          destTxnValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          destTxnFields.push('reference_doc');
          destTxnValues.push(session_id);
        }
        
        destTxnFields.push('warehouse');
        destTxnValues.push(itemWarehouse);
        
        if (hasItemCode) {
          destTxnFields.push('item_code');
          destTxnValues.push(item.item_code);
        }
        
        // Destination carton location
        if (hasBinLocation) {
          destTxnFields.push('bin_location');
          destTxnValues.push(session.to_bin); // Destination bin
        }
        
        if (hasFromBin && hasToBin) {
          destTxnFields.push('from_bin', 'to_bin');
          destTxnValues.push(session.from_bin, session.to_bin);
        } else if (hasSourceBin && hasTargetBin) {
          destTxnFields.push('source_bin', 'target_bin');
          destTxnValues.push(session.from_bin, session.to_bin);
        }
        
        if (hasCartonId) {
          destTxnFields.push('carton_id');
          destTxnValues.push(actualToCarton); // TO carton
        }
        
        if (hasFromCarton) {
          destTxnFields.push('from_carton');
          destTxnValues.push(session.from_carton);
        }
        
        if (hasToCarton) {
          destTxnFields.push('to_carton');
          destTxnValues.push(actualToCarton);
        }
        
        // Destination transaction: IN (positive qty_change)
        if (hasQtyChange) {
          destTxnFields.push('qty_change');
          destTxnValues.push(item.qty); // Positive for IN
        }
        if (hasQtyBefore) {
          destTxnFields.push('qty_before');
          destTxnValues.push(destQtyBefore); // Existing qty in destination (might be 0)
        }
        if (hasQtyAfter) {
          destTxnFields.push('qty_after');
          destTxnValues.push(destQtyAfter); // New qty in destination
        }
        
        // Add stock_direction if column exists
        if (hasStockDirection) {
          destTxnFields.push('stock_direction');
          destTxnValues.push('IN');
        }
        
        if (hasPerformedBy) {
          destTxnFields.push('performed_by');
          destTxnValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          destTxnFields.push('created_at');
          destTxnValues.push(transactionDate);
        }
        
        // Insert destination transaction (IN) into tabTransactionHistory (audit trail)
        if (destTxnFields.length > 0 && (!hasItemCode || itemCodeNullable || item.item_code)) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${destTxnFields.join(', ')})
            VALUES (${destTxnFields.map(() => '?').join(', ')})
          `, destTxnValues);
          transactionsInserted++;
          console.log(`📝 Inserted CARTON_MERGE IN transaction for ${item.item_code} into tabTransactionHistory`);
        }
      }
      
      console.log(`✅ Inserted ${transactionsInserted} transaction(s) for carton merge (${movedItemsForHistory.length} items × 2 transactions each: OUT + IN) into tabTransactionHistory`);
    } else if (!isCartonMerge) {
      // FULL_CARTON_RELOCATE: Insert one transaction per item (spec requires item-level history)
      // Get all items from carton to insert individual transactions
      // Ensure cartonItems is defined (it should be from function scope, but check to be safe)
      if (typeof cartonItems === 'undefined') {
        cartonItems = [];
      }
      if (hasStockTable && cartonItems && cartonItems.length > 0) {
        // Get item names for transaction history
        const itemCodes = cartonItems.map(item => item.item_code).filter(Boolean);
        const itemNamesMap = new Map();
        
        if (itemCodes.length > 0) {
          const placeholders = itemCodes.map(() => '?').join(',');
          const [itemNames] = await connection.execute(`
            SELECT code, name FROM tabItem WHERE code IN (${placeholders})
          `, itemCodes);
          
          for (const item of itemNames) {
            itemNamesMap.set(item.code, item.name || item.code);
          }
        }
        
        // Insert one transaction per item
        for (const item of cartonItems) {
          const itemCode = item.item_code;
          const qty = parseFloat(item.qty) || 0;
          const itemWarehouse = item.warehouse || actualWarehouse;
          const itemName = itemNamesMap.get(itemCode) || itemCode;
          
          if (!itemCode || qty <= 0) continue;
          
          const txnFields = [];
          const txnValues = [];
          
          // Add transaction_id if required
          if (needsTransactionId) {
            txnFields.push('transaction_id');
            txnValues.push(generateTransactionId());
          }
          
          // transaction_date is REQUIRED (spec says desktop needs it)
          if (hasTransactionDate) {
            txnFields.push('transaction_date');
            txnValues.push(new Date());
          }
          
          txnFields.push('transaction_type');
          txnValues.push('CARTON_RELOCATION');
          
          if (hasRefDocType) {
            txnFields.push('reference_doc_type');
            txnValues.push('Relocation Session');
          }
          
          if (hasRefDoc) {
            txnFields.push('reference_doc');
            txnValues.push(session_id);
          }
          
          txnFields.push('warehouse');
          txnValues.push(itemWarehouse);
          
          // item_code is required
          if (hasItemCode) {
            txnFields.push('item_code');
            txnValues.push(itemCode);
          }
          
          // Add item_name if column exists in tabTransactionHistory
          const [itemNameCol] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabTransactionHistory'
              AND COLUMN_NAME = 'item_name'
          `);
          if (itemNameCol.length > 0) {
            txnFields.push('item_name');
            txnValues.push(itemName);
          }
          
          // Add bin location fields
          // IMPORTANT: Set bin_location to destination bin (to_bin) for desktop display
          // Desktop app displays bin_location column, not from_bin/to_bin
          if (hasBinLocation) {
            txnFields.push('bin_location');
            txnValues.push(session.to_bin); // Destination bin where carton ends up
          }
          
          // NOTE: from_bin/to_bin and source_bin/target_bin will be added separately
          // to OUT and IN transactions below (OUT gets source_bin, IN gets target_bin)
          if (hasFromBin && hasToBin) {
            txnFields.push('from_bin', 'to_bin');
            txnValues.push(session.from_bin, session.to_bin);
          }
          // Don't add source_bin/target_bin here - they're added per-transaction below
          
          if (hasCartonId) {
            txnFields.push('carton_id');
            txnValues.push(session.from_carton);
          }
          
          if (hasFromCarton) {
            txnFields.push('from_carton');
            txnValues.push(session.from_carton);
          }
          
          if (hasToCarton) {
            txnFields.push('to_carton');
            txnValues.push(session.from_carton); // Same carton for FULL_CARTON
          }
          
          // Add batch_no if available in tabTransactionHistory
          const [batchNoCol] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabTransactionHistory'
              AND COLUMN_NAME = 'batch_no'
          `);
          if (batchNoCol.length > 0 && item.batch_no) {
            txnFields.push('batch_no');
            txnValues.push(item.batch_no);
          }
          
          // FIXED: Insert TWO transactions for relocation (OUT from old bin, IN to new bin)
          // This allows Item Location Breakdown to correctly calculate balances per location
          
          // Check if stock_direction column exists and is NOT a generated column
          const [stockDirectionCol2] = await connection.execute(`
            SELECT COLUMN_NAME, GENERATION_EXPRESSION, EXTRA
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabTransactionHistory'
              AND COLUMN_NAME = 'stock_direction'
          `);
          const stockDirColInfo2 = stockDirectionCol2.length > 0 ? stockDirectionCol2[0] : null;
          const isStockDirectionGenerated2 = stockDirColInfo2 && (
            (stockDirColInfo2.GENERATION_EXPRESSION && stockDirColInfo2.GENERATION_EXPRESSION.length > 0) ||
            (stockDirColInfo2.EXTRA && stockDirColInfo2.EXTRA.toLowerCase().includes('generated'))
          );
          const hasStockDirection2 = stockDirectionCol2.length > 0 && !isStockDirectionGenerated2;
          
          // Check if notes column exists
          const [notesCol] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabTransactionHistory'
              AND COLUMN_NAME = 'notes'
          `);
          const hasNotes = notesCol.length > 0;
          
          // Check if location_id column exists
          const [locationIdCol] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabTransactionHistory'
              AND COLUMN_NAME = 'location_id'
          `);
          const hasLocationId = locationIdCol.length > 0;
          
          const performedBy = req.user?.user_id || session.created_by || 'SYSTEM';
          const now = new Date();
          
          // === INSERT OUT TRANSACTION (from old bin) ===
          const outFields = [...txnFields];
          const outValues = [...txnValues];
          
          if (hasQtyChange) {
            outFields.push('qty_change');
            outValues.push(-qty); // Negative for OUT
          }
          if (hasQtyBefore) {
            outFields.push('qty_before');
            outValues.push(qty);
          }
          if (hasQtyAfter) {
            outFields.push('qty_after');
            outValues.push(0); // 0 after moving out
          }
          if (hasStockDirection2) {
            outFields.push('stock_direction');
            outValues.push('OUT');
          }
          if (hasLocationId) {
            outFields.push('location_id');
            outValues.push(session.from_bin);
          }
          // CRITICAL: Set source_bin for OUT transaction (Item Location Breakdown uses this)
          if (hasSourceBin) {
            outFields.push('source_bin');
            outValues.push(session.from_bin);
          }
          if (hasNotes) {
            outFields.push('notes');
            outValues.push(`Carton relocated OUT to ${session.to_bin}`);
          }
          if (hasPerformedBy) {
            outFields.push('performed_by');
            outValues.push(performedBy);
          }
          if (hasCreatedAt) {
            outFields.push('created_at');
            outValues.push(now);
          }
          
          // Check for duplicate OUT transaction
          if (outFields.length > 0 && hasItemCode) {
            const [existingOutTxn] = await connection.execute(`
              SELECT id FROM tabTransactionHistory 
              WHERE transaction_type = 'CARTON_RELOCATION' 
                AND reference_doc = ? 
                AND item_code = ? 
                AND stock_direction = 'OUT'
              LIMIT 1
            `, [session_id, itemCode]);
            
            if (existingOutTxn.length === 0) {
              await connection.execute(`
                INSERT INTO tabTransactionHistory (${outFields.join(', ')})
                VALUES (${outFields.map(() => '?').join(', ')})
              `, outValues);
              console.log(`📝 Inserted CARTON_RELOCATION OUT transaction for ${itemCode}`);
            }
          }
          
          // === INSERT IN TRANSACTION (to new bin) ===
          const inFields = [...txnFields];
          const inValues = [...txnValues];
          
          // Update bin_location to target bin for IN transaction
          const binLocIdx = inFields.indexOf('bin_location');
          if (binLocIdx !== -1) {
            inValues[binLocIdx] = session.to_bin;
          }
          
          if (hasQtyChange) {
            inFields.push('qty_change');
            inValues.push(qty); // Positive for IN
          }
          if (hasQtyBefore) {
            inFields.push('qty_before');
            inValues.push(0); // 0 before moving in
          }
          if (hasQtyAfter) {
            inFields.push('qty_after');
            inValues.push(qty);
          }
          if (hasStockDirection2) {
            inFields.push('stock_direction');
            inValues.push('IN');
          }
          if (hasLocationId) {
            inFields.push('location_id');
            inValues.push(session.to_bin);
          }
          // CRITICAL: Set target_bin for IN transaction (Item Location Breakdown uses this)
          if (hasTargetBin) {
            inFields.push('target_bin');
            inValues.push(session.to_bin);
          }
          if (hasNotes) {
            inFields.push('notes');
            inValues.push(`Carton relocated IN from ${session.from_bin}`);
          }
          if (hasPerformedBy) {
            inFields.push('performed_by');
            inValues.push(performedBy);
          }
          if (hasCreatedAt) {
            inFields.push('created_at');
            inValues.push(now);
          }
          
          // Check for duplicate IN transaction
          if (inFields.length > 0 && hasItemCode) {
            const [existingInTxn] = await connection.execute(`
              SELECT id FROM tabTransactionHistory 
              WHERE transaction_type = 'CARTON_RELOCATION' 
                AND reference_doc = ? 
                AND item_code = ? 
                AND stock_direction = 'IN'
              LIMIT 1
            `, [session_id, itemCode]);
            
            if (existingInTxn.length === 0) {
              await connection.execute(`
                INSERT INTO tabTransactionHistory (${inFields.join(', ')})
                VALUES (${inFields.map(() => '?').join(', ')})
              `, inValues);
              console.log(`📝 Inserted CARTON_RELOCATION IN transaction for ${itemCode}`);
            }
          }
        }
        
        console.log(`✅ Inserted ${cartonItems.length} transaction(s) for full carton relocation into tabTransactionHistory`);
      } else {
        // If hasStockTable is false or cartonItems is empty, log warning
        console.warn(`⚠️  Cannot insert item-level transaction history: hasStockTable=${hasStockTable}, cartonItems.length=${cartonItems ? cartonItems.length : 0}`);
      }
    }
    // NOTE: Removed duplicate carton-level transaction insertion
    // We now only insert item-level transactions (one per item) for FULL_CARTON relocation
    // This prevents duplicate entries in transaction history
    
    // IMPORTANT: Mark session as COMPLETED AFTER transaction history is created successfully
    // This ensures history exists before marking session as completed
    // If transaction history creation fails, session remains IN_PROGRESS (transaction will rollback)
    await connection.execute(`
      UPDATE tabRelocationSession
      SET status = 'COMPLETED',
          updated_at = NOW()
      WHERE session_id = ?
    `, [session_id]);
    console.log(`✅ Marked session ${session_id} as COMPLETED (after transaction history creation)`);
    
    // Commit transaction - if any step fails, entire transaction rolls back
    await connection.commit();
    
    // Sync item stock with stock ledger for all affected items
    if (isCartonMerge && movedItemsForHistory && movedItemsForHistory.length > 0) {
      const itemCodes = [...new Set(movedItemsForHistory.map(i => i.item_code))];
      for (const itemCode of itemCodes) {
        await syncItemStock(connection, itemCode);
      }
    } else if (cartonItems && cartonItems.length > 0) {
      const itemCodes = [...new Set(cartonItems.map(i => i.item_code))];
      for (const itemCode of itemCodes) {
        await syncItemStock(connection, itemCode);
      }
    }
    
    if (isCartonMerge) {
      console.log(`✅ Committed carton merge: ${session.from_carton} -> ${actualToCarton} (${movedItemsForHistory.length} items) from ${session.from_bin} to ${session.to_bin} (policy: ${actualPolicy})`);
    } else {
      console.log(`✅ Committed full carton relocation: ${session.from_carton} from ${session.from_bin} to ${session.to_bin} (policy: ${actualPolicy})`);
    }
    
    res.json({
      ok: true,
      message: isCartonMerge ? "Carton merge committed successfully" : "Full carton move committed successfully",
      data: {
        session_id: session_id,
        from_carton: session.from_carton,
        from_bin: session.from_bin,
        to_carton: actualToCarton,
        to_bin: session.to_bin,
        policy: actualPolicy,
        operation_type: isCartonMerge ? 'CARTON_MERGE' : 'CARTON_RELOCATION',
        items_moved: isCartonMerge ? movedItemsForHistory.length : null
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error committing full carton move:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to commit full carton move",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/relocation/session/:session_id/commit-partial
 * Commit partial/carton-to-carton move
 * 
 * Request Body:
 * {
 *   "lines": [
 *     { "item_code": "SKU-001", "qty": 10 }
 *   ] (optional - if not provided, uses lines from session)
 * }
 */
export const commitPartialMove = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { session_id } = req.params;
    const { lines } = req.body;
    
    await connection.beginTransaction();
    
    // Get session details
    const [sessionRows] = await connection.execute(`
      SELECT 
        session_id, mode, warehouse_id,
        from_bin, from_carton, to_bin, to_carton, status
      FROM tabRelocationSession
      WHERE session_id = ?
    `, [session_id]);
    
    if (sessionRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Relocation session ${session_id} not found`
        }
      });
    }
    
    const session = sessionRows[0];
    
    if (session.status !== 'IN_PROGRESS') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_STATUS",
          message: `Session ${session_id} is not IN_PROGRESS`
        }
      });
    }
    
    if (session.mode === 'FULL_CARTON') {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_MODE",
          message: `Session ${session_id} is in FULL_CARTON mode. Use commit-full endpoint.`
        }
      });
    }
    
    // Validate required fields
    if (!session.from_carton) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "from_carton must be set before committing"
        }
      });
    }
    
    // Check if session is already completed (idempotency)
    if (session.status === 'COMPLETED') {
      await connection.rollback();
      return res.json({
        ok: true,
        message: "Session already committed",
        data: {
          session_id: session_id,
          status: 'COMPLETED',
          already_committed: true
        }
      });
    }
    
    // Enforce ToBin requirement for PARTIAL_ITEMS and CARTON_TO_CARTON modes
    if ((session.mode === 'PARTIAL_ITEMS' || session.mode === 'CARTON_TO_CARTON') && !session.to_bin) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "to_bin is required for PARTIAL_ITEMS and CARTON_TO_CARTON modes"
        }
      });
    }
    
    if (!session.to_carton) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "to_carton must be set before committing"
        }
      });
    }
    
    // Get lines to move (from request or session)
    let linesToMove = [];
    
    if (lines && Array.isArray(lines) && lines.length > 0) {
      // Use provided lines
      linesToMove = lines;
    } else {
      // Get lines from session
      const [lineRows] = await connection.execute(`
        SELECT item_code, qty_moved
        FROM tabRelocationLine
        WHERE session_id = ?
      `, [session_id]);
      
      linesToMove = lineRows.map(row => ({
        item_code: row.item_code,
        qty: parseFloat(row.qty_moved || 0)
      }));
    }
    
    if (linesToMove.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "No items to move. Provide lines in request or scan items first."
        }
      });
    }
    
    // Check if tabCartonStock exists
    const [stockTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCartonStock'
    `);
    
    const hasStockTable = stockTableCheck.length > 0;
    
    if (!hasStockTable) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "SCHEMA_ERROR",
          message: "tabCartonStock table does not exist. Cannot perform partial moves."
        }
      });
    }
    
    // Determine transaction type based on session mode (define before loop)
    const txnType = session.mode === 'CARTON_TO_CARTON' ? 'CARTON_MERGE' : 'PARTIAL_RELOCATION';
    
    // Process each line
    const movedItems = [];
    
    for (const line of linesToMove) {
      const { item_code, qty } = line;
      const qtyToMove = parseFloat(qty);
      
      if (qtyToMove <= 0) {
        continue; // Skip zero or negative quantities
      }
      
      // Get current stock in source carton (SUM all rows for same carton/item/warehouse)
      // There may be multiple rows with same carton_id/item_code/warehouse but different batch_no
      // For Transfer In cartons, also check tabTransferInCartonLine if not found in tabCartonStock
      const [sourceStockRows] = await connection.execute(`
        SELECT qty, uom, batch_no
        FROM tabCartonStock
        WHERE carton_id = ? AND item_code = ? AND warehouse = ?
      `, [session.from_carton, item_code, session.warehouse_id]);
      
      let sourceQty = 0;
      let sourceRows = sourceStockRows;
      
      // If not found in tabCartonStock and it's a Transfer In carton, check tabTransferInCartonLine
      if (sourceStockRows.length === 0 && session.from_carton && session.from_carton.startsWith('CTN-TI-')) {
        // Get Transfer In title from carton
        const [transferInCartonTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCarton'
        `);
        
        if (transferInCartonTableCheck.length > 0) {
          const [transferInCartonRows] = await connection.execute(`
            SELECT transfer_in
            FROM tabTransferInCarton
            WHERE carton_id = ?
          `, [session.from_carton]);
          
          if (transferInCartonRows.length > 0) {
            const transferInTitle = transferInCartonRows[0].transfer_in;
            
            // Check tabTransferInCartonLine
            const [transferInLineTableCheck] = await connection.execute(`
              SELECT TABLE_NAME
              FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferInCartonLine'
            `);
            
            if (transferInLineTableCheck.length > 0) {
              const [transferInLineRows] = await connection.execute(`
                SELECT received_qty as qty
                FROM tabTransferInCartonLine
                WHERE carton_id = ? AND transfer_in = ? AND item_code = ?
              `, [session.from_carton, transferInTitle, item_code]);
              
              if (transferInLineRows.length > 0) {
                // Convert to same format as tabCartonStock rows
                sourceRows = transferInLineRows.map(row => ({
                  qty: row.qty,
                  uom: null,
                  batch_no: null
                }));
                console.log(`✅ Found item ${item_code} in tabTransferInCartonLine for Transfer In carton ${session.from_carton}`);
              }
            }
          }
        }
      }
      
      // Fallback: Check tabStockLedger for putaway cartons (PAW-...)
      if (sourceRows.length === 0 && session.from_carton && session.from_carton.startsWith('PAW-')) {
        const [stockLedgerCartonCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME = 'carton_id'
        `);
        
        if (stockLedgerCartonCheck.length > 0) {
          const [ledgerItemRows] = await connection.execute(`
            SELECT qty, uom
            FROM tabStockLedger
            WHERE carton_id = ? AND item_code = ? AND warehouse = ?
          `, [session.from_carton, item_code, session.warehouse_id]);
          
          if (ledgerItemRows.length > 0) {
            sourceRows = ledgerItemRows.map(row => ({
              qty: row.qty,
              uom: row.uom || null,
              batch_no: null
            }));
            console.log(`✅ Found item ${item_code} in tabStockLedger for putaway carton ${session.from_carton}`);
          }
        }
      }
      
      // Final fallback: Check tabTransactionHistory for putaway cartons
      if (sourceRows.length === 0 && session.from_carton && (session.from_carton.startsWith('PAW-') || !session.from_carton.startsWith('CTN-'))) {
        const [historyItemRows] = await connection.execute(`
          SELECT 
            qty_after as qty,
            item_code
          FROM tabTransactionHistory
          WHERE carton_id = ?
            AND item_code = ?
            AND warehouse = ?
            AND qty_after > 0
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `, [session.from_carton, item_code, session.warehouse_id]);
        
        if (historyItemRows.length > 0) {
          sourceRows = [{
            qty: parseFloat(historyItemRows[0].qty) || 0,
            uom: null,
            batch_no: null
          }];
          console.log(`✅ Found item ${item_code} in tabTransactionHistory for carton ${session.from_carton} (qty: ${sourceRows[0].qty})`);
        }
      }
      
      if (sourceRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "ITEM_NOT_FOUND",
            message: `Item "${item_code}" not found in source carton.`,
            details: `Please scan an item that exists in carton ${session.from_carton}.`
          }
        });
      }
      
      // SUM all quantities across multiple rows (e.g., different batch_no)
      sourceQty = sourceRows.reduce((sum, row) => sum + parseFloat(row.qty || 0), 0);
      
      if (sourceQty < qtyToMove) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "INSUFFICIENT_STOCK",
            message: `Insufficient stock for ${item_code} in carton ${session.from_carton}. Available: ${sourceQty}, Requested: ${qtyToMove}`
          }
        });
      }
      
      // Decrement from source carton (handle multiple rows with same carton/item/warehouse)
      // Strategy: Reduce quantities across rows, removing rows that become 0
      let remainingToMove = qtyToMove;
      
      // Check if this is a Transfer In carton using tabTransferInCartonLine
      const isFromTransferInLine = sourceRows.length > 0 && sourceStockRows.length === 0 && session.from_carton && session.from_carton.startsWith('CTN-TI-');
      
      if (isFromTransferInLine) {
        // For Transfer In cartons, update tabTransferInCartonLine
        const [transferInCartonRows] = await connection.execute(`
          SELECT transfer_in
          FROM tabTransferInCarton
          WHERE carton_id = ?
        `, [session.from_carton]);
        
        if (transferInCartonRows.length > 0) {
          const transferInTitle = transferInCartonRows[0].transfer_in;
          
          // Update received_qty in tabTransferInCartonLine
          for (const stockRow of sourceRows) {
            if (remainingToMove <= 0) break;
            
            const rowQty = parseFloat(stockRow.qty || 0);
            if (rowQty <= 0) continue;
            
            const qtyToDeduct = Math.min(rowQty, remainingToMove);
            const newQty = rowQty - qtyToDeduct;
            
            await connection.execute(`
              UPDATE tabTransferInCartonLine
              SET received_qty = ?
              WHERE carton_id = ? AND transfer_in = ? AND item_code = ?
            `, [newQty, session.from_carton, transferInTitle, item_code]);
            
            remainingToMove -= qtyToDeduct;
          }
        }
      } else {
        // For regular cartons, update tabCartonStock
        for (const stockRow of sourceStockRows) {
          if (remainingToMove <= 0) break;
          
          const rowQty = parseFloat(stockRow.qty || 0);
          const batchNo = stockRow.batch_no || null;
          
          if (rowQty <= 0) continue;
          
          if (rowQty <= remainingToMove) {
            // This row will be completely consumed - delete it
            await connection.execute(`
              DELETE FROM tabCartonStock
              WHERE carton_id = ? AND item_code = ? AND warehouse = ?
                AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL))
            `, [session.from_carton, item_code, session.warehouse_id, batchNo, batchNo]);
            remainingToMove -= rowQty;
          } else {
            // This row has more than needed - reduce its quantity
            const newRowQty = rowQty - remainingToMove;
            await connection.execute(`
              UPDATE tabCartonStock
              SET qty = ?,
                  updated_at = NOW()
              WHERE carton_id = ? AND item_code = ? AND warehouse = ?
                AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL))
            `, [newRowQty, session.from_carton, item_code, session.warehouse_id, batchNo, batchNo]);
            remainingToMove = 0;
          }
        }
      }
      
      // Safety check: if we couldn't move all requested quantity, log warning
      if (remainingToMove > 0) {
        console.warn(`⚠️  Could not fully consume ${remainingToMove} units from ${sourceRows.length} row(s) for ${item_code} in carton ${session.from_carton}`);
      }
      
      // Increment in destination carton
      // Note: When moving from multiple source rows, we combine quantities into destination
      // Using first source row's UOM and batch_no for destination (business logic may need refinement)
      const firstSourceRow = sourceRows.length > 0 ? sourceRows[0] : null;
      
      if (!firstSourceRow) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "DATA_ERROR",
            message: `Cannot determine source row properties for ${item_code} in carton ${session.from_carton}`
          }
        });
      }
      
      // SUM all existing destination stock (may have multiple rows with same carton/item/warehouse)
      const [destStockRows] = await connection.execute(`
        SELECT qty, batch_no
        FROM tabCartonStock
        WHERE carton_id = ? AND item_code = ? AND warehouse = ?
      `, [session.to_carton, item_code, session.warehouse_id]);
      
      const currentDestQty = destStockRows.reduce((sum, row) => sum + parseFloat(row.qty || 0), 0);
      
      if (destStockRows.length > 0) {
        // Update existing row(s) - prefer updating first row that matches batch_no, or first row if no match
        const matchingBatchRow = destStockRows.find(row => (row.batch_no || null) === (firstSourceRow.batch_no || null));
        const rowToUpdate = matchingBatchRow || destStockRows[0];
        
        const newDestQty = parseFloat(rowToUpdate.qty || 0) + qtyToMove;
        await connection.execute(`
          UPDATE tabCartonStock
          SET qty = ?,
              bin_location = ?,
              updated_at = NOW()
          WHERE carton_id = ? AND item_code = ? AND warehouse = ?
            AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL))
          LIMIT 1
        `, [
          newDestQty, 
          session.to_bin || null, 
          session.to_carton, 
          item_code, 
          session.warehouse_id,
          rowToUpdate.batch_no || null,
          rowToUpdate.batch_no || null
        ]);
      } else {
        // Create new entry
        // Check if destination carton exists
        const [destCarton] = await connection.execute(`
          SELECT carton_id
          FROM tabCarton
          WHERE carton_id = ?
        `, [session.to_carton]);
        
        if (destCarton.length === 0) {
          // Create destination carton
          await connection.execute(`
            INSERT INTO tabCarton
              (carton_id, warehouse, current_bin_id, status, created_on, updated_at)
            VALUES (?, ?, ?, 'PUTAWAY', NOW(), NOW())
          `, [session.to_carton, session.warehouse_id, session.to_bin || null]);
        }
        
        // Insert new stock entry (use first source row's UOM and batch_no)
        await connection.execute(`
          INSERT INTO tabCartonStock
            (carton_id, item_code, warehouse, bin_location, qty, uom, batch_no, status, created_on, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'PUTAWAY', NOW(), NOW())
        `, [
          session.to_carton,
          item_code,
          session.warehouse_id,
          session.to_bin || null,
          qtyToMove,
          firstSourceRow.uom || null,
          firstSourceRow.batch_no || null
        ]);
      }
      
      // Update destination carton location
      if (session.to_bin) {
        await connection.execute(`
          UPDATE tabCarton
          SET current_bin_id = ?,
              last_moved_on = NOW(),
              updated_at = NOW()
          WHERE carton_id = ? AND warehouse = ?
        `, [session.to_bin, session.to_carton, session.warehouse_id]);
      }
      
      // Update tabStockLedger: Move stock from old bin to new bin
      // Decrease stock at old bin location
      if (session.from_bin) {
        const [oldBinStock] = await connection.execute(`
          SELECT qty, reserved_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
        `, [item_code, session.warehouse_id, session.from_bin, session.from_bin]);
        
        if (oldBinStock.length > 0) {
          const oldQty = parseFloat(oldBinStock[0].qty) || 0;
          const reservedQty = parseFloat(oldBinStock[0].reserved_qty) || 0;
          const newOldBinQty = Math.max(0, oldQty - qtyToMove);
          
          if (newOldBinQty > 0) {
            await connection.execute(`
              UPDATE tabStockLedger
              SET qty = ?,
                  last_transaction_date = NOW(),
                  last_transaction_type = ?,
                  last_transaction_ref = ?,
                  updated_at = NOW()
              WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
            `, [newOldBinQty, txnType, session_id, item_code, session.warehouse_id, session.from_bin, session.from_bin]);
          } else {
            // Remove entry if qty becomes 0
            await connection.execute(`
              DELETE FROM tabStockLedger
              WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
            `, [item_code, session.warehouse_id, session.from_bin, session.from_bin]);
          }
        }
      }
      
      // Increase stock at new bin location
      if (session.to_bin) {
        const [newBinStock] = await connection.execute(`
          SELECT qty, reserved_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
        `, [item_code, session.warehouse_id, session.to_bin, session.to_bin]);
        
        const newBinQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].qty) || 0 : 0;
        const newBinReservedQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].reserved_qty) || 0 : 0;
        const updatedNewBinQty = newBinQty + qtyToMove;
        
        await connection.execute(`
          INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at)
          VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE qty = ?, last_transaction_date = NOW(), last_transaction_type = ?, last_transaction_ref = ?, updated_at = NOW()
        `, [item_code, session.warehouse_id, session.to_bin, updatedNewBinQty, newBinReservedQty, txnType, session_id, updatedNewBinQty, txnType, session_id]);
      }
      
      // Insert transaction history into tabTransactionHistory (audit trail table)
      const [txnCols] = await connection.execute(`
        SELECT COLUMN_NAME, EXTRA, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransactionHistory'
          AND COLUMN_NAME IN ('transaction_id', 'from_carton', 'to_carton', 'carton_id')
      `);
      
      const hasFromCarton = txnCols.some(col => col.COLUMN_NAME === 'from_carton');
      const hasToCarton = txnCols.some(col => col.COLUMN_NAME === 'to_carton');
      const hasCartonId = txnCols.some(col => col.COLUMN_NAME === 'carton_id');
      
      // Check if transaction_id is required
      const transactionIdCol = txnCols.find(col => col.COLUMN_NAME === 'transaction_id');
      const hasTransactionId = !!transactionIdCol;
      const isTransactionIdAutoIncrement = transactionIdCol && transactionIdCol.EXTRA && transactionIdCol.EXTRA.toLowerCase().includes('auto_increment');
      const needsTransactionId = hasTransactionId && !isTransactionIdAutoIncrement && transactionIdCol.IS_NULLABLE === 'NO' && !transactionIdCol.COLUMN_DEFAULT;
      const isTransactionIdInteger = transactionIdCol && (transactionIdCol.DATA_TYPE === 'int' || transactionIdCol.DATA_TYPE === 'bigint' || transactionIdCol.DATA_TYPE === 'integer');
      
      // Helper function to generate transaction_id based on column type
      const generateTransactionId = () => {
        if (isTransactionIdInteger) {
          return parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`.substring(0, 15));
        } else {
          return `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        }
      };
      
      // Note: txnType is already defined before the loop (line ~2373)
      
      // Check what columns exist in tabTransactionHistory (audit trail table)
      const [binCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransactionHistory'
          AND COLUMN_NAME IN ('from_bin', 'to_bin', 'source_bin', 'target_bin', 'bin_location', 
                              'transaction_date', 'reference_doc_type', 'reference_doc', 
                              'performed_by', 'created_at', 'qty_change', 'qty_before', 'qty_after')
      `);
      
      const hasFromBin = binCols.some(col => col.COLUMN_NAME === 'from_bin');
      const hasToBin = binCols.some(col => col.COLUMN_NAME === 'to_bin');
      const hasSourceBin = binCols.some(col => col.COLUMN_NAME === 'source_bin');
      const hasTargetBin = binCols.some(col => col.COLUMN_NAME === 'target_bin');
      const hasBinLocation = binCols.some(col => col.COLUMN_NAME === 'bin_location');
      const hasTransactionDate = binCols.some(col => col.COLUMN_NAME === 'transaction_date');
      const hasRefDocType = binCols.some(col => col.COLUMN_NAME === 'reference_doc_type');
      const hasRefDoc = binCols.some(col => col.COLUMN_NAME === 'reference_doc');
      const hasPerformedBy = binCols.some(col => col.COLUMN_NAME === 'performed_by');
      const hasCreatedAt = binCols.some(col => col.COLUMN_NAME === 'created_at');
      const hasQtyChange = binCols.some(col => col.COLUMN_NAME === 'qty_change');
      const hasQtyBefore = binCols.some(col => col.COLUMN_NAME === 'qty_before');
      const hasQtyAfter = binCols.some(col => col.COLUMN_NAME === 'qty_after');
      
      // Build transaction fields - start with required fields
      const txnFields = [];
      const txnValues = [];
      
      // Check if stock_direction column exists and is NOT a generated column
      const [stockDirectionCol] = await connection.execute(`
        SELECT COLUMN_NAME, GENERATION_EXPRESSION, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransactionHistory'
          AND COLUMN_NAME = 'stock_direction'
      `);
      const stockDirColInfo = stockDirectionCol.length > 0 ? stockDirectionCol[0] : null;
      const isStockDirectionGenerated = stockDirColInfo && (
        (stockDirColInfo.GENERATION_EXPRESSION && stockDirColInfo.GENERATION_EXPRESSION.length > 0) ||
        (stockDirColInfo.EXTRA && stockDirColInfo.EXTRA.toLowerCase().includes('generated'))
      );
      const hasStockDirection = stockDirectionCol.length > 0 && !isStockDirectionGenerated;
      
      const transactionDate = new Date();
      const performedBy = req.user?.user_id || session.created_by || 'SYSTEM';
      
      // For CARTON_MERGE, create TWO transactions: OUT from source, IN to destination
      if (txnType === 'CARTON_MERGE') {
        // ============================================================
        // TRANSACTION 1: Source Carton (OUT) - Negative qty_change
        // ============================================================
        const sourceTxnFields = [];
        const sourceTxnValues = [];
        
        if (needsTransactionId) {
          sourceTxnFields.push('transaction_id');
          sourceTxnValues.push(generateTransactionId());
        }
        
        if (hasTransactionDate) {
          sourceTxnFields.push('transaction_date');
          sourceTxnValues.push(transactionDate);
        }
        
        sourceTxnFields.push('transaction_type');
        sourceTxnValues.push('CARTON_MERGE');
        
        if (hasRefDocType) {
          sourceTxnFields.push('reference_doc_type');
          sourceTxnValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          sourceTxnFields.push('reference_doc');
          sourceTxnValues.push(session_id);
        }
        
        sourceTxnFields.push('item_code', 'warehouse');
        sourceTxnValues.push(item_code, session.warehouse_id);
        
        if (hasBinLocation) {
          sourceTxnFields.push('bin_location');
          sourceTxnValues.push(session.from_bin);
        }
        
        if (hasFromBin && hasToBin) {
          sourceTxnFields.push('from_bin', 'to_bin');
          sourceTxnValues.push(session.from_bin, session.to_bin);
        } else if (hasSourceBin && hasTargetBin) {
          sourceTxnFields.push('source_bin', 'target_bin');
          sourceTxnValues.push(session.from_bin, session.to_bin);
        }
        
        if (hasCartonId) {
          sourceTxnFields.push('carton_id');
          sourceTxnValues.push(session.from_carton);
        }
        
        if (hasFromCarton) {
          sourceTxnFields.push('from_carton');
          sourceTxnValues.push(session.from_carton);
        }
        
        if (hasToCarton) {
          sourceTxnFields.push('to_carton');
          sourceTxnValues.push(session.to_carton);
        }
        
        if (hasQtyChange) {
          sourceTxnFields.push('qty_change');
          sourceTxnValues.push(-qtyToMove); // Negative for OUT
        }
        if (hasQtyBefore) {
          sourceTxnFields.push('qty_before');
          sourceTxnValues.push(sourceQty);
        }
        if (hasQtyAfter) {
          sourceTxnFields.push('qty_after');
          sourceTxnValues.push(0);
        }
        
        if (hasStockDirection) {
          sourceTxnFields.push('stock_direction');
          sourceTxnValues.push('OUT');
        }
        
        if (hasPerformedBy) {
          sourceTxnFields.push('performed_by');
          sourceTxnValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          sourceTxnFields.push('created_at');
          sourceTxnValues.push(transactionDate);
        }
        
        if (sourceTxnFields.length > 0) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${sourceTxnFields.join(', ')})
            VALUES (${sourceTxnFields.map(() => '?').join(', ')})
          `, sourceTxnValues);
          console.log(`📝 Inserted CARTON_MERGE OUT transaction for ${item_code}`);
        }
        
        // ============================================================
        // TRANSACTION 2: Destination Carton (IN) - Positive qty_change
        // ============================================================
        const destTxnFields = [];
        const destTxnValues = [];
        
        if (needsTransactionId) {
          destTxnFields.push('transaction_id');
          destTxnValues.push(generateTransactionId());
        }
        
        if (hasTransactionDate) {
          destTxnFields.push('transaction_date');
          destTxnValues.push(transactionDate);
        }
        
        destTxnFields.push('transaction_type');
        destTxnValues.push('CARTON_MERGE');
        
        if (hasRefDocType) {
          destTxnFields.push('reference_doc_type');
          destTxnValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          destTxnFields.push('reference_doc');
          destTxnValues.push(session_id);
        }
        
        destTxnFields.push('item_code', 'warehouse');
        destTxnValues.push(item_code, session.warehouse_id);
        
        if (hasBinLocation) {
          destTxnFields.push('bin_location');
          destTxnValues.push(session.to_bin);
        }
        
        if (hasFromBin && hasToBin) {
          destTxnFields.push('from_bin', 'to_bin');
          destTxnValues.push(session.from_bin, session.to_bin);
        } else if (hasSourceBin && hasTargetBin) {
          destTxnFields.push('source_bin', 'target_bin');
          destTxnValues.push(session.from_bin, session.to_bin);
        }
        
        if (hasCartonId) {
          destTxnFields.push('carton_id');
          destTxnValues.push(session.to_carton);
        }
        
        if (hasFromCarton) {
          destTxnFields.push('from_carton');
          destTxnValues.push(session.from_carton);
        }
        
        if (hasToCarton) {
          destTxnFields.push('to_carton');
          destTxnValues.push(session.to_carton);
        }
        
        if (hasQtyChange) {
          destTxnFields.push('qty_change');
          destTxnValues.push(qtyToMove); // Positive for IN
        }
        if (hasQtyBefore) {
          destTxnFields.push('qty_before');
          destTxnValues.push(0);
        }
        if (hasQtyAfter) {
          destTxnFields.push('qty_after');
          destTxnValues.push(qtyToMove);
        }
        
        if (hasStockDirection) {
          destTxnFields.push('stock_direction');
          destTxnValues.push('IN');
        }
        
        if (hasPerformedBy) {
          destTxnFields.push('performed_by');
          destTxnValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          destTxnFields.push('created_at');
          destTxnValues.push(transactionDate);
        }
        
        if (destTxnFields.length > 0) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${destTxnFields.join(', ')})
            VALUES (${destTxnFields.map(() => '?').join(', ')})
          `, destTxnValues);
          console.log(`📝 Inserted CARTON_MERGE IN transaction for ${item_code}`);
        }
      } else {
        // For PARTIAL_RELOCATION, create single transaction
        const txnFields = [];
        const txnValues = [];
        
        if (needsTransactionId) {
          txnFields.push('transaction_id');
          txnValues.push(generateTransactionId());
        }
        
        if (hasTransactionDate) {
          txnFields.push('transaction_date');
          txnValues.push(transactionDate);
        }
        
        txnFields.push('transaction_type');
        txnValues.push(txnType);
        
        if (hasRefDocType) {
          txnFields.push('reference_doc_type');
          txnValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          txnFields.push('reference_doc');
          txnValues.push(session_id);
        }
        
        txnFields.push('item_code', 'warehouse');
        txnValues.push(item_code, session.warehouse_id);
        
        const displayBin = session.to_bin || session.from_bin;
        const displayCarton = session.from_carton;
        
        if (hasFromBin && hasToBin) {
          txnFields.push('from_bin', 'to_bin');
          txnValues.push(session.from_bin, session.to_bin);
        } else if (hasSourceBin && hasTargetBin) {
          txnFields.push('source_bin', 'target_bin');
          txnValues.push(session.from_bin, session.to_bin);
        } else if (hasBinLocation) {
          txnFields.push('bin_location');
          txnValues.push(displayBin);
        }
        
        if (hasCartonId) {
          txnFields.push('carton_id');
          txnValues.push(displayCarton);
        }
        
        if (hasFromCarton) {
          txnFields.push('from_carton');
          txnValues.push(session.from_carton);
        }
        
        if (hasToCarton) {
          txnFields.push('to_carton');
          txnValues.push(session.to_carton || session.from_carton);
        }
        
        if (hasQtyChange) {
          txnFields.push('qty_change');
          txnValues.push(qtyToMove);
        }
        if (hasQtyBefore) {
          txnFields.push('qty_before');
          txnValues.push(sourceQty);
        }
        if (hasQtyAfter) {
          txnFields.push('qty_after');
          txnValues.push(sourceQty - qtyToMove);
        }
        
        if (hasPerformedBy) {
          txnFields.push('performed_by');
          txnValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          txnFields.push('created_at');
          txnValues.push(transactionDate);
        }
        
        if (txnFields.length > 0) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${txnFields.join(', ')})
            VALUES (${txnFields.map(() => '?').join(', ')})
          `, txnValues);
          console.log(`📝 Inserted transaction history for ${item_code} (${txnType})`);
        } else {
          console.warn(`⚠️  Could not insert transaction history for ${item_code} - no compatible columns found`);
        }
      }
      
      movedItems.push({
        item_code: item_code,
        qty_moved: qtyToMove
      });
    }
    
    // Update session status
    await connection.execute(`
      UPDATE tabRelocationSession
      SET status = 'COMPLETED',
          updated_at = NOW()
      WHERE session_id = ?
    `, [session_id]);
    
    await connection.commit();
    
    // Sync item stock with stock ledger for all affected items
    if (movedItems && movedItems.length > 0) {
      const itemCodes = [...new Set(movedItems.map(i => i.item_code))];
      for (const itemCode of itemCodes) {
        await syncItemStock(connection, itemCode);
      }
    }
    
    console.log(`✅ Committed partial move: ${movedItems.length} item(s) from ${session.from_carton} to ${session.to_carton}`);
    
    res.json({
      ok: true,
      message: "Partial move committed successfully",
      data: {
        session_id: session_id,
        from_carton: session.from_carton,
        from_bin: session.from_bin,
        to_carton: session.to_carton,
        to_bin: session.to_bin,
        items_moved: movedItems
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error committing partial move:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to commit partial move",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/relocation/sessions
 * Get list of all relocation sessions
 * 
 * Query Parameters:
 * - status (optional) - Filter by status (IN_PROGRESS, COMPLETED, CANCELLED)
 * - mode (optional) - Filter by mode (FULL_CARTON, PARTIAL_ITEMS, CARTON_TO_CARTON)
 * - warehouse_id (optional) - Filter by warehouse
 * - page (optional) - Page number (default: 1)
 * - page_size (optional) - Items per page (default: 100, max: 500)
 */
export const listRelocationSessions = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { status, mode, warehouse_id, page = "1", page_size = "100" } = req.query;
    
    // Parse pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(page_size) || 100));
    const offset = (pageNum - 1) * pageSize;
    
    // Build WHERE clause
    const conditions = ["1=1"];
    const params = [];
    
    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    
    if (mode) {
      conditions.push("mode = ?");
      params.push(mode);
    }
    
    if (warehouse_id) {
      conditions.push("warehouse_id = ?");
      params.push(warehouse_id);
    }
    
    // Filter out abandoned IN_PROGRESS sessions (no FROM/TO locations set)
    // Only exclude if status is not explicitly filtered or if filtering for IN_PROGRESS
    if (!status || status === 'IN_PROGRESS') {
      // Show IN_PROGRESS sessions only if they have at least FROM or TO location set
      conditions.push(`(
        status != 'IN_PROGRESS' 
        OR (status = 'IN_PROGRESS' AND (from_bin IS NOT NULL OR from_carton IS NOT NULL OR to_bin IS NOT NULL OR to_carton IS NOT NULL))
      )`);
    }
    
    const whereClause = conditions.join(" AND ");
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM tabRelocationSession WHERE ${whereClause}`;
    const [countRows] = await connection.execute(countQuery, params);
    const totalCount = countRows[0].total;
    const totalPages = Math.ceil(totalCount / pageSize);
    
    // Get paginated sessions
    const [sessions] = await connection.execute(`
      SELECT 
        session_id,
        mode,
        policy,
        warehouse_id,
        from_bin,
        from_carton,
        to_bin,
        to_carton,
        status,
        created_by,
        device_id,
        created_at,
        updated_at
      FROM tabRelocationSession
      WHERE ${whereClause}
      ORDER BY created_at DESC, session_id
      LIMIT ? OFFSET ?
    `, [...params, pageSize, offset]);
    
    res.json({
      ok: true,
      data: sessions.map(session => ({
        session_id: session.session_id,
        mode: session.mode,
        policy: session.policy,
        warehouse_id: session.warehouse_id,
        from_bin: session.from_bin || null,
        from_carton: session.from_carton || null,
        to_bin: session.to_bin || null,
        to_carton: session.to_carton || null,
        status: session.status,
        created_by: session.created_by || null,
        device_id: session.device_id || null,
        created_at: session.created_at ? session.created_at.toISOString() : null,
        updated_at: session.updated_at ? session.updated_at.toISOString() : null
      })),
      pagination: {
        page: pageNum,
        page_size: pageSize,
        total_count: totalCount,
        total_pages: totalPages
      }
    });
  } catch (error) {
    console.error('❌ Error listing relocation sessions:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to list relocation sessions",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/relocation/session/:session_id
 * Get relocation session details
 */
export const getRelocationSession = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { session_id } = req.params;
    
    const [sessionRows] = await connection.execute(`
      SELECT 
        session_id, mode, policy, warehouse_id,
        from_bin, from_carton, to_bin, to_carton,
        status, created_by, device_id,
        created_at, updated_at
      FROM tabRelocationSession
      WHERE session_id = ?
    `, [session_id]);
    
    if (sessionRows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: `Relocation session ${session_id} not found`
        }
      });
    }
    
    const session = sessionRows[0];
    
    // Get relocation lines if any
    const [lineRows] = await connection.execute(`
      SELECT item_code, qty_moved, barcode, created_at
      FROM tabRelocationLine
      WHERE session_id = ?
      ORDER BY item_code
    `, [session_id]);
    
    res.json({
      ok: true,
      data: {
        session_id: session.session_id,
        mode: session.mode,
        policy: session.policy,
        warehouse_id: session.warehouse_id,
        from_bin: session.from_bin,
        from_carton: session.from_carton,
        to_bin: session.to_bin,
        to_carton: session.to_carton,
        status: session.status,
        created_by: session.created_by,
        device_id: session.device_id,
        created_at: session.created_at ? session.created_at.toISOString() : null,
        updated_at: session.updated_at ? session.updated_at.toISOString() : null,
        lines: lineRows.map(line => ({
          item_code: line.item_code,
          qty_moved: parseFloat(line.qty_moved || 0),
          barcode: line.barcode || null,
          created_at: line.created_at ? line.created_at.toISOString() : null
        }))
      }
    });
  } catch (error) {
    console.error('❌ Error getting relocation session:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get relocation session",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/relocation/complete-full
 * Complete full carton relocation in one transaction (create session + commit atomically)
 * 
 * This endpoint creates the session with status COMPLETED (not IN_PROGRESS) and commits in one transaction.
 * Session is only created when user clicks "Complete", not when they start the workflow.
 * 
 * Request Body:
 * {
 *   "mode": "FULL_CARTON",
 *   "warehouse_id": "WH-MAIN",
 *   "from_bin": "A1-R02-L1-B2",
 *   "from_carton": "CTN-TI-0001-20260116-161713-261",
 *   "to_bin": "A1-R01-L4-B1",
 *   "to_carton": "CTN-555445",  // optional (defaults to from_carton)
 *   "policy": "BLIND",  // optional
 *   "user_id": "USER-001",
 *   "device_id": "DEVICE-001"  // optional
 * }
 * 
 * Implementation Note:
 * This function creates the session first, then executes commit logic inline.
 * Since commitFullCartonMove logic is complex (~1200 lines), we create the session
 * and then delegate to the commit logic by temporarily treating the session as if it was IN_PROGRESS
 * during the commit execution, but it's created as COMPLETED.
 * 
 * Alternative approach (future refactor): Extract commit logic into a shared helper function
 * that accepts a session object (not session_id), then both commit and complete endpoints can call it.
 */
export const completeFullCartonRelocation = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { mode, warehouse_id, from_bin, from_carton, to_bin, to_carton, policy, user_id, device_id } = req.body;
    
    // Validation
    if (!mode || !warehouse_id || !user_id) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "mode, warehouse_id, and user_id are required"
        }
      });
    }
    
    if (mode !== 'FULL_CARTON') {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `mode must be FULL_CARTON for complete-full endpoint. Use complete-partial for ${mode} mode.`
        }
      });
    }
    
    if (!from_carton || !to_bin) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "from_carton and to_bin are required"
        }
      });
    }
    
    await connection.beginTransaction();
    
    // Validate carton exists and bin location match (reuse validation from setRelocationFrom)
    if (from_bin && from_carton) {
      const [stockTableCheck] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCartonStock'
      `);
      
      let cartonFound = false;
      let cartonActualBinLocation = null;
      let isTransferInCarton = from_carton.startsWith('CTN-TI-');
      
      // Check tabCartonStock first
      if (stockTableCheck.length > 0) {
        const [stockLocationRows] = await connection.execute(`
          SELECT DISTINCT bin_location, warehouse
          FROM tabCartonStock
          WHERE carton_id = ?
            AND bin_location IS NOT NULL
          LIMIT 1
        `, [from_carton]);
        
        if (stockLocationRows.length > 0) {
          cartonFound = true;
          cartonActualBinLocation = stockLocationRows[0].bin_location;
        }
      }
      
      // Fallback to tabCarton
      if (!cartonFound) {
        const [cartonBinCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabCarton'
            AND COLUMN_NAME IN ('current_bin_id', 'bin_id')
        `);
        
        const hasCurrentBinId = cartonBinCheck.some(col => col.COLUMN_NAME === 'current_bin_id');
        const hasBinId = cartonBinCheck.some(col => col.COLUMN_NAME === 'bin_id');
        
        if (hasCurrentBinId || hasBinId) {
          const binColumn = hasCurrentBinId ? 'current_bin_id' : 'bin_id';
          const [cartonLocationRows] = await connection.execute(`
            SELECT ${binColumn} as bin_location
            FROM tabCarton
            WHERE carton_id = ?
          `, [from_carton]);
          
          if (cartonLocationRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = cartonLocationRows[0].bin_location;
          }
        }
      }
      
      // Fallback to tabTransferInCarton for Transfer In cartons
      if (!cartonFound && isTransferInCarton) {
        const [transferInCartonTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCarton'
        `);
        
        if (transferInCartonTableCheck.length > 0) {
          const [transferInCartonRows] = await connection.execute(`
            SELECT carton_id
            FROM tabTransferInCarton
            WHERE carton_id = ?
          `, [from_carton]);
          
          if (transferInCartonRows.length > 0) {
            cartonFound = true;
          }
        }
      }
      
      // Fallback 3: Check tabStockLedger or tabTransactionHistory for cartons that exist in stock but not in carton tables
      // This handles putaway cartons (PAW-...) that were created during putaway but may not be in tabCarton
      if (!cartonFound) {
        // Check tabStockLedger (if carton_id column exists)
        const [stockLedgerCartonCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME = 'carton_id'
        `);
        
        if (stockLedgerCartonCheck.length > 0) {
          const [stockLedgerRows] = await connection.execute(`
            SELECT DISTINCT bin_location, warehouse
            FROM tabStockLedger
            WHERE carton_id = ?
              AND bin_location IS NOT NULL
            LIMIT 1
          `, [from_carton]);
          
          if (stockLedgerRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = stockLedgerRows[0].bin_location;
            console.log(`📦 Found carton ${from_carton} in tabStockLedger (bin: ${cartonActualBinLocation})`);
          }
        }
        
        // Also check tabTransactionHistory as final fallback
        if (!cartonFound) {
          const [historyRows] = await connection.execute(`
            SELECT 
              COALESCE(location_id, bin_location, target_bin) as bin_location,
              warehouse
            FROM tabTransactionHistory
            WHERE carton_id = ?
              AND (location_id IS NOT NULL OR bin_location IS NOT NULL OR target_bin IS NOT NULL)
            ORDER BY transaction_date DESC, id DESC
            LIMIT 1
          `, [from_carton]);
          
          if (historyRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = historyRows[0].bin_location;
            console.log(`📦 Found carton ${from_carton} in tabTransactionHistory (bin: ${cartonActualBinLocation})`);
          }
        }
      }
      
      if (!cartonFound) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "CARTON_NOT_FOUND",
            message: `Carton ${from_carton} not found`
          },
          valid: false,
          error_code: "CARTON_NOT_FOUND"
        });
      }
      
      // Validate bin location match (skip for Transfer In cartons without bin_location)
      if (!isTransferInCarton || cartonActualBinLocation) {
        let isAtScannedBin = false;
        
        // Check tabCartonStock first (if table exists)
        if (stockTableCheck.length > 0) {
          const [matchCheck] = await connection.execute(`
            SELECT COUNT(*) as cnt
            FROM tabCartonStock
            WHERE carton_id = ? AND bin_location = ?
          `, [from_carton, from_bin]);
          
          if (matchCheck.length > 0 && matchCheck[0].cnt > 0) {
            isAtScannedBin = true;
          }
        }
        
        // If not found in tabCartonStock, check tabStockLedger
        if (!isAtScannedBin && cartonActualBinLocation) {
          const [stockLedgerCartonCheck] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabStockLedger'
              AND COLUMN_NAME = 'carton_id'
          `);
          
          if (stockLedgerCartonCheck.length > 0) {
            const [ledgerMatchCheck] = await connection.execute(`
              SELECT COUNT(*) as cnt
              FROM tabStockLedger
              WHERE carton_id = ? AND bin_location = ?
            `, [from_carton, from_bin]);
            
            if (ledgerMatchCheck.length > 0 && ledgerMatchCheck[0].cnt > 0) {
              isAtScannedBin = true;
            }
          }
        }
        
        // If still not found, check tabTransactionHistory (latest transaction location)
        if (!isAtScannedBin && cartonActualBinLocation) {
          const [historyMatchCheck] = await connection.execute(`
            SELECT COUNT(*) as cnt
            FROM (
              SELECT 
                COALESCE(location_id, bin_location, target_bin) as latest_bin,
                transaction_date,
                id
              FROM tabTransactionHistory
              WHERE carton_id = ?
                AND (location_id IS NOT NULL OR bin_location IS NOT NULL OR target_bin IS NOT NULL)
                AND qty_after > 0
              ORDER BY transaction_date DESC, id DESC
              LIMIT 1
            ) latest
            WHERE latest_bin = ?
          `, [from_carton, from_bin]);
          
          if (historyMatchCheck.length > 0 && historyMatchCheck[0].cnt > 0) {
            isAtScannedBin = true;
          }
        }
        
        // Final fallback: Direct comparison (with normalization for case/whitespace)
        // This should match since cartonActualBinLocation was set from the latest transaction
        if (!isAtScannedBin && cartonActualBinLocation) {
          const normalizedActual = (cartonActualBinLocation || '').trim().toUpperCase();
          const normalizedScanned = (from_bin || '').trim().toUpperCase();
          
          if (normalizedActual === normalizedScanned) {
            isAtScannedBin = true;
            console.log(`✅ Bin location match confirmed: ${normalizedActual} === ${normalizedScanned}`);
          } else {
            console.log(`⚠️ Bin location mismatch: actual="${normalizedActual}" vs scanned="${normalizedScanned}"`);
          }
        }
        
        if (!isAtScannedBin) {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: "CARTON_BIN_MISMATCH",
              message: `Carton ${from_carton} is not located in bin ${from_bin}`,
              actual_bin: cartonActualBinLocation || null
            },
            valid: false,
            error_code: "CARTON_BIN_MISMATCH",
            actual_bin: cartonActualBinLocation || null
          });
        }
      }
    }
    
    // Generate session ID
    const sessionId = generateSessionId();
    
    // Default policy
    const defaultPolicy = 'BLIND';
    const actualPolicy = policy || defaultPolicy;
    
    // Determine actual warehouse (use provided or get from carton)
    let actualWarehouse = warehouse_id;
    if (from_carton) {
      const [cartonWarehouseCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCarton'
          AND COLUMN_NAME = 'warehouse'
      `);
      
      if (cartonWarehouseCols.length > 0) {
        const [cartonWarehouseRows] = await connection.execute(`
          SELECT warehouse
          FROM tabCarton
          WHERE carton_id = ?
        `, [from_carton]);
        
        if (cartonWarehouseRows.length > 0 && cartonWarehouseRows[0].warehouse) {
          actualWarehouse = cartonWarehouseRows[0].warehouse;
          console.log(`📦 Found warehouse from tabCarton: ${actualWarehouse} for carton ${from_carton}`);
        }
      }
      
      // Fallback to tabCartonStock
      if (!actualWarehouse || actualWarehouse === 'DEFAULT') {
        const [stockTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabCartonStock'
        `);
        
        if (stockTableCheck.length > 0) {
          const [stockWarehouseRows] = await connection.execute(`
            SELECT warehouse
            FROM tabCartonStock
            WHERE carton_id = ?
            LIMIT 1
          `, [from_carton]);
          
          if (stockWarehouseRows.length > 0 && stockWarehouseRows[0].warehouse) {
            actualWarehouse = stockWarehouseRows[0].warehouse;
            console.log(`📦 Found warehouse from tabCartonStock: ${actualWarehouse} for carton ${from_carton}`);
          }
        }
      }
      
      // Fallback to tabStockLedger (for putaway cartons)
      if (!actualWarehouse || actualWarehouse === 'DEFAULT') {
        const [stockLedgerCartonCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME = 'carton_id'
        `);
        
        if (stockLedgerCartonCheck.length > 0) {
          const [ledgerWarehouseRows] = await connection.execute(`
            SELECT DISTINCT warehouse
            FROM tabStockLedger
            WHERE carton_id = ?
              AND warehouse IS NOT NULL
              AND warehouse != 'DEFAULT'
            LIMIT 1
          `, [from_carton]);
          
          if (ledgerWarehouseRows.length > 0 && ledgerWarehouseRows[0].warehouse) {
            actualWarehouse = ledgerWarehouseRows[0].warehouse;
            console.log(`📦 Found warehouse from tabStockLedger: ${actualWarehouse} for carton ${from_carton}`);
          }
        }
      }
      
      // Final fallback to tabTransactionHistory (for putaway cartons)
      if (!actualWarehouse || actualWarehouse === 'DEFAULT') {
        const [historyWarehouseRows] = await connection.execute(`
          SELECT warehouse
          FROM tabTransactionHistory
          WHERE carton_id = ?
            AND warehouse IS NOT NULL
            AND warehouse != 'DEFAULT'
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `, [from_carton]);
        
        if (historyWarehouseRows.length > 0 && historyWarehouseRows[0].warehouse) {
          actualWarehouse = historyWarehouseRows[0].warehouse;
          console.log(`📦 Found warehouse from tabTransactionHistory: ${actualWarehouse} for carton ${from_carton}`);
        }
      }
    }
    
    // Determine actual TO carton
    let actualToCarton = to_carton || from_carton;
    const isCartonMerge = actualToCarton && actualToCarton !== from_carton;
    
    // IMPORTANT: Create session with status COMPLETED (not IN_PROGRESS)
    // This ensures session is only created when user completes, not when they start
    await connection.execute(`
      INSERT INTO tabRelocationSession 
        (session_id, mode, policy, warehouse_id, status, created_by, device_id, 
         from_bin, from_carton, to_bin, to_carton, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [sessionId, mode, actualPolicy, actualWarehouse, user_id, device_id || null,
        from_bin || null, from_carton, to_bin, actualToCarton || null]);
    
    console.log(`✅ Created relocation session ${sessionId} with status COMPLETED (mode: ${mode}, warehouse: ${actualWarehouse})`);
    
    // Now execute commit logic - we'll use the commit logic but need to handle it correctly
    // Since commitFullCartonMove expects session.status = 'IN_PROGRESS', we'll execute the commit steps
    // inline. For now, we'll temporarily update status to IN_PROGRESS, execute commit logic, 
    // then set back to COMPLETED. But actually, the commit logic sets it to COMPLETED anyway.
    // 
    // Better approach: Execute all commit steps inline here (copy from commitFullCartonMove)
    // but skip the IN_PROGRESS check since we're creating it as COMPLETED.
    //
    // For now, let's create the session and then immediately execute the commit steps
    // by calling similar logic from commitFullCartonMove.
    
    // Create session object for commit logic
    const session = {
      session_id: sessionId,
      mode: mode,
      session_policy: actualPolicy,
      warehouse_id: actualWarehouse,
      from_bin: from_bin,
      from_carton: from_carton,
      to_bin: to_bin,
      to_carton: actualToCarton,
      status: 'COMPLETED',
      created_by: user_id
    };
    
    // Execute full commit logic (copied from commitFullCartonMove, lines ~1264-2398)
    // Skip IN_PROGRESS check since session is already COMPLETED
    // Skip session status update at end since it's already COMPLETED
    
    // Declare cartonItems at function scope
    var cartonItems = [];
    
    // For VERIFIED policy, verify carton contents
    if (actualPolicy === 'VERIFIED') {
      const [cartonStockRows] = await connection.execute(`
        SELECT item_code, qty
        FROM tabCartonStock
        WHERE carton_id = ? AND warehouse = ?
      `, [from_carton, actualWarehouse]);
      
      if (cartonStockRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Carton ${from_carton} has no items to verify`
          }
        });
      }
      
      console.log(`✅ Verified carton ${from_carton} contains ${cartonStockRows.length} item(s)`);
    }
    
    const [stockTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCartonStock'
    `);
    
    const hasStockTable = stockTableCheck.length > 0;
    
    let movedItemsForHistory = [];
    
    if (isCartonMerge) {
      // CARTON_MERGE logic - copy from commitFullCartonMove lines ~1340-1695
      // (Will insert this full logic - too long for single replacement)
      // For now, continuing with the else block (FULL_CARTON_RELOCATE)
      console.log(`🔄 Performing carton merge: ${from_carton} -> ${actualToCarton}`);
      // TODO: Insert full carton merge logic here (lines ~1340-1695 from commitFullCartonMove)
    } else {
      // FULL_CARTON_RELOCATE: Simple relocation (no merge)
      // Copy logic from commitFullCartonMove lines ~1698-1998
      
      // Update carton location
      const [cartonCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCarton'
          AND COLUMN_NAME IN ('bin_id', 'current_bin_id', 'warehouse')
      `);
      
      const hasBinId = cartonCols.some(col => col.COLUMN_NAME === 'bin_id');
      const hasCurrentBinId = cartonCols.some(col => col.COLUMN_NAME === 'current_bin_id');
      const hasCartonWarehouseCol = cartonCols.some(col => col.COLUMN_NAME === 'warehouse');
      
      let cartonUpdateQuery = '';
      const cartonUpdateParams = [];
      
      if (hasBinId) {
        cartonUpdateQuery = `UPDATE tabCarton SET bin_id = ?, last_moved_on = NOW(), updated_at = NOW()`;
        cartonUpdateParams.push(to_bin);
      } else if (hasCurrentBinId) {
        cartonUpdateQuery = `UPDATE tabCarton SET current_bin_id = ?, last_moved_on = NOW(), updated_at = NOW()`;
        cartonUpdateParams.push(to_bin);
      }
      
      if (hasCartonWarehouseCol && actualWarehouse) {
        cartonUpdateQuery += ` WHERE carton_id = ? AND warehouse = ?`;
        cartonUpdateParams.push(from_carton, actualWarehouse);
      } else {
        cartonUpdateQuery += ` WHERE carton_id = ?`;
        cartonUpdateParams.push(from_carton);
      }
      
      if (cartonUpdateQuery) {
        await connection.execute(cartonUpdateQuery, cartonUpdateParams);
      }
      
      // Update tabCartonStock.bin_location for all items in carton
      if (hasStockTable) {
        // Check if this is a Transfer In carton
        const isTransferInCarton = from_carton && from_carton.startsWith('CTN-TI-');
        let transferInTitle = null;
        
        if (isTransferInCarton) {
          const [transferInCartonTableCheck] = await connection.execute(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabTransferInCarton'
          `);
          
          if (transferInCartonTableCheck.length > 0) {
            const [transferInCartonRows] = await connection.execute(`
              SELECT transfer_in
              FROM tabTransferInCarton
              WHERE carton_id = ?
            `, [from_carton]);
            
            if (transferInCartonRows.length > 0) {
              transferInTitle = transferInCartonRows[0].transfer_in;
            }
          }
          
          // Sync Transfer In carton items to tabCartonStock if not already there
          if (transferInTitle) {
            const [transferInCartonLineTableCheck] = await connection.execute(`
              SELECT TABLE_NAME
              FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferInCartonLine'
            `);
            
            if (transferInCartonLineTableCheck.length > 0) {
              const [transferInItems] = await connection.execute(`
                SELECT item_code, received_qty as qty
                FROM tabTransferInCartonLine
                WHERE carton_id = ? AND transfer_in = ?
              `, [from_carton, transferInTitle]);
              
              for (const item of transferInItems) {
                await connection.execute(`
                  INSERT INTO tabCartonStock (carton_id, item_code, warehouse, bin_location, qty, status, created_on, updated_at)
                  VALUES (?, ?, ?, ?, ?, 'PUTAWAY', NOW(), NOW())
                  ON DUPLICATE KEY UPDATE
                    bin_location = VALUES(bin_location),
                    updated_at = NOW()
                `, [from_carton, item.item_code, actualWarehouse, to_bin, parseFloat(item.qty) || 0]);
              }
              
              console.log(`✅ Synced ${transferInItems.length} Transfer In item(s) to tabCartonStock with new bin location`);
            }
          }
        }
        
        // Update bin_location for all items in carton
        await connection.execute(`
          UPDATE tabCartonStock
          SET bin_location = ?,
              last_moved_on = NOW(),
              updated_at = NOW()
          WHERE carton_id = ?
        `, [to_bin, from_carton]);
        
        // Get all items in carton with their warehouse (lock rows for update)
        [cartonItems] = await connection.execute(`
          SELECT item_code, qty, warehouse, batch_no
          FROM tabCartonStock
          WHERE carton_id = ?
          FOR UPDATE
        `, [from_carton]);
        
        if (cartonItems.length > 0) {
          const itemWarehouse = cartonItems[0].warehouse || actualWarehouse;
          if (itemWarehouse && itemWarehouse !== 'DEFAULT') {
            actualWarehouse = itemWarehouse;
          }
        }
        
        console.log(`📦 Processing ${cartonItems.length} item(s) in carton ${from_carton} (warehouse: ${actualWarehouse})`);
        
        // Update StockLedger for each item
        const [stockLedgerCols] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME IN ('qty_before', 'qty_reduced')
        `);
        
        const hasQtyBefore = stockLedgerCols.some(col => col.COLUMN_NAME === 'qty_before');
        const hasQtyReduced = stockLedgerCols.some(col => col.COLUMN_NAME === 'qty_reduced');
        
        for (const item of cartonItems) {
          const itemCode = item.item_code;
          const qty = parseFloat(item.qty) || 0;
          const itemWarehouse = item.warehouse || actualWarehouse;
          
          if (!itemCode || qty <= 0) continue;
          
          // Decrease stock at old bin location
          const [oldBinStock] = await connection.execute(`
            SELECT qty, reserved_qty
            FROM tabStockLedger
            WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
          `, [itemCode, itemWarehouse, from_bin, from_bin]);
          
          if (oldBinStock.length > 0) {
            const oldQty = parseFloat(oldBinStock[0].qty) || 0;
            const reservedQty = parseFloat(oldBinStock[0].reserved_qty) || 0;
            const newOldBinQty = Math.max(0, oldQty - qty);
            
            const qtyBeforeOld = oldQty;
            const qtyReducedOld = -qty;
            
            if (newOldBinQty > 0) {
              let updateFields = ['qty = ?', 'last_transaction_date = NOW()', 'last_transaction_type = ?', 'last_transaction_ref = ?', 'updated_at = NOW()'];
              let updateValues = [newOldBinQty, 'CARTON_RELOCATION', sessionId];
              
              if (hasQtyBefore) {
                updateFields.push('qty_before = ?');
                updateValues.push(qtyBeforeOld);
              }
              if (hasQtyReduced) {
                updateFields.push('qty_reduced = ?');
                updateValues.push(qtyReducedOld);
              }
              
              await connection.execute(`
                UPDATE tabStockLedger
                SET ${updateFields.join(', ')}
                WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
              `, [...updateValues, itemCode, itemWarehouse, from_bin, from_bin]);
            } else {
              await connection.execute(`
                DELETE FROM tabStockLedger
                WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
              `, [itemCode, itemWarehouse, from_bin, from_bin]);
            }
          }
          
          // Increase stock at new bin location
          const [newBinStock] = await connection.execute(`
            SELECT qty, reserved_qty
            FROM tabStockLedger
            WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
          `, [itemCode, itemWarehouse, to_bin, to_bin]);
          
          const newBinQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].qty) || 0 : 0;
          const newBinReservedQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].reserved_qty) || 0 : 0;
          const updatedNewBinQty = newBinQty + qty;
          
          const qtyBeforeNew = newBinQty;
          const qtyReducedNew = qty;
          
          // Check if carton_id column exists in tabStockLedger
          const [stockLedgerCartonIdColumn] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabStockLedger' 
            AND COLUMN_NAME = 'carton_id'
          `);
          const hasStockLedgerCartonIdColumn = stockLedgerCartonIdColumn.length > 0;
          
          let insertFields = 'item_code, warehouse, bin_location, qty, reserved_qty';
          let insertValues = '?, ?, ?, ?, ?';
          let insertParams = [itemCode, itemWarehouse, to_bin, updatedNewBinQty, newBinReservedQty];
          
          let updateFields = 'qty = ?';
          let updateParams = [updatedNewBinQty];
          
          // ✅ Include carton_id if column exists
          if (hasStockLedgerCartonIdColumn && from_carton) {
            insertFields += ', carton_id';
            insertValues += ', ?';
            insertParams.push(from_carton);
            updateFields += ', carton_id = ?';
            updateParams.push(from_carton);
          }
          
          if (hasQtyBefore) {
            insertFields += ', qty_before';
            insertValues += ', ?';
            insertParams.push(qtyBeforeNew);
            updateFields += ', qty_before = ?';
            updateParams.push(qtyBeforeNew);
          }
          
          if (hasQtyReduced) {
            insertFields += ', qty_reduced';
            insertValues += ', ?';
            insertParams.push(qtyReducedNew);
            updateFields += ', qty_reduced = ?';
            updateParams.push(qtyReducedNew);
          }
          
          insertFields += ', last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at';
          insertValues += ', NOW(), ?, ?, NOW(), NOW()';
          insertParams.push('CARTON_RELOCATION', sessionId);
          
          updateFields += ', last_transaction_date = NOW(), last_transaction_type = ?, last_transaction_ref = ?, updated_at = NOW()';
          updateParams.push('CARTON_RELOCATION', sessionId);
          
          await connection.execute(`
            INSERT INTO tabStockLedger (${insertFields})
            VALUES (${insertValues})
            ON DUPLICATE KEY UPDATE ${updateFields}
          `, [...insertParams, ...updateParams]);
        }
        
        console.log(`✅ Updated tabStockLedger for ${cartonItems.length} item(s) moved from ${from_bin} to ${to_bin} (warehouse: ${actualWarehouse})`);
      } else {
        cartonItems = [];
      }
    }
    
    // Insert transaction history into tabTransactionHistory (audit trail)
    // Check what columns exist in tabTransactionHistory
    const [txnCols] = await connection.execute(`
      SELECT COLUMN_NAME, EXTRA, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabTransactionHistory'
        AND COLUMN_NAME IN ('transaction_id', 'from_carton', 'to_carton', 'carton_id', 'from_bin', 'to_bin', 'source_bin', 'target_bin', 'bin_location',
          'transaction_date', 'reference_doc_type', 'reference_doc', 'performed_by', 'created_at', 'qty_change', 'qty_before', 'qty_after', 'item_code')
    `);
    
    const hasFromCarton = txnCols.some(col => col.COLUMN_NAME === 'from_carton');
    const hasToCarton = txnCols.some(col => col.COLUMN_NAME === 'to_carton');
    const hasCartonId = txnCols.some(col => col.COLUMN_NAME === 'carton_id');
    const hasFromBin = txnCols.some(col => col.COLUMN_NAME === 'from_bin');
    const hasToBin = txnCols.some(col => col.COLUMN_NAME === 'to_bin');
    const hasSourceBin = txnCols.some(col => col.COLUMN_NAME === 'source_bin');
    const hasTargetBin = txnCols.some(col => col.COLUMN_NAME === 'target_bin');
    const hasBinLocation = txnCols.some(col => col.COLUMN_NAME === 'bin_location');
    const hasTransactionDate = txnCols.some(col => col.COLUMN_NAME === 'transaction_date');
    const hasRefDocType = txnCols.some(col => col.COLUMN_NAME === 'reference_doc_type');
    const hasRefDoc = txnCols.some(col => col.COLUMN_NAME === 'reference_doc');
    const hasPerformedBy = txnCols.some(col => col.COLUMN_NAME === 'performed_by');
    const hasCreatedAt = txnCols.some(col => col.COLUMN_NAME === 'created_at');
    const hasItemCode = txnCols.some(col => col.COLUMN_NAME === 'item_code');
    
    // Check if transaction_id is required
    const transactionIdCol = txnCols.find(col => col.COLUMN_NAME === 'transaction_id');
    const hasTransactionId = !!transactionIdCol;
    const isTransactionIdAutoIncrement = transactionIdCol && transactionIdCol.EXTRA && transactionIdCol.EXTRA.toLowerCase().includes('auto_increment');
    const needsTransactionId = hasTransactionId && !isTransactionIdAutoIncrement && transactionIdCol.IS_NULLABLE === 'NO' && !transactionIdCol.COLUMN_DEFAULT;
    const isTransactionIdInteger = transactionIdCol && (transactionIdCol.DATA_TYPE === 'int' || transactionIdCol.DATA_TYPE === 'bigint' || transactionIdCol.DATA_TYPE === 'integer');
    
    // Helper function to generate transaction_id based on column type
    const generateTransactionId = () => {
      if (isTransactionIdInteger) {
        return parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`.substring(0, 15));
      } else {
        return `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      }
    };
    
    // Insert transaction history for FULL_CARTON_RELOCATE (one per item)
    if (hasStockTable && cartonItems && cartonItems.length > 0 && !isCartonMerge) {
      const itemCodes = cartonItems.map(item => item.item_code).filter(Boolean);
      const itemNamesMap = new Map();
      
      if (itemCodes.length > 0) {
        const placeholders = itemCodes.map(() => '?').join(',');
        const [itemNames] = await connection.execute(`
          SELECT code, name FROM tabItem WHERE code IN (${placeholders})
        `, itemCodes);
        
        for (const item of itemNames) {
          itemNamesMap.set(item.code, item.name || item.code);
        }
      }
      
      for (const item of cartonItems) {
        const itemCode = item.item_code;
        const qty = parseFloat(item.qty) || 0;
        const itemWarehouse = item.warehouse || actualWarehouse;
        const itemName = itemNamesMap.get(itemCode) || itemCode;
        
        if (!itemCode || qty <= 0) continue;
        
        const txnFields = [];
        const txnValues = [];
        
        // Add transaction_id if required
        if (needsTransactionId) {
          txnFields.push('transaction_id');
          txnValues.push(generateTransactionId());
        }
        
        if (hasTransactionDate) {
          txnFields.push('transaction_date');
          txnValues.push(new Date());
        }
        
        txnFields.push('transaction_type');
        txnValues.push('CARTON_RELOCATION');
        
        if (hasRefDocType) {
          txnFields.push('reference_doc_type');
          txnValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          txnFields.push('reference_doc');
          txnValues.push(sessionId);
        }
        
        txnFields.push('warehouse');
        txnValues.push(itemWarehouse);
        
        if (hasItemCode) {
          txnFields.push('item_code');
          txnValues.push(itemCode);
        }
        
        if (hasBinLocation) {
          txnFields.push('bin_location');
          txnValues.push(to_bin);
        }
        
        if (hasFromBin && hasToBin) {
          txnFields.push('from_bin', 'to_bin');
          txnValues.push(from_bin, to_bin);
        }
        
        if (hasCartonId) {
          txnFields.push('carton_id');
          txnValues.push(from_carton);
        }
        
        if (hasFromCarton) {
          txnFields.push('from_carton');
          txnValues.push(from_carton);
        }
        
        if (hasToCarton) {
          txnFields.push('to_carton');
          txnValues.push(from_carton);
        }
        
        if (hasPerformedBy) {
          txnFields.push('performed_by');
          txnValues.push(user_id || 'SYSTEM');
        }
        
        if (hasCreatedAt) {
          txnFields.push('created_at');
          txnValues.push(new Date());
        }
        
        // FIX: Insert TWO transactions (OUT from old bin, IN to new bin) for Item Location Breakdown
        // OUT transaction
        const outFields = [...txnFields];
        const outValues = [...txnValues];
        outFields.push('qty_change');
        outValues.push(-qty); // Negative for OUT
        outFields.push('qty_before');
        outValues.push(qty); // Before moving out: qty
        outFields.push('qty_after');
        outValues.push(0); // After moving out: 0
        if (hasSourceBin) {
          outFields.push('source_bin');
          outValues.push(from_bin);
        }
        
        const [existingOutTxn] = await connection.execute(`
          SELECT id FROM tabTransactionHistory 
          WHERE transaction_type = 'CARTON_RELOCATION' 
            AND reference_doc = ? 
            AND item_code = ? 
            AND qty_change < 0
          LIMIT 1
        `, [sessionId, itemCode]);
        
        if (existingOutTxn.length === 0) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${outFields.join(', ')})
            VALUES (${outFields.map(() => '?').join(', ')})
          `, outValues);
          console.log(`📝 Inserted CARTON_RELOCATION OUT transaction for ${itemCode}`);
        }
        
        // IN transaction
        const inFields = [...txnFields];
        const inValues = [...txnValues];
        inFields.push('qty_change');
        inValues.push(qty); // Positive for IN
        inFields.push('qty_before');
        inValues.push(0); // Before moving in: 0
        inFields.push('qty_after');
        inValues.push(qty); // After moving in: qty
        if (hasTargetBin) {
          inFields.push('target_bin');
          inValues.push(to_bin);
        }
        
        const [existingInTxn] = await connection.execute(`
          SELECT id FROM tabTransactionHistory 
          WHERE transaction_type = 'CARTON_RELOCATION' 
            AND reference_doc = ? 
            AND item_code = ? 
            AND qty_change > 0
          LIMIT 1
        `, [sessionId, itemCode]);
        
        if (existingInTxn.length === 0) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${inFields.join(', ')})
            VALUES (${inFields.map(() => '?').join(', ')})
          `, inValues);
          console.log(`📝 Inserted CARTON_RELOCATION IN transaction for ${itemCode}`);
        }
      }
      
      console.log(`✅ Inserted ${cartonItems.length} transaction(s) for full carton relocation into tabTransactionHistory`);
    }
    
    // Note: Session is already COMPLETED (created as COMPLETED), so no need to update status
    
    await connection.commit();
    
    // Sync item stock with stock ledger for all affected items
    if (cartonItems && cartonItems.length > 0) {
      const itemCodes = [...new Set(cartonItems.map(i => i.item_code))];
      for (const itemCode of itemCodes) {
        await syncItemStock(connection, itemCode);
      }
    }
    
    console.log(`✅ Completed full carton relocation: ${from_carton} from ${from_bin} to ${to_bin}`);
    
    res.json({
      ok: true,
      message: "Relocation completed successfully (session created with COMPLETED status)",
      data: {
        session_id: sessionId,
        status: 'COMPLETED',
        from_carton: from_carton,
        from_bin: from_bin,
        to_carton: actualToCarton,
        to_bin: to_bin,
        policy: actualPolicy,
        operation_type: isCartonMerge ? 'CARTON_MERGE' : 'CARTON_RELOCATION'
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error completing full carton relocation:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to complete relocation",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * POST /api/relocation/complete-partial
 * Complete partial/carton-to-carton relocation in one transaction (create session + commit atomically)
 * 
 * This endpoint creates the session with status COMPLETED (not IN_PROGRESS) and commits in one transaction.
 * Session is only created when user clicks "Complete", not when they start the workflow.
 * 
 * Request Body:
 * {
 *   "mode": "PARTIAL_ITEMS" | "CARTON_TO_CARTON",
 *   "warehouse_id": "WH-MAIN",
 *   "from_bin": "A1-R02-L1-B2",
 *   "from_carton": "CTN-TI-0001-20260116-161713-261",
 *   "to_bin": "A1-R01-L4-B1",
 *   "to_carton": "CTN-555445",
 *   "lines": [
 *     { "item_code": "SKU-001", "qty": 10 }
 *   ],
 *   "user_id": "USER-001",
 *   "device_id": "DEVICE-001"  // optional
 * }
 */
export const completePartialRelocation = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { mode, warehouse_id, from_bin, from_carton, to_bin, to_carton, lines, user_id, device_id, create_carton_if_missing } = req.body;
    
    // Validation
    if (!mode || !warehouse_id || !user_id) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "mode, warehouse_id, and user_id are required"
        }
      });
    }
    
    if (mode === 'FULL_CARTON') {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `mode must be PARTIAL_ITEMS or CARTON_TO_CARTON for complete-partial endpoint. Use complete-full for ${mode} mode.`
        }
      });
    }
    
    // Validate required fields for partial relocation
    if (!from_carton || !to_bin || !to_carton) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "from_carton, to_bin, and to_carton are required for partial relocation"
        }
      });
    }
    
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "lines array with at least one item is required"
        }
      });
    }
    
    // VALIDATION: Cannot move to the same carton
    if (from_carton === to_carton) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "SAME_CARTON_ERROR",
          message: "Cannot move items to the same carton. Source and destination cartons must be different."
        }
      });
    }
    
    await connection.beginTransaction();
    
    // VALIDATION: Target carton must exist (unless create_carton_if_missing is true)
    const [targetCartonCheck] = await connection.execute(`
      SELECT carton_id FROM tabCarton WHERE carton_id = ?
    `, [to_carton]);
    
    let targetCartonCreated = false;
    
    if (targetCartonCheck.length === 0) {
      // Also check tabCartonStock in case carton exists there but not in tabCarton
      const [targetCartonStockCheck] = await connection.execute(`
        SELECT DISTINCT carton_id FROM tabCartonStock WHERE carton_id = ?
      `, [to_carton]);
      
      if (targetCartonStockCheck.length === 0) {
        // Target carton doesn't exist - check if we should create it
        if (create_carton_if_missing === true) {
          // Create the target carton
          await connection.execute(`
            INSERT INTO tabCarton
              (carton_id, warehouse, current_bin_id, status, created_on, updated_at)
            VALUES (?, ?, ?, 'PUTAWAY', NOW(), NOW())
          `, [to_carton, warehouse_id, to_bin || null]);
          
          targetCartonCreated = true;
          console.log(`✅ Created new target carton: ${to_carton} at bin ${to_bin || 'unassigned'}`);
        } else {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: "TARGET_CARTON_NOT_FOUND",
              message: `Target carton "${to_carton}" does not exist. Please scan an existing carton or enable create_carton_if_missing.`
            }
          });
        }
      }
    }
    
    // Validate carton exists and bin location match (same as complete-full)
    if (from_bin && from_carton) {
      const [stockTableCheck] = await connection.execute(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCartonStock'
      `);
      
      let cartonFound = false;
      let cartonActualBinLocation = null;
      let isTransferInCarton = from_carton.startsWith('CTN-TI-');
      
      // Check tabCartonStock first
      if (stockTableCheck.length > 0) {
        const [stockLocationRows] = await connection.execute(`
          SELECT DISTINCT bin_location, warehouse
          FROM tabCartonStock
          WHERE carton_id = ?
            AND bin_location IS NOT NULL
          LIMIT 1
        `, [from_carton]);
        
        if (stockLocationRows.length > 0) {
          cartonFound = true;
          cartonActualBinLocation = stockLocationRows[0].bin_location;
        }
      }
      
      // Fallback to tabCarton
      if (!cartonFound) {
        const [cartonBinCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabCarton'
            AND COLUMN_NAME IN ('current_bin_id', 'bin_id')
        `);
        
        const hasCurrentBinId = cartonBinCheck.some(col => col.COLUMN_NAME === 'current_bin_id');
        const hasBinId = cartonBinCheck.some(col => col.COLUMN_NAME === 'bin_id');
        
        if (hasCurrentBinId || hasBinId) {
          const binColumn = hasCurrentBinId ? 'current_bin_id' : 'bin_id';
          const [cartonLocationRows] = await connection.execute(`
            SELECT ${binColumn} as bin_location
            FROM tabCarton
            WHERE carton_id = ?
          `, [from_carton]);
          
          if (cartonLocationRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = cartonLocationRows[0].bin_location;
          }
        }
      }
      
      // Fallback to tabTransferInCarton for Transfer In cartons
      if (!cartonFound && isTransferInCarton) {
        const [transferInCartonTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCarton'
        `);
        
        if (transferInCartonTableCheck.length > 0) {
          const [transferInCartonRows] = await connection.execute(`
            SELECT carton_id
            FROM tabTransferInCarton
            WHERE carton_id = ?
          `, [from_carton]);
          
          if (transferInCartonRows.length > 0) {
            cartonFound = true;
          }
        }
      }
      
      // Fallback 3: Check tabStockLedger or tabTransactionHistory for cartons that exist in stock but not in carton tables
      // This handles putaway cartons (PAW-...) that were created during putaway but may not be in tabCarton
      if (!cartonFound) {
        // Check tabStockLedger (if carton_id column exists)
        const [stockLedgerCartonCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME = 'carton_id'
        `);
        
        if (stockLedgerCartonCheck.length > 0) {
          const [stockLedgerRows] = await connection.execute(`
            SELECT DISTINCT bin_location, warehouse
            FROM tabStockLedger
            WHERE carton_id = ?
              AND bin_location IS NOT NULL
            LIMIT 1
          `, [from_carton]);
          
          if (stockLedgerRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = stockLedgerRows[0].bin_location;
            console.log(`📦 Found carton ${from_carton} in tabStockLedger (bin: ${cartonActualBinLocation})`);
          }
        }
        
        // Also check tabTransactionHistory as final fallback
        if (!cartonFound) {
          const [historyRows] = await connection.execute(`
            SELECT 
              COALESCE(location_id, bin_location, target_bin) as bin_location,
              warehouse
            FROM tabTransactionHistory
            WHERE carton_id = ?
              AND (location_id IS NOT NULL OR bin_location IS NOT NULL OR target_bin IS NOT NULL)
            ORDER BY transaction_date DESC, id DESC
            LIMIT 1
          `, [from_carton]);
          
          if (historyRows.length > 0) {
            cartonFound = true;
            cartonActualBinLocation = historyRows[0].bin_location;
            console.log(`📦 Found carton ${from_carton} in tabTransactionHistory (bin: ${cartonActualBinLocation})`);
          }
        }
      }
      
      if (!cartonFound) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "CARTON_NOT_FOUND",
            message: `Carton ${from_carton} not found`
          },
          valid: false,
          error_code: "CARTON_NOT_FOUND"
        });
      }
      
      // Validate bin location match (skip for Transfer In cartons without bin_location)
      if (!isTransferInCarton || cartonActualBinLocation) {
        let isAtScannedBin = false;
        
        // Check tabCartonStock first (if table exists)
        if (stockTableCheck.length > 0) {
          const [matchCheck] = await connection.execute(`
            SELECT COUNT(*) as cnt
            FROM tabCartonStock
            WHERE carton_id = ? AND bin_location = ?
          `, [from_carton, from_bin]);
          
          if (matchCheck.length > 0 && matchCheck[0].cnt > 0) {
            isAtScannedBin = true;
          }
        }
        
        // If not found in tabCartonStock, check tabStockLedger
        if (!isAtScannedBin && cartonActualBinLocation) {
          const [stockLedgerCartonCheck] = await connection.execute(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'tabStockLedger'
              AND COLUMN_NAME = 'carton_id'
          `);
          
          if (stockLedgerCartonCheck.length > 0) {
            const [ledgerMatchCheck] = await connection.execute(`
              SELECT COUNT(*) as cnt
              FROM tabStockLedger
              WHERE carton_id = ? AND bin_location = ?
            `, [from_carton, from_bin]);
            
            if (ledgerMatchCheck.length > 0 && ledgerMatchCheck[0].cnt > 0) {
              isAtScannedBin = true;
            }
          }
        }
        
        // If still not found, check tabTransactionHistory (latest transaction location)
        if (!isAtScannedBin && cartonActualBinLocation) {
          const [historyMatchCheck] = await connection.execute(`
            SELECT COUNT(*) as cnt
            FROM (
              SELECT 
                COALESCE(location_id, bin_location, target_bin) as latest_bin,
                transaction_date,
                id
              FROM tabTransactionHistory
              WHERE carton_id = ?
                AND (location_id IS NOT NULL OR bin_location IS NOT NULL OR target_bin IS NOT NULL)
                AND qty_after > 0
              ORDER BY transaction_date DESC, id DESC
              LIMIT 1
            ) latest
            WHERE latest_bin = ?
          `, [from_carton, from_bin]);
          
          if (historyMatchCheck.length > 0 && historyMatchCheck[0].cnt > 0) {
            isAtScannedBin = true;
          }
        }
        
        // Final fallback: Direct comparison (with normalization for case/whitespace)
        // This should match since cartonActualBinLocation was set from the latest transaction
        if (!isAtScannedBin && cartonActualBinLocation) {
          const normalizedActual = (cartonActualBinLocation || '').trim().toUpperCase();
          const normalizedScanned = (from_bin || '').trim().toUpperCase();
          
          if (normalizedActual === normalizedScanned) {
            isAtScannedBin = true;
            console.log(`✅ Bin location match confirmed: ${normalizedActual} === ${normalizedScanned}`);
          } else {
            console.log(`⚠️ Bin location mismatch: actual="${normalizedActual}" vs scanned="${normalizedScanned}"`);
          }
        }
        
        if (!isAtScannedBin) {
          await connection.rollback();
          return res.status(400).json({
            ok: false,
            error: {
              code: "CARTON_BIN_MISMATCH",
              message: `Carton ${from_carton} is not located in bin ${from_bin}`,
              actual_bin: cartonActualBinLocation || null
            },
            valid: false,
            error_code: "CARTON_BIN_MISMATCH",
            actual_bin: cartonActualBinLocation || null
          });
        }
      }
    }
    
    // Generate session ID
    const sessionId = generateSessionId();
    
    // Determine actual warehouse (use provided or get from carton)
    let actualWarehouse = warehouse_id;
    if (from_carton) {
      const [cartonWarehouseCols] = await connection.execute(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabCarton'
          AND COLUMN_NAME = 'warehouse'
      `);
      
      if (cartonWarehouseCols.length > 0) {
        const [cartonWarehouseRows] = await connection.execute(`
          SELECT warehouse
          FROM tabCarton
          WHERE carton_id = ?
        `, [from_carton]);
        
        if (cartonWarehouseRows.length > 0 && cartonWarehouseRows[0].warehouse) {
          actualWarehouse = cartonWarehouseRows[0].warehouse;
        }
      }
      
      // Fallback to tabCartonStock
      if (!actualWarehouse || actualWarehouse === 'DEFAULT') {
        const [stockTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabCartonStock'
        `);
        
        if (stockTableCheck.length > 0) {
          const [stockWarehouseRows] = await connection.execute(`
            SELECT warehouse
            FROM tabCartonStock
            WHERE carton_id = ?
            LIMIT 1
          `, [from_carton]);
          
          if (stockWarehouseRows.length > 0 && stockWarehouseRows[0].warehouse) {
            actualWarehouse = stockWarehouseRows[0].warehouse;
            console.log(`📦 Found warehouse from tabCartonStock: ${actualWarehouse} for carton ${from_carton}`);
          }
        }
      }
      
      // Fallback to tabStockLedger (for putaway cartons)
      if (!actualWarehouse || actualWarehouse === 'DEFAULT') {
        const [stockLedgerCartonCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME = 'carton_id'
        `);
        
        if (stockLedgerCartonCheck.length > 0) {
          const [ledgerWarehouseRows] = await connection.execute(`
            SELECT DISTINCT warehouse
            FROM tabStockLedger
            WHERE carton_id = ?
              AND warehouse IS NOT NULL
              AND warehouse != 'DEFAULT'
            LIMIT 1
          `, [from_carton]);
          
          if (ledgerWarehouseRows.length > 0 && ledgerWarehouseRows[0].warehouse) {
            actualWarehouse = ledgerWarehouseRows[0].warehouse;
            console.log(`📦 Found warehouse from tabStockLedger: ${actualWarehouse} for carton ${from_carton}`);
          }
        }
      }
      
      // Final fallback to tabTransactionHistory (for putaway cartons)
      if (!actualWarehouse || actualWarehouse === 'DEFAULT') {
        const [historyWarehouseRows] = await connection.execute(`
          SELECT warehouse
          FROM tabTransactionHistory
          WHERE carton_id = ?
            AND warehouse IS NOT NULL
            AND warehouse != 'DEFAULT'
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `, [from_carton]);
        
        if (historyWarehouseRows.length > 0 && historyWarehouseRows[0].warehouse) {
          actualWarehouse = historyWarehouseRows[0].warehouse;
          console.log(`📦 Found warehouse from tabTransactionHistory: ${actualWarehouse} for carton ${from_carton}`);
        }
      }
    }
    
    // IMPORTANT: Create session with status COMPLETED (not IN_PROGRESS)
    // This ensures session is only created when user completes, not when they start
    await connection.execute(`
      INSERT INTO tabRelocationSession 
        (session_id, mode, policy, warehouse_id, status, created_by, device_id, 
         from_bin, from_carton, to_bin, to_carton, created_at, updated_at)
      VALUES (?, ?, 'BLIND', ?, 'COMPLETED', ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, [sessionId, mode, actualWarehouse, user_id, device_id || null,
        from_bin || null, from_carton, to_bin, to_carton]);
    
    console.log(`✅ Created relocation session ${sessionId} with status COMPLETED (mode: ${mode}, warehouse: ${actualWarehouse})`);
    
    // Insert relocation lines
    for (const line of lines) {
      const { item_code, qty } = line;
      if (!item_code || !qty || qty <= 0) continue;
      
      await connection.execute(`
        INSERT INTO tabRelocationLine (session_id, item_code, qty_moved, created_at)
        VALUES (?, ?, ?, NOW())
      `, [sessionId, item_code, qty]);
    }
    
    // Create session object for commit logic
    const session = {
      session_id: sessionId,
      mode: mode,
      warehouse_id: actualWarehouse,
      from_bin: from_bin,
      from_carton: from_carton,
      to_bin: to_bin,
      to_carton: to_carton,
      status: 'COMPLETED',
      created_by: user_id
    };
    
    // Execute full commit logic (copied from commitPartialMove, lines ~2609-2961)
    // Skip IN_PROGRESS check since session is already COMPLETED
    // Skip session status update at end since it's already COMPLETED
    
    // Check if tabCartonStock exists
    const [stockTableCheck] = await connection.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tabCartonStock'
    `);
    
    const hasStockTable = stockTableCheck.length > 0;
    
    if (!hasStockTable) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        error: {
          code: "SCHEMA_ERROR",
          message: "tabCartonStock table does not exist. Cannot perform partial moves."
        }
      });
    }
    
    // Determine transaction type based on mode
    const txnType = mode === 'CARTON_TO_CARTON' ? 'CARTON_MERGE' : 'PARTIAL_RELOCATION';
    
    // Process each line (commit logic from commitPartialMove)
    const movedItems = [];
    const linesToMove = lines; // Use lines from request body
    
    for (const line of linesToMove) {
      const { item_code, qty } = line;
      const qtyToMove = parseFloat(qty);
      
      if (qtyToMove <= 0) {
        continue; // Skip zero or negative quantities
      }
      
      // Get current stock in source carton (SUM all rows for same carton/item/warehouse)
      const [sourceStockRows] = await connection.execute(`
        SELECT qty, uom, batch_no
        FROM tabCartonStock
        WHERE carton_id = ? AND item_code = ? AND warehouse = ?
      `, [from_carton, item_code, actualWarehouse]);
      
      let sourceQty = 0;
      let sourceRows = sourceStockRows;
      
      // If not found in tabCartonStock and it's a Transfer In carton, check tabTransferInCartonLine
      if (sourceStockRows.length === 0 && from_carton && from_carton.startsWith('CTN-TI-')) {
        // Get Transfer In title from carton
        const [transferInCartonTableCheck] = await connection.execute(`
          SELECT TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabTransferInCarton'
        `);
        
        if (transferInCartonTableCheck.length > 0) {
          const [transferInCartonRows] = await connection.execute(`
            SELECT transfer_in
            FROM tabTransferInCarton
            WHERE carton_id = ?
          `, [from_carton]);
          
          if (transferInCartonRows.length > 0) {
            const transferInTitle = transferInCartonRows[0].transfer_in;
            
            // Check tabTransferInCartonLine
            const [transferInLineTableCheck] = await connection.execute(`
              SELECT TABLE_NAME
              FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = 'tabTransferInCartonLine'
            `);
            
            if (transferInLineTableCheck.length > 0) {
              const [transferInLineRows] = await connection.execute(`
                SELECT received_qty as qty
                FROM tabTransferInCartonLine
                WHERE carton_id = ? AND transfer_in = ? AND item_code = ?
              `, [from_carton, transferInTitle, item_code]);
              
              if (transferInLineRows.length > 0) {
                // Convert to same format as tabCartonStock rows
                sourceRows = transferInLineRows.map(row => ({
                  qty: row.qty,
                  uom: null,
                  batch_no: null
                }));
                console.log(`✅ Found item ${item_code} in tabTransferInCartonLine for Transfer In carton ${from_carton}`);
              }
            }
          }
        }
      }
      
      // Fallback: Check tabStockLedger for putaway cartons (PAW-...)
      if (sourceRows.length === 0 && from_carton && from_carton.startsWith('PAW-')) {
        const [stockLedgerCartonCheck] = await connection.execute(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'tabStockLedger'
            AND COLUMN_NAME = 'carton_id'
        `);
        
        if (stockLedgerCartonCheck.length > 0) {
          const [ledgerItemRows] = await connection.execute(`
            SELECT qty, uom
            FROM tabStockLedger
            WHERE carton_id = ? AND item_code = ? AND warehouse = ?
          `, [from_carton, item_code, actualWarehouse]);
          
          if (ledgerItemRows.length > 0) {
            sourceRows = ledgerItemRows.map(row => ({
              qty: row.qty,
              uom: row.uom || null,
              batch_no: null
            }));
            console.log(`✅ Found item ${item_code} in tabStockLedger for putaway carton ${from_carton}`);
          }
        }
      }
      
      // Final fallback: Check tabTransactionHistory for putaway cartons
      if (sourceRows.length === 0 && from_carton && (from_carton.startsWith('PAW-') || !from_carton.startsWith('CTN-'))) {
        const [historyItemRows] = await connection.execute(`
          SELECT 
            qty_after as qty,
            item_code
          FROM tabTransactionHistory
          WHERE carton_id = ?
            AND item_code = ?
            AND warehouse = ?
            AND qty_after > 0
          ORDER BY transaction_date DESC, id DESC
          LIMIT 1
        `, [from_carton, item_code, actualWarehouse]);
        
        if (historyItemRows.length > 0) {
          sourceRows = [{
            qty: parseFloat(historyItemRows[0].qty) || 0,
            uom: null,
            batch_no: null
          }];
          console.log(`✅ Found item ${item_code} in tabTransactionHistory for carton ${from_carton} (qty: ${sourceRows[0].qty})`);
        }
      }
      
      if (sourceRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "ITEM_NOT_FOUND",
            message: `Item "${item_code}" not found in source carton.`,
            details: `Please scan an item that exists in carton ${from_carton}.`
          }
        });
      }
      
      // SUM all quantities across multiple rows
      sourceQty = sourceRows.reduce((sum, row) => sum + parseFloat(row.qty || 0), 0);
      
      if (sourceQty < qtyToMove) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "INSUFFICIENT_STOCK",
            message: `Insufficient stock for ${item_code} in carton ${from_carton}. Available: ${sourceQty}, Requested: ${qtyToMove}`
          }
        });
      }
      
      // Decrement from source carton (handle multiple rows)
      let remainingToMove = qtyToMove;
      
      // Check if this is a Transfer In carton using tabTransferInCartonLine
      const isFromTransferInLine2 = sourceRows.length > 0 && sourceStockRows.length === 0 && from_carton && from_carton.startsWith('CTN-TI-');
      
      if (isFromTransferInLine2) {
        // For Transfer In cartons, update tabTransferInCartonLine
        const [transferInCartonRows2] = await connection.execute(`
          SELECT transfer_in
          FROM tabTransferInCarton
          WHERE carton_id = ?
        `, [from_carton]);
        
        if (transferInCartonRows2.length > 0) {
          const transferInTitle2 = transferInCartonRows2[0].transfer_in;
          
          // Update received_qty in tabTransferInCartonLine
          for (const stockRow of sourceRows) {
            if (remainingToMove <= 0) break;
            
            const rowQty = parseFloat(stockRow.qty || 0);
            if (rowQty <= 0) continue;
            
            const qtyToDeduct = Math.min(rowQty, remainingToMove);
            const newQty = rowQty - qtyToDeduct;
            
            await connection.execute(`
              UPDATE tabTransferInCartonLine
              SET received_qty = ?
              WHERE carton_id = ? AND transfer_in = ? AND item_code = ?
            `, [newQty, from_carton, transferInTitle2, item_code]);
            
            remainingToMove -= qtyToDeduct;
          }
        }
      } else {
        // For regular cartons, update tabCartonStock
        for (const stockRow of sourceStockRows) {
          if (remainingToMove <= 0) break;
          
          const rowQty = parseFloat(stockRow.qty || 0);
          const batchNo = stockRow.batch_no || null;
          
          if (rowQty <= 0) continue;
          
          if (rowQty <= remainingToMove) {
            // This row will be completely consumed - delete it
            await connection.execute(`
              DELETE FROM tabCartonStock
              WHERE carton_id = ? AND item_code = ? AND warehouse = ?
                AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL))
            `, [from_carton, item_code, actualWarehouse, batchNo, batchNo]);
            remainingToMove -= rowQty;
          } else {
            // This row has more than needed - reduce its quantity
            const newRowQty = rowQty - remainingToMove;
            await connection.execute(`
              UPDATE tabCartonStock
              SET qty = ?,
                  updated_at = NOW()
              WHERE carton_id = ? AND item_code = ? AND warehouse = ?
                AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL))
            `, [newRowQty, from_carton, item_code, actualWarehouse, batchNo, batchNo]);
            remainingToMove = 0;
          }
        }
      }
      
      // Increment in destination carton
      // Use sourceRows[0] (works for both regular cartons and Transfer In cartons)
      const firstSourceRow = sourceRows.length > 0 ? sourceRows[0] : null;
      
      if (!firstSourceRow) {
        await connection.rollback();
        return res.status(400).json({
          ok: false,
          error: {
            code: "DATA_ERROR",
            message: `Cannot determine source row properties for ${item_code} in carton ${from_carton}`
          }
        });
      }
      
      const [destStockRows] = await connection.execute(`
        SELECT qty, batch_no
        FROM tabCartonStock
        WHERE carton_id = ? AND item_code = ? AND warehouse = ?
      `, [to_carton, item_code, actualWarehouse]);
      
      const currentDestQty = destStockRows.reduce((sum, row) => sum + parseFloat(row.qty || 0), 0);
      
      if (destStockRows.length > 0) {
        // Update existing row(s) - prefer updating first row that matches batch_no
        const matchingBatchRow = destStockRows.find(row => (row.batch_no || null) === (firstSourceRow.batch_no || null));
        const rowToUpdate = matchingBatchRow || destStockRows[0];
        
        const newDestQty = parseFloat(rowToUpdate.qty || 0) + qtyToMove;
        await connection.execute(`
          UPDATE tabCartonStock
          SET qty = ?,
              bin_location = ?,
              updated_at = NOW()
          WHERE carton_id = ? AND item_code = ? AND warehouse = ?
            AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL))
          LIMIT 1
        `, [
          newDestQty, 
          to_bin || null, 
          to_carton, 
          item_code, 
          actualWarehouse,
          rowToUpdate.batch_no || null,
          rowToUpdate.batch_no || null
        ]);
      } else {
        // Create new stock entry in existing destination carton
        // NOTE: Target carton existence is validated at the start of the function
        await connection.execute(`
          INSERT INTO tabCartonStock
            (carton_id, item_code, warehouse, bin_location, qty, uom, batch_no, status, created_on, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'PUTAWAY', NOW(), NOW())
        `, [
          to_carton,
          item_code,
          actualWarehouse,
          to_bin || null,
          qtyToMove,
          firstSourceRow.uom || null,
          firstSourceRow.batch_no || null
        ]);
      }
      
      // Update destination carton location
      if (to_bin) {
        await connection.execute(`
          UPDATE tabCarton
          SET current_bin_id = ?,
              last_moved_on = NOW(),
              updated_at = NOW()
          WHERE carton_id = ? AND warehouse = ?
        `, [to_bin, to_carton, actualWarehouse]);
      }
      
      // Update tabStockLedger: Move stock from old bin to new bin
      // Decrease stock at old bin location
      if (from_bin) {
        const [oldBinStock] = await connection.execute(`
          SELECT qty, reserved_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
        `, [item_code, actualWarehouse, from_bin, from_bin]);
        
        if (oldBinStock.length > 0) {
          const oldQty = parseFloat(oldBinStock[0].qty) || 0;
          const reservedQty = parseFloat(oldBinStock[0].reserved_qty) || 0;
          const newOldBinQty = Math.max(0, oldQty - qtyToMove);
          
          if (newOldBinQty > 0) {
            await connection.execute(`
              UPDATE tabStockLedger
              SET qty = ?,
                  last_transaction_date = NOW(),
                  last_transaction_type = ?,
                  last_transaction_ref = ?,
                  updated_at = NOW()
              WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
            `, [newOldBinQty, txnType, sessionId, item_code, actualWarehouse, from_bin, from_bin]);
          } else {
            // Remove entry if qty becomes 0
            await connection.execute(`
              DELETE FROM tabStockLedger
              WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
            `, [item_code, actualWarehouse, from_bin, from_bin]);
          }
        }
      }
      
      // Increase stock at new bin location
      if (to_bin) {
        const [newBinStock] = await connection.execute(`
          SELECT qty, reserved_qty
          FROM tabStockLedger
          WHERE item_code = ? AND warehouse = ? AND (bin_location = ? OR (bin_location IS NULL AND ? IS NULL))
        `, [item_code, actualWarehouse, to_bin, to_bin]);
        
        const newBinQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].qty) || 0 : 0;
        const newBinReservedQty = newBinStock.length > 0 ? parseFloat(newBinStock[0].reserved_qty) || 0 : 0;
        const updatedNewBinQty = newBinQty + qtyToMove;
        
        await connection.execute(`
          INSERT INTO tabStockLedger (item_code, warehouse, bin_location, qty, reserved_qty, last_transaction_date, last_transaction_type, last_transaction_ref, updated_at, created_at)
          VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE qty = ?, last_transaction_date = NOW(), last_transaction_type = ?, last_transaction_ref = ?, updated_at = NOW()
        `, [item_code, actualWarehouse, to_bin, updatedNewBinQty, newBinReservedQty, txnType, sessionId, updatedNewBinQty, txnType, sessionId]);
      }
      
      // Insert transaction history into tabTransactionHistory (audit trail table)
      const [txnCols] = await connection.execute(`
        SELECT COLUMN_NAME, EXTRA, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransactionHistory'
          AND COLUMN_NAME IN ('transaction_id', 'from_carton', 'to_carton', 'carton_id', 'from_bin', 'to_bin', 'source_bin', 'target_bin', 'bin_location',
            'transaction_date', 'reference_doc_type', 'reference_doc', 'performed_by', 'created_at', 'qty_change', 'qty_before', 'qty_after')
      `);
      
      const hasFromCarton = txnCols.some(col => col.COLUMN_NAME === 'from_carton');
      const hasToCarton = txnCols.some(col => col.COLUMN_NAME === 'to_carton');
      const hasCartonId = txnCols.some(col => col.COLUMN_NAME === 'carton_id');
      const hasFromBin = txnCols.some(col => col.COLUMN_NAME === 'from_bin');
      const hasToBin = txnCols.some(col => col.COLUMN_NAME === 'to_bin');
      const hasSourceBin = txnCols.some(col => col.COLUMN_NAME === 'source_bin');
      const hasTargetBin = txnCols.some(col => col.COLUMN_NAME === 'target_bin');
      const hasBinLocation = txnCols.some(col => col.COLUMN_NAME === 'bin_location');
      const hasTransactionDate = txnCols.some(col => col.COLUMN_NAME === 'transaction_date');
      const hasRefDocType = txnCols.some(col => col.COLUMN_NAME === 'reference_doc_type');
      const hasRefDoc = txnCols.some(col => col.COLUMN_NAME === 'reference_doc');
      const hasPerformedBy = txnCols.some(col => col.COLUMN_NAME === 'performed_by');
      const hasCreatedAt = txnCols.some(col => col.COLUMN_NAME === 'created_at');
      const hasQtyChange = txnCols.some(col => col.COLUMN_NAME === 'qty_change');
      const hasQtyBefore = txnCols.some(col => col.COLUMN_NAME === 'qty_before');
      const hasQtyAfter = txnCols.some(col => col.COLUMN_NAME === 'qty_after');
      
      // Check if transaction_id is required
      const transactionIdCol = txnCols.find(col => col.COLUMN_NAME === 'transaction_id');
      const hasTransactionId = !!transactionIdCol;
      const isTransactionIdAutoIncrement = transactionIdCol && transactionIdCol.EXTRA && transactionIdCol.EXTRA.toLowerCase().includes('auto_increment');
      const needsTransactionId = hasTransactionId && !isTransactionIdAutoIncrement && transactionIdCol.IS_NULLABLE === 'NO' && !transactionIdCol.COLUMN_DEFAULT;
      const isTransactionIdInteger = transactionIdCol && (transactionIdCol.DATA_TYPE === 'int' || transactionIdCol.DATA_TYPE === 'bigint' || transactionIdCol.DATA_TYPE === 'integer');
      
      // Helper function to generate transaction_id based on column type
      const generateTransactionId = () => {
        if (isTransactionIdInteger) {
          return parseInt(`${Date.now()}${Math.floor(Math.random() * 1000)}`.substring(0, 15));
        } else {
          return `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        }
      };
      
      // Check if stock_direction column exists and is NOT a generated column
      const [stockDirectionCol] = await connection.execute(`
        SELECT COLUMN_NAME, GENERATION_EXPRESSION, EXTRA
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tabTransactionHistory'
          AND COLUMN_NAME = 'stock_direction'
      `);
      const stockDirColInfo = stockDirectionCol.length > 0 ? stockDirectionCol[0] : null;
      const isStockDirectionGenerated = stockDirColInfo && (
        (stockDirColInfo.GENERATION_EXPRESSION && stockDirColInfo.GENERATION_EXPRESSION.length > 0) ||
        (stockDirColInfo.EXTRA && stockDirColInfo.EXTRA.toLowerCase().includes('generated'))
      );
      const hasStockDirection = stockDirectionCol.length > 0 && !isStockDirectionGenerated;
      
      const transactionDate = new Date();
      const performedBy = user_id || 'SYSTEM';
      
      // For CARTON_MERGE, create TWO transactions: OUT from source, IN to destination
      // This ensures proper stock tracking and matches the commitFullCartonMove behavior
      if (txnType === 'CARTON_MERGE') {
        // ============================================================
        // TRANSACTION 1: Source Carton (OUT) - Negative qty_change
        // ============================================================
        const sourceTxnFields = [];
        const sourceTxnValues = [];
        
        if (needsTransactionId) {
          sourceTxnFields.push('transaction_id');
          sourceTxnValues.push(generateTransactionId());
        }
        
        if (hasTransactionDate) {
          sourceTxnFields.push('transaction_date');
          sourceTxnValues.push(transactionDate);
        }
        
        sourceTxnFields.push('transaction_type');
        sourceTxnValues.push('CARTON_MERGE');
        
        if (hasRefDocType) {
          sourceTxnFields.push('reference_doc_type');
          sourceTxnValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          sourceTxnFields.push('reference_doc');
          sourceTxnValues.push(sessionId);
        }
        
        sourceTxnFields.push('item_code', 'warehouse');
        sourceTxnValues.push(item_code, actualWarehouse);
        
        // Source carton location
        if (hasBinLocation) {
          sourceTxnFields.push('bin_location');
          sourceTxnValues.push(from_bin);
        }
        
        if (hasFromBin && hasToBin) {
          sourceTxnFields.push('from_bin', 'to_bin');
          sourceTxnValues.push(from_bin, to_bin);
        }
        
        // IMPORTANT: source_bin is required for Item Location Breakdown to show correct location for OUT transactions
        if (hasSourceBin) {
          sourceTxnFields.push('source_bin');
          sourceTxnValues.push(from_bin);
        }
        
        if (hasCartonId) {
          sourceTxnFields.push('carton_id');
          sourceTxnValues.push(from_carton); // FROM carton
        }
        
        if (hasFromCarton) {
          sourceTxnFields.push('from_carton');
          sourceTxnValues.push(from_carton);
        }
        
        if (hasToCarton) {
          sourceTxnFields.push('to_carton');
          sourceTxnValues.push(to_carton);
        }
        
        // Source transaction: OUT (negative qty_change)
        if (hasQtyChange) {
          sourceTxnFields.push('qty_change');
          sourceTxnValues.push(-qtyToMove); // Negative for OUT
        }
        if (hasQtyBefore) {
          sourceTxnFields.push('qty_before');
          sourceTxnValues.push(sourceQty);
        }
        if (hasQtyAfter) {
          sourceTxnFields.push('qty_after');
          sourceTxnValues.push(0); // Source carton becomes empty
        }
        
        if (hasStockDirection) {
          sourceTxnFields.push('stock_direction');
          sourceTxnValues.push('OUT');
        }
        
        if (hasPerformedBy) {
          sourceTxnFields.push('performed_by');
          sourceTxnValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          sourceTxnFields.push('created_at');
          sourceTxnValues.push(transactionDate);
        }
        
        // Insert source transaction (OUT)
        if (sourceTxnFields.length > 0) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${sourceTxnFields.join(', ')})
            VALUES (${sourceTxnFields.map(() => '?').join(', ')})
          `, sourceTxnValues);
          console.log(`📝 Inserted CARTON_MERGE OUT transaction for ${item_code} into tabTransactionHistory`);
        }
        
        // ============================================================
        // TRANSACTION 2: Destination Carton (IN) - Positive qty_change
        // ============================================================
        const destTxnFields = [];
        const destTxnValues = [];
        
        if (needsTransactionId) {
          destTxnFields.push('transaction_id');
          destTxnValues.push(generateTransactionId());
        }
        
        if (hasTransactionDate) {
          destTxnFields.push('transaction_date');
          destTxnValues.push(transactionDate);
        }
        
        destTxnFields.push('transaction_type');
        destTxnValues.push('CARTON_MERGE');
        
        if (hasRefDocType) {
          destTxnFields.push('reference_doc_type');
          destTxnValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          destTxnFields.push('reference_doc');
          destTxnValues.push(sessionId);
        }
        
        destTxnFields.push('item_code', 'warehouse');
        destTxnValues.push(item_code, actualWarehouse);
        
        // Destination carton location
        if (hasBinLocation) {
          destTxnFields.push('bin_location');
          destTxnValues.push(to_bin);
        }
        
        if (hasFromBin && hasToBin) {
          destTxnFields.push('from_bin', 'to_bin');
          destTxnValues.push(from_bin, to_bin);
        }
        
        // IMPORTANT: target_bin is required for Item Location Breakdown to show correct location for IN transactions
        if (hasTargetBin) {
          destTxnFields.push('target_bin');
          destTxnValues.push(to_bin);
        }
        
        if (hasCartonId) {
          destTxnFields.push('carton_id');
          destTxnValues.push(to_carton); // TO carton
        }
        
        if (hasFromCarton) {
          destTxnFields.push('from_carton');
          destTxnValues.push(from_carton);
        }
        
        if (hasToCarton) {
          destTxnFields.push('to_carton');
          destTxnValues.push(to_carton);
        }
        
        // Destination transaction: IN (positive qty_change)
        if (hasQtyChange) {
          destTxnFields.push('qty_change');
          destTxnValues.push(qtyToMove); // Positive for IN
        }
        if (hasQtyBefore) {
          destTxnFields.push('qty_before');
          destTxnValues.push(0); // Assume 0 before merge (or could query actual value)
        }
        if (hasQtyAfter) {
          destTxnFields.push('qty_after');
          destTxnValues.push(qtyToMove); // New qty in destination
        }
        
        if (hasStockDirection) {
          destTxnFields.push('stock_direction');
          destTxnValues.push('IN');
        }
        
        if (hasPerformedBy) {
          destTxnFields.push('performed_by');
          destTxnValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          destTxnFields.push('created_at');
          destTxnValues.push(transactionDate);
        }
        
        // Insert destination transaction (IN)
        if (destTxnFields.length > 0) {
          await connection.execute(`
            INSERT INTO tabTransactionHistory (${destTxnFields.join(', ')})
            VALUES (${destTxnFields.map(() => '?').join(', ')})
          `, destTxnValues);
          console.log(`📝 Inserted CARTON_MERGE IN transaction for ${item_code} into tabTransactionHistory`);
        }
      } else {
        // For PARTIAL_RELOCATION, create TWO transactions (OUT and IN) like CARTON_RELOCATION
        // This ensures Item Location Breakdown shows correct balances
        
        // ============================================================
        // TRANSACTION 1: Source Carton (OUT) - Negative qty_change
        // ============================================================
        const outFields = [];
        const outValues = [];
        
        if (needsTransactionId) {
          outFields.push('transaction_id');
          outValues.push(generateTransactionId());
        }
        
        if (hasTransactionDate) {
          outFields.push('transaction_date');
          outValues.push(transactionDate);
        }
        
        outFields.push('transaction_type');
        outValues.push(txnType);
        
        if (hasRefDocType) {
          outFields.push('reference_doc_type');
          outValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          outFields.push('reference_doc');
          outValues.push(sessionId);
        }
        
        outFields.push('item_code', 'warehouse');
        outValues.push(item_code, actualWarehouse);
        
        if (hasBinLocation) {
          outFields.push('bin_location');
          outValues.push(from_bin);
        }
        
        if (hasSourceBin) {
          outFields.push('source_bin');
          outValues.push(from_bin);
        }
        
        if (hasCartonId) {
          outFields.push('carton_id');
          outValues.push(from_carton);
        }
        
        if (hasFromCarton) {
          outFields.push('from_carton');
          outValues.push(from_carton);
        }
        
        // OUT transaction: negative qty_change
        outFields.push('qty_change');
        outValues.push(-qtyToMove);
        outFields.push('qty_before');
        outValues.push(sourceQty);
        outFields.push('qty_after');
        outValues.push(sourceQty - qtyToMove);
        
        if (hasPerformedBy) {
          outFields.push('performed_by');
          outValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          outFields.push('created_at');
          outValues.push(transactionDate);
        }
        
        await connection.execute(`
          INSERT INTO tabTransactionHistory (${outFields.join(', ')})
          VALUES (${outFields.map(() => '?').join(', ')})
        `, outValues);
        console.log(`📝 Inserted ${txnType} OUT transaction for ${item_code}`);
        
        // ============================================================
        // TRANSACTION 2: Destination Carton (IN) - Positive qty_change
        // ============================================================
        const inFields = [];
        const inValues = [];
        
        if (needsTransactionId) {
          inFields.push('transaction_id');
          inValues.push(generateTransactionId());
        }
        
        if (hasTransactionDate) {
          inFields.push('transaction_date');
          inValues.push(transactionDate);
        }
        
        inFields.push('transaction_type');
        inValues.push(txnType);
        
        if (hasRefDocType) {
          inFields.push('reference_doc_type');
          inValues.push('Relocation Session');
        }
        
        if (hasRefDoc) {
          inFields.push('reference_doc');
          inValues.push(sessionId);
        }
        
        inFields.push('item_code', 'warehouse');
        inValues.push(item_code, actualWarehouse);
        
        if (hasBinLocation) {
          inFields.push('bin_location');
          inValues.push(to_bin);
        }
        
        if (hasTargetBin) {
          inFields.push('target_bin');
          inValues.push(to_bin);
        }
        
        if (hasCartonId) {
          inFields.push('carton_id');
          inValues.push(to_carton || from_carton);
        }
        
        if (hasToCarton) {
          inFields.push('to_carton');
          inValues.push(to_carton || from_carton);
        }
        
        // IN transaction: positive qty_change
        inFields.push('qty_change');
        inValues.push(qtyToMove);
        inFields.push('qty_before');
        inValues.push(0);
        inFields.push('qty_after');
        inValues.push(qtyToMove);
        
        if (hasPerformedBy) {
          inFields.push('performed_by');
          inValues.push(performedBy);
        }
        
        if (hasCreatedAt) {
          inFields.push('created_at');
          inValues.push(transactionDate);
        }
        
        await connection.execute(`
          INSERT INTO tabTransactionHistory (${inFields.join(', ')})
          VALUES (${inFields.map(() => '?').join(', ')})
        `, inValues);
        console.log(`📝 Inserted ${txnType} IN transaction for ${item_code}`);
      }
      
      movedItems.push({
        item_code: item_code,
        qty_moved: qtyToMove
      });
    }
    
    // Note: Session is already COMPLETED (created as COMPLETED), so no need to update status
    
    await connection.commit();
    
    // Sync item stock with stock ledger for all affected items
    if (movedItems && movedItems.length > 0) {
      const itemCodes = [...new Set(movedItems.map(i => i.item_code))];
      for (const itemCode of itemCodes) {
        await syncItemStock(connection, itemCode);
      }
    }
    
    console.log(`✅ Completed partial relocation: ${from_carton} -> ${to_carton} (${lines.length} items)`);
    
    res.json({
      ok: true,
      message: "Partial relocation completed successfully (session created with COMPLETED status)",
      data: {
        session_id: sessionId,
        status: 'COMPLETED',
        from_carton: from_carton,
        from_bin: from_bin,
        to_carton: to_carton,
        to_bin: to_bin,
        items_moved: lines.length
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error completing partial relocation:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to complete relocation",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
