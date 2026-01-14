# Automatic Stock Quantity Synchronization Options

## Current Situation

**Issue:** `tabItem.stock_qty` (299) doesn't match location breakdown sum (200)

**Current Behavior:**
- `tabItem.stock_qty` is updated automatically when:
  - Items are picked (`POST /api/material-requests/:title/pick-items`)
  - Transfer cartons are dispatched
  - Putaway tasks are completed
  - Events are processed

**Problem:** If stock is added/updated outside these flows, `tabItem.stock_qty` can become out of sync.

---

## Automatic Sync Options

### Option 1: Database Trigger (Recommended)

**Create a MySQL trigger that automatically updates `tabItem.stock_qty` whenever `tabStockLedger` or `tabCartonStock` changes.**

**Pros:**
- ✅ Always in sync (real-time)
- ✅ No API calls needed
- ✅ Works for all operations (direct DB updates, API, etc.)
- ✅ No performance impact on API

**Cons:**
- ⚠️ Requires database access to create trigger
- ⚠️ Need to handle both `tabStockLedger` and `tabCartonStock`

**Implementation:**

```sql
-- Trigger for tabStockLedger
DELIMITER $$

CREATE TRIGGER trg_update_item_stock_after_stock_ledger_change
AFTER INSERT ON tabStockLedger
FOR EACH ROW
BEGIN
  UPDATE tabItem
  SET stock_qty = (
    SELECT COALESCE(SUM(qty), 0)
    FROM tabStockLedger
    WHERE item_code = NEW.item_code
  ),
  updated_at = NOW()
  WHERE code = NEW.item_code;
END$$

CREATE TRIGGER trg_update_item_stock_after_stock_ledger_update
AFTER UPDATE ON tabStockLedger
FOR EACH ROW
BEGIN
  UPDATE tabItem
  SET stock_qty = (
    SELECT COALESCE(SUM(qty), 0)
    FROM tabStockLedger
    WHERE item_code = NEW.item_code
  ),
  updated_at = NOW()
  WHERE code = NEW.item_code;
END$$

CREATE TRIGGER trg_update_item_stock_after_stock_ledger_delete
AFTER DELETE ON tabStockLedger
FOR EACH ROW
BEGIN
  UPDATE tabItem
  SET stock_qty = (
    SELECT COALESCE(SUM(qty), 0)
    FROM tabStockLedger
    WHERE item_code = OLD.item_code
  ),
  updated_at = NOW()
  WHERE code = OLD.item_code;
END$$

DELIMITER ;
```

---

### Option 2: Scheduled Background Job (Node.js)

**Create a scheduled job that runs periodically to sync `tabItem.stock_qty`.**

**Pros:**
- ✅ Can be controlled via API
- ✅ Can run on a schedule (e.g., every 5 minutes)
- ✅ Can log sync operations
- ✅ Can handle complex logic

**Cons:**
- ⚠️ Not real-time (runs on schedule)
- ⚠️ Requires Node.js scheduler (node-cron)
- ⚠️ Adds server load

**Implementation:**

```javascript
// wms-api/src/jobs/stockSyncJob.js
import cron from 'node-cron';
import { getConnection } from '../db/connection.js';

export async function syncAllItemStockQuantities() {
  const connection = await getConnection();
  
  try {
    console.log('[Stock Sync] Starting automatic stock quantity sync...');
    
    // Get all items
    const [items] = await connection.execute(
      'SELECT code FROM tabItem'
    );
    
    let updated = 0;
    let errors = 0;
    
    for (const item of items) {
      try {
        // Check if tabCartonStock exists
        const [cartonStockTable] = await connection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'tabCartonStock'
        `);
        const hasCartonStockTable = cartonStockTable.length > 0;
        
        let totalQty = 0;
        
        if (hasCartonStockTable) {
          // Use tabCartonStock if available (more accurate for carton-level)
          const [cartonSum] = await connection.execute(`
            SELECT COALESCE(SUM(qty), 0) as total_qty
            FROM tabCartonStock
            WHERE item_code = ?
              AND qty > 0
              AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
          `, [item.code]);
          totalQty = parseFloat(cartonSum[0].total_qty) || 0;
        }
        
        // If no carton stock or carton stock is 0, use stock ledger
        if (totalQty === 0) {
          const [stockSum] = await connection.execute(`
            SELECT COALESCE(SUM(qty), 0) as total_qty
            FROM tabStockLedger
            WHERE item_code = ?
          `, [item.code]);
          totalQty = parseFloat(stockSum[0].total_qty) || 0;
        }
        
        // Update tabItem.stock_qty
        await connection.execute(`
          UPDATE tabItem
          SET stock_qty = ?,
              updated_at = NOW()
          WHERE code = ?
        `, [totalQty, item.code]);
        
        updated++;
      } catch (error) {
        console.error(`[Stock Sync] Error updating ${item.code}:`, error.message);
        errors++;
      }
    }
    
    console.log(`[Stock Sync] Completed: ${updated} items updated, ${errors} errors`);
  } catch (error) {
    console.error('[Stock Sync] Failed:', error);
  } finally {
    connection.release();
  }
}

// Schedule to run every 5 minutes
export function startStockSyncScheduler() {
  cron.schedule('*/5 * * * *', async () => {
    await syncAllItemStockQuantities();
  });
  
  console.log('[Stock Sync] Scheduler started - will run every 5 minutes');
}
```

**Add to server.js:**

```javascript
// wms-api/src/server.js
import { startStockSyncScheduler } from './jobs/stockSyncJob.js';

