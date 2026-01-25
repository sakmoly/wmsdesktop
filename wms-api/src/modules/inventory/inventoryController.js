// wms-api/src/modules/inventory/inventoryController.js
// Inventory validation endpoints for putaway

import { getConnection } from "../../db/connection.js";

/**
 * GET /api/inventory/by-location
 * Get inventory summary by location (for putaway validation)
 * 
 * Query Parameters:
 * - warehouse_id (required): Warehouse ID to query
 * - location_id (optional): Filter by specific location ID
 * - item_code (optional): Filter by specific item code
 * 
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "location_id": "A1-R02-L2-B2",
 *     "warehouse": "WH-MAIN",
 *     "total_items": 5,
 *     "total_qty": 150.0,
 *     "items": [
 *       {
 *         "item_code": "SKU-001",
 *         "qty": 50.0,
 *         "carton_id": "CTN-001",
 *         "location_id": "A1-R02-L2-B2"
 *       }
 *     ]
 *   }
 * }
 */
export const getInventoryByLocation = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { warehouse_id, location_id, item_code } = req.query;
    
    if (!warehouse_id) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "warehouse_id parameter is required"
        }
      });
    }
    
    // Get inventory from tabStockLedger
    const stockLedgerConditions = ["warehouse = ?"];
    const stockLedgerParams = [warehouse_id];
    
    if (location_id) {
      stockLedgerConditions.push("bin_location = ?");
      stockLedgerParams.push(location_id);
    }
    
    if (item_code) {
      stockLedgerConditions.push("item_code = ?");
      stockLedgerParams.push(item_code);
    }
    
    // Check if carton_id column exists in tabStockLedger
    const [cartonIdColumn] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabStockLedger' 
      AND COLUMN_NAME = 'carton_id'
    `);
    const hasCartonId = cartonIdColumn.length > 0;
    
    const selectFields = hasCartonId ? 'item_code, qty, carton_id' : 'item_code, qty';
    const orderBy = hasCartonId ? 'item_code, carton_id' : 'item_code';
    
    const [stockLedger] = await connection.execute(
      `SELECT ${selectFields}
       FROM tabStockLedger
       WHERE ${stockLedgerConditions.join(" AND ")}
       ORDER BY ${orderBy}`,
      stockLedgerParams
    );
    
    // Also check tabCartonStock if available
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    
    let cartonStock = [];
    if (cartonStockTable.length > 0) {
      const cartonConditions = ["warehouse = ?"];
      const cartonParams = [warehouse_id];
      
      if (location_id) {
        cartonConditions.push("bin_location = ?");
        cartonParams.push(location_id);
      }
      
      if (item_code) {
        cartonConditions.push("item_code = ?");
        cartonParams.push(item_code);
      }
      
      const [cartonStockRows] = await connection.execute(
        `SELECT item_code, qty, carton_id
         FROM tabCartonStock
         WHERE ${cartonConditions.join(" AND ")} AND qty > 0
         ORDER BY item_code, carton_id`,
        cartonParams
      );
      cartonStock = cartonStockRows;
    }
    
    // Combine and aggregate results
    const itemMap = new Map();
    
    // Add stock ledger entries
    for (const row of stockLedger) {
      const key = `${row.item_code}|${row.carton_id || 'NULL'}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          item_code: row.item_code,
          qty: 0,
          carton_id: row.carton_id || null
        });
      }
      itemMap.get(key).qty += parseFloat(row.qty) || 0;
    }
    
    // Add carton stock entries (may have more detail)
    for (const row of cartonStock) {
      const key = `${row.item_code}|${row.carton_id || 'NULL'}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          item_code: row.item_code,
          qty: 0,
          carton_id: row.carton_id || null
        });
      }
      // Use carton stock if available (more accurate for carton-level tracking)
      if (row.carton_id) {
        itemMap.get(key).qty = parseFloat(row.qty) || 0;
      } else {
        itemMap.get(key).qty += parseFloat(row.qty) || 0;
      }
    }
    
    const items = Array.from(itemMap.values()).map(item => ({
      ...item,
      location_id: location_id || item.location_id || null
    }));
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    
    res.json({
      ok: true,
      data: {
        location_id: location_id || null,
        warehouse: warehouse_id,
        total_items: items.length,
        total_qty: totalQty,
        items: items
      }
    });
  } catch (error) {
    console.error('Error getting inventory by location:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get inventory by location",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};

/**
 * GET /api/inventory/by-carton
 * Get inventory for a specific carton (for putaway validation)
 * 
 * Query Parameters:
 * - carton_id (required): Carton ID to query
 * - warehouse (optional): Filter by warehouse
 * 
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "carton_id": "CTN-001",
 *     "warehouse": "WH-MAIN",
 *     "current_bin_location": "A1-R02-L2-B2",
 *     "total_items": 3,
 *     "total_qty": 100.0,
 *     "items": [
 *       {
 *         "item_code": "SKU-001",
 *         "qty": 50.0,
 *         "bin_location": "A1-R02-L2-B2"
 *       }
 *     ]
 *   }
 * }
 */
export const getInventoryByCarton = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { carton_id, warehouse } = req.query;
    
    if (!carton_id) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "carton_id parameter is required"
        }
      });
    }
    
    // Get carton's current location
    let currentBinLocation = null;
    const [cartonTable] = await connection.execute(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'tabCarton'
      AND COLUMN_NAME = 'current_bin_id'
    `);
    
    if (cartonTable.length > 0) {
      const conditions = ["carton_id = ?"];
      const params = [carton_id];
      
      if (warehouse) {
        conditions.push("warehouse = ?");
        params.push(warehouse);
      }
      
      const [cartonRows] = await connection.execute(
        `SELECT current_bin_id FROM tabCarton WHERE ${conditions.join(" AND ")} LIMIT 1`,
        params
      );
      
      if (cartonRows.length > 0) {
        currentBinLocation = cartonRows[0].current_bin_id;
      }
    }
    
    // Get inventory from tabCartonStock (preferred)
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    
    let items = [];
    if (cartonStockTable.length > 0) {
      const conditions = ["carton_id = ?"];
      const params = [carton_id];
      
      if (warehouse) {
        conditions.push("warehouse = ?");
        params.push(warehouse);
      }
      
      const [cartonStockRows] = await connection.execute(
        `SELECT item_code, qty, bin_location
         FROM tabCartonStock
         WHERE ${conditions.join(" AND ")} AND qty > 0
         ORDER BY item_code`,
        params
      );
      
      items = cartonStockRows.map(row => ({
        item_code: row.item_code,
        qty: parseFloat(row.qty) || 0,
        bin_location: row.bin_location || currentBinLocation
      }));
      
      // Update currentBinLocation from first item if not set
      if (!currentBinLocation && items.length > 0 && items[0].bin_location) {
        currentBinLocation = items[0].bin_location;
      }
    } else {
      // Fallback to stock ledger if tabCartonStock doesn't exist
      const conditions = ["carton_id = ?"];
      const params = [carton_id];
      
      if (warehouse) {
        conditions.push("warehouse = ?");
        params.push(warehouse);
      }
      
      const [stockLedgerRows] = await connection.execute(
        `SELECT item_code, qty, bin_location
         FROM tabStockLedger
         WHERE ${conditions.join(" AND ")}
         ORDER BY item_code`,
        params
      );
      
      items = stockLedgerRows.map(row => ({
        item_code: row.item_code,
        qty: parseFloat(row.qty) || 0,
        bin_location: row.bin_location || currentBinLocation
      }));
    }
    
    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
    
    res.json({
      ok: true,
      data: {
        carton_id: carton_id,
        warehouse: warehouse || null,
        current_bin_location: currentBinLocation,
        total_items: items.length,
        total_qty: totalQty,
        items: items
      }
    });
  } catch (error) {
    console.error('Error getting inventory by carton:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: "DATABASE_ERROR",
        message: "Failed to get inventory by carton",
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
