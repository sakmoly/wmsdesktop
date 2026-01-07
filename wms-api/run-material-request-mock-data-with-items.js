// Script to automatically insert Material Request mock data using items from tabItem
// Uses the same database connection as the API

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runMockDataGeneration() {
    console.log('==========================================');
    console.log('Material Request Mock Data Generation');
    console.log('(Using items from tabItem)');
    console.log('==========================================\n');

    try {
        // Get database connection from environment
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop',
            multipleStatements: true
        });

        console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

        // Check and create tables if they don't exist
        console.log("🔍 Checking if tables exist...\n");
        
        const createTablesSQL = `
-- Material Request Table
CREATE TABLE IF NOT EXISTS tabMaterialRequest (
  title VARCHAR(100) PRIMARY KEY,
  status VARCHAR(50) DEFAULT 'Draft',
  from_warehouse VARCHAR(100) NOT NULL,
  to_showroom VARCHAR(100) NOT NULL,
  requested_date DATE NOT NULL,
  required_date DATE NULL,
  requested_by VARCHAR(100) NOT NULL,
  total_requested_qty DECIMAL(10,2) DEFAULT 0,
  total_picked_qty DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_warehouse (from_warehouse),
  INDEX idx_to_showroom (to_showroom),
  INDEX idx_status (status),
  INDEX idx_required_date (required_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Material Request Item Table
CREATE TABLE IF NOT EXISTS tabMaterialRequestItem (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_title VARCHAR(100) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  requested_qty DECIMAL(10,2) NOT NULL,
  picked_qty DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'Pending',
  pending_qty DECIMAL(10,2) AS (requested_qty - picked_qty) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_parent (parent_title),
  INDEX idx_item_code (item_code),
  INDEX idx_status (status),
  FOREIGN KEY (parent_title) REFERENCES tabMaterialRequest(title) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        try {
            await connection.query(createTablesSQL);
            console.log("✅ Tables checked/created\n");
        } catch (error) {
            if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.message.includes('already exists')) {
                console.log("✅ Tables already exist\n");
            } else {
                console.error(`⚠️  Error creating tables: ${error.message}`);
                console.log("⚠️  Continuing anyway...\n");
            }
        }

        // Get items from tabItem
        console.log("📦 Fetching items from tabItem...\n");
        const [items] = await connection.execute(`
            SELECT code, name 
            FROM tabItem 
            WHERE maintain_stock = 1 
            ORDER BY code 
            LIMIT 50
        `);

        if (items.length === 0) {
            console.error("❌ No items found in tabItem table. Please add items first.");
            await connection.end();
            return;
        }

        console.log(`✅ Found ${items.length} items in tabItem\n`);

        // Get warehouses and showrooms
        const [warehouses] = await connection.execute(`
            SELECT code, name 
            FROM tabWarehouse 
            WHERE warehouse_type = 'Warehouse' 
            LIMIT 5
        `);
        
        const [showrooms] = await connection.execute(`
            SELECT code, name 
            FROM tabWarehouse 
            WHERE warehouse_type = 'Store' OR warehouse_type = 'Showroom'
            LIMIT 5
        `);

        if (warehouses.length === 0) {
            console.error("❌ No warehouses found. Please add warehouses first.");
            await connection.end();
            return;
        }

        if (showrooms.length === 0) {
            console.error("❌ No showrooms found. Please add showrooms first.");
            await connection.end();
            return;
        }

        const defaultWarehouse = warehouses[0].code;
        const defaultShowroom = showrooms[0].code;

        console.log(`✅ Using warehouse: ${defaultWarehouse}`);
        console.log(`✅ Using showroom: ${defaultShowroom}\n`);

        // Generate Material Requests
        const statuses = ['Draft', 'Submitted', 'In Progress', 'Picked'];
        const materialRequests = [];

        // Create 5 Material Requests with different statuses
        for (let i = 1; i <= 5; i++) {
            const mrTitle = `MR-${String(i).padStart(4, '0')}`;
            const status = statuses[i % statuses.length];
            const requestDate = new Date();
            requestDate.setDate(requestDate.getDate() - (i * 2)); // Different dates
            const requiredDate = new Date(requestDate);
            requiredDate.setDate(requiredDate.getDate() + 3);

            // Select random items (2-4 items per Material Request)
            const numItems = Math.floor(Math.random() * 3) + 2; // 2-4 items
            const selectedItems = [];
            const usedIndices = new Set();
            
            for (let j = 0; j < numItems && j < items.length; j++) {
                let idx;
                do {
                    idx = Math.floor(Math.random() * items.length);
                } while (usedIndices.has(idx));
                usedIndices.add(idx);
                selectedItems.push(items[idx]);
            }

            // Calculate quantities (random between 5-50)
            const requestItems = selectedItems.map(item => ({
                item_code: item.code,
                requested_qty: Math.floor(Math.random() * 45) + 5, // 5-50
                picked_qty: status === 'Picked' || status === 'In Progress' 
                    ? Math.floor(Math.random() * 45) + 5 
                    : 0
            }));

            const totalRequestedQty = requestItems.reduce((sum, item) => sum + item.requested_qty, 0);
            const totalPickedQty = requestItems.reduce((sum, item) => sum + item.picked_qty, 0);

            materialRequests.push({
                title: mrTitle,
                status: status,
                from_warehouse: defaultWarehouse,
                to_showroom: defaultShowroom,
                requested_date: requestDate.toISOString().split('T')[0],
                required_date: requiredDate.toISOString().split('T')[0],
                requested_by: 'USER-001',
                total_requested_qty: totalRequestedQty,
                total_picked_qty: totalPickedQty,
                items: requestItems
            });
        }

        // Insert Material Requests
        console.log("📝 Inserting Material Requests...\n");
        let insertedCount = 0;
        let skippedCount = 0;

        for (const mr of materialRequests) {
            try {
                // Insert Material Request header
                await connection.execute(`
                    INSERT INTO tabMaterialRequest 
                        (title, status, from_warehouse, to_showroom, requested_date, required_date, requested_by, total_requested_qty, total_picked_qty)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        status = VALUES(status),
                        total_picked_qty = VALUES(total_picked_qty),
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    mr.title,
                    mr.status,
                    mr.from_warehouse,
                    mr.to_showroom,
                    mr.requested_date,
                    mr.required_date,
                    mr.requested_by,
                    mr.total_requested_qty,
                    mr.total_picked_qty
                ]);

                // Insert items (delete existing items first to avoid duplicates)
                await connection.execute(`
                    DELETE FROM tabMaterialRequestItem WHERE parent_title = ?
                `, [mr.title]);

                for (const item of mr.items) {
                    // Compute status based on picked_qty
                    let itemStatus = 'Pending';
                    if (item.picked_qty >= item.requested_qty && item.requested_qty > 0) {
                        itemStatus = 'Picked';
                    } else if (item.picked_qty > 0) {
                        itemStatus = 'In Progress';
                    }
                    
                    await connection.execute(`
                        INSERT INTO tabMaterialRequestItem 
                            (parent_title, item_code, requested_qty, picked_qty, status)
                        VALUES (?, ?, ?, ?, ?)
                    `, [mr.title, item.item_code, item.requested_qty, item.picked_qty, itemStatus]);
                }

                console.log(`✅ Created: ${mr.title} (Status: ${mr.status}, Items: ${mr.items.length}, Total Qty: ${mr.total_requested_qty})`);
                insertedCount++;
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    console.log(`⚠️  Skipped (duplicate): ${mr.title}`);
                    skippedCount++;
                } else {
                    console.error(`❌ Error creating ${mr.title}: ${error.message}`);
                }
            }
        }

        console.log('\n==========================================');
        console.log(`✅ Successfully created: ${insertedCount} Material Requests`);
        if (skippedCount > 0) {
            console.log(`⚠️  Skipped (duplicates): ${skippedCount} Material Requests`);
        }
        console.log('==========================================\n');

        // Run verification queries
        console.log('📊 Verification:\n');
        
        try {
            const [materialRequestCount] = await connection.execute(
                "SELECT COUNT(*) as count FROM tabMaterialRequest WHERE title LIKE 'MR-%'"
            );
            console.log(`✅ Material Request documents: ${materialRequestCount[0].count}`);

            const [itemCount] = await connection.execute(
                "SELECT COUNT(*) as count FROM tabMaterialRequestItem WHERE parent_title LIKE 'MR-%'"
            );
            console.log(`✅ Material Request items: ${itemCount[0].count}`);

            const [statusCount] = await connection.execute(`
                SELECT status, COUNT(*) as count, 
                       SUM(total_requested_qty) as total_requested, 
                       SUM(total_picked_qty) as total_picked 
                FROM tabMaterialRequest 
                WHERE title LIKE 'MR-%' 
                GROUP BY status
            `);
            console.log('\n📋 Status breakdown:');
            statusCount.forEach(row => {
                console.log(`   ${row.status}: ${row.count} requests (Requested: ${parseFloat(row.total_requested).toFixed(2)}, Picked: ${parseFloat(row.total_picked).toFixed(2)})`);
            });

            // Show sample Material Request
            const [sample] = await connection.execute(`
                SELECT mr.title, mr.status, COUNT(mri.item_code) as item_count, 
                       mr.total_requested_qty, mr.total_picked_qty
                FROM tabMaterialRequest mr
                LEFT JOIN tabMaterialRequestItem mri ON mr.title = mri.parent_title
                WHERE mr.title LIKE 'MR-%'
                GROUP BY mr.title, mr.status, mr.total_requested_qty, mr.total_picked_qty
                LIMIT 1
            `);
            if (sample.length > 0) {
                console.log('\n📄 Sample Material Request:');
                console.log(`   Title: ${sample[0].title}`);
                console.log(`   Status: ${sample[0].status}`);
                console.log(`   Items: ${sample[0].item_count}`);
                console.log(`   Requested Qty: ${sample[0].total_requested_qty}`);
                console.log(`   Picked Qty: ${sample[0].total_picked_qty}`);
            }
        } catch (error) {
            console.error(`⚠️  Could not run verification queries: ${error.message}`);
        }

        await connection.end();
        
        console.log('\n✅ Mock data generation completed!');
        console.log('\nYou can now view Material Request documents in the desktop app or via API.');
        console.log('');

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.code) {
            console.error(`   Error code: ${error.code}`);
        }
        if (error.stack) {
            console.error(`\nStack trace:\n${error.stack}`);
        }
        process.exit(1);
    }
}

runMockDataGeneration();