// Start scheduler
if (process.env.AUTO_SYNC_STOCK === 'true') {
  startStockSyncScheduler();
}
```

---

### Option 3: API Endpoint for Manual/On-Demand Sync

**Create an API endpoint that can be called to sync stock quantities.**

**Pros:**
- ✅ Can be called on-demand
- ✅ Can be triggered by UI (button click)
- ✅ Can sync specific items or all items
- ✅ Can be scheduled via external cron

**Cons:**
- ⚠️ Requires manual trigger or external scheduler
- ⚠️ Not automatic (needs to be called)

**Implementation:**

```javascript
// wms-api/src/modules/stock-ledger/stockLedgerController.js

/**
 * POST /api/stock/sync-quantities
 * Sync tabItem.stock_qty with actual stock from tabStockLedger/tabCartonStock
 * 
 * Request Body (optional):
 * {
 *   "item_codes": ["SKU-001", "SKU-002"],  // Optional: sync specific items only
 *   "warehouse": "WH-MAIN"  // Optional: sync for specific warehouse
 * }
 */
export const syncStockQuantities = async (req, res) => {
  const connection = await getConnection();
  
  try {
    const { item_codes, warehouse } = req.body;
    
    let itemsQuery = 'SELECT code FROM tabItem';
    let itemsParams = [];
    
    if (item_codes && Array.isArray(item_codes) && item_codes.length > 0) {
      itemsQuery += ' WHERE code IN (' + item_codes.map(() => '?').join(',') + ')';
      itemsParams = item_codes;
    }
    
    const [items] = await connection.execute(itemsQuery, itemsParams);
    
    const results = {
      total_items: items.length,
      updated: 0,
      errors: [],
      details: []
    };
    
    // Check if tabCartonStock exists
    const [cartonStockTable] = await connection.execute(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'tabCartonStock'
    `);
    const hasCartonStockTable = cartonStockTable.length > 0;
    
    for (const item of items) {
      try {
        let totalQty = 0;
        
        if (hasCartonStockTable) {
          // Use tabCartonStock if available
          let cartonQuery = `
            SELECT COALESCE(SUM(qty), 0) as total_qty
            FROM tabCartonStock
            WHERE item_code = ?
              AND qty > 0
              AND (status IS NULL OR status = '' OR status = 'PUTAWAY')
          `;
          let cartonParams = [item.code];
          
          if (warehouse) {
            cartonQuery += ' AND warehouse = ?';
            cartonParams.push(warehouse);
          }
          
          const [cartonSum] = await connection.execute(cartonQuery, cartonParams);
          totalQty = parseFloat(cartonSum[0].total_qty) || 0;
        }
        
        // If no carton stock or carton stock is 0, use stock ledger
        if (totalQty === 0) {
          let ledgerQuery = `
            SELECT COALESCE(SUM(qty), 0) as total_qty
            FROM tabStockLedger
            WHERE item_code = ?
          `;
          let ledgerParams = [item.code];
          
          if (warehouse) {
            ledgerQuery += ' AND warehouse = ?';
            ledgerParams.push(warehouse);
          }
          
          const [stockSum] = await connection.execute(ledgerQuery, ledgerParams);
          totalQty = parseFloat(stockSum[0].total_qty) || 0;
        }
        
        // Get current stock_qty
        const [currentItem] = await connection.execute(
          'SELECT stock_qty FROM tabItem WHERE code = ?',
          [item.code]
        );
        const currentStockQty = parseFloat(currentItem[0].stock_qty) || 0;
        
        // Update if different
        if (totalQty !== currentStockQty) {
          await connection.execute(`
            UPDATE tabItem
            SET stock_qty = ?,
                updated_at = NOW()
            WHERE code = ?
          `, [totalQty, item.code]);
          
          results.updated++;
          results.details.push({
            item_code: item.code,
            old_qty: currentStockQty,
            new_qty: totalQty,
            difference: totalQty - currentStockQty
          });
        }
      } catch (error) {
        results.errors.push({
          item_code: item.code,
          error: error.message
        });
      }
    }
    
    res.json({
      ok: true,
      message: `Stock quantities synced: ${results.updated} items updated`,
      data: results
    });
  } catch (error) {
    console.error('Failed to sync stock quantities:', error);
    res.status(500).json({
      ok: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to sync stock quantities',
        details: process.env.NODE_ENV === 'development' ? error.message : null
      }
    });
  } finally {
    connection.release();
  }
};
```

**Add route:**

```javascript
// wms-api/src/routes/index.js
router.post('/api/stock/sync-quantities', authenticateToken, syncStockQuantities);
```

---

### Option 4: Hybrid Approach (Recommended)

**Combine Option 1 (Trigger) + Option 3 (API Endpoint)**

- **Trigger:** Automatically syncs when stock changes
- **API Endpoint:** Allows manual sync or scheduled external calls
- **Best of both worlds:** Real-time sync + on-demand control

---

## Recommendation

**Use Option 1 (Database Trigger) + Option 3 (API Endpoint):**

1. **Create database triggers** for automatic real-time sync
2. **Create API endpoint** for manual sync and initial bulk sync
3. **Run initial sync** using the API endpoint to fix current discrepancies

This ensures:
- ✅ Real-time synchronization (trigger)
- ✅ Manual control when needed (API)
- ✅ Can fix existing discrepancies (API)

---

## Implementation Steps

1. **Create database triggers** (run SQL script)
2. **Add API endpoint** for manual sync
3. **Run initial sync** to fix current discrepancies:
   ```http
   POST /api/stock/sync-quantities
   Authorization: Bearer <token>
   Content-Type: application/json
   
   {}
   ```
4. **Verify** that `tabItem.stock_qty` now matches location breakdown

---

**Status:** 📋 **READY FOR IMPLEMENTATION**  
**Date:** 2026-01-12
