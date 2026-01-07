// Script to insert 20 sample locations into tabLocation table
// Follows the pattern from the existing locations

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function insertSampleLocations() {
    console.log('==========================================');
    console.log('Inserting Sample Locations');
    console.log('==========================================\n');

    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop',
            multipleStatements: true
        });

        console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

        // Ensure table exists
        const createTableSQL = `
CREATE TABLE IF NOT EXISTS tabLocation (
  location_id VARCHAR(100) PRIMARY KEY,
  warehouse VARCHAR(100) NOT NULL,
  zone VARCHAR(100) NULL,
  aisle VARCHAR(100) NULL,
  parent_rack VARCHAR(100) NULL,
  level VARCHAR(50) NULL,
  bin_id VARCHAR(100) NULL,
  location_type VARCHAR(50) NULL,
  location_type_detailed VARCHAR(100) NULL,
  is_available BOOLEAN DEFAULT TRUE,
  capacity_volume_weight DECIMAL(10,2) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_warehouse (warehouse),
  INDEX idx_zone (zone),
  INDEX idx_aisle (aisle),
  INDEX idx_parent_rack (parent_rack)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `;

        await connection.query(createTableSQL);
        console.log("✅ Table checked/created\n");

        // Sample locations data
        const locations = [
            // Staging Area (2 locations)
            {
                location_id: 'STAGE-01',
                warehouse: 'WH-MAIN',
                zone: 'Staging Area',
                aisle: null,
                parent_rack: null,
                level: null,
                bin_id: 'SL-01',
                location_type: 'Bulk Storage',
                location_type_detailed: 'Staging'
            },
            {
                location_id: 'STAGE-02',
                warehouse: 'WH-MAIN',
                zone: 'Staging Area',
                aisle: null,
                parent_rack: null,
                level: null,
                bin_id: 'SL-02',
                location_type: 'Bulk Storage',
                location_type_detailed: 'Staging'
            },
            // Zone A - Aisle 01 - Rack 01 (4 locations, levels 1-4)
            {
                location_id: 'A1-R01-L1-B1',
                warehouse: 'WH-MAIN',
                zone: 'Zone A',
                aisle: 'Aisle 01',
                parent_rack: 'Rack 01',
                level: '1',
                bin_id: 'B1',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'A1-R01-L2-B1',
                warehouse: 'WH-MAIN',
                zone: 'Zone A',
                aisle: 'Aisle 01',
                parent_rack: 'Rack 01',
                level: '2',
                bin_id: 'B1',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'A1-R01-L3-B1',
                warehouse: 'WH-MAIN',
                zone: 'Zone A',
                aisle: 'Aisle 01',
                parent_rack: 'Rack 01',
                level: '3',
                bin_id: 'B1',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'A1-R01-L4-B1',
                warehouse: 'WH-MAIN',
                zone: 'Zone A',
                aisle: 'Aisle 01',
                parent_rack: 'Rack 01',
                level: '4',
                bin_id: 'B1',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            // Zone A - Aisle 01 - Rack 02 (4 locations, levels 1-4)
            {
                location_id: 'A1-R02-L1-B2',
                warehouse: 'WH-MAIN',
                zone: 'Zone A',
                aisle: 'Aisle 01',
                parent_rack: 'Rack 02',
                level: '1',
                bin_id: 'B2',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'A1-R02-L2-B2',
                warehouse: 'WH-MAIN',
                zone: 'Zone A',
                aisle: 'Aisle 01',
                parent_rack: 'Rack 02',
                level: '2',
                bin_id: 'B2',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'A1-R02-L3-B2',
                warehouse: 'WH-MAIN',
                zone: 'Zone A',
                aisle: 'Aisle 01',
                parent_rack: 'Rack 02',
                level: '3',
                bin_id: 'B2',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'A1-R02-L4-B2',
                warehouse: 'WH-MAIN',
                zone: 'Zone A',
                aisle: 'Aisle 01',
                parent_rack: 'Rack 02',
                level: '4',
                bin_id: 'B2',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            // Zone B - Aisle 02 - Rack 01 (3 locations, levels 1-3)
            {
                location_id: 'B3-R01-L1-B3',
                warehouse: 'WH-MAIN',
                zone: 'Zone B',
                aisle: 'Aisle 02',
                parent_rack: 'Rack 01',
                level: '1',
                bin_id: 'B3',
                location_type: 'Bulk Storage',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'B3-R01-L2-B3',
                warehouse: 'WH-MAIN',
                zone: 'Zone B',
                aisle: 'Aisle 02',
                parent_rack: 'Rack 01',
                level: '2',
                bin_id: 'B3',
                location_type: 'Bulk Storage',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'B3-R01-L3-B3',
                warehouse: 'WH-MAIN',
                zone: 'Zone B',
                aisle: 'Aisle 02',
                parent_rack: 'Rack 01',
                level: '3',
                bin_id: 'B3',
                location_type: 'Bulk Storage',
                location_type_detailed: 'Bulk'
            },
            // Zone B - Aisle 02 - Rack 02 (3 locations, levels 1-3)
            {
                location_id: 'B3-R02-L1-B4',
                warehouse: 'WH-MAIN',
                zone: 'Zone B',
                aisle: 'Aisle 02',
                parent_rack: 'Rack 02',
                level: '1',
                bin_id: 'B4',
                location_type: 'Bulk Storage',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'B3-R02-L2-B4',
                warehouse: 'WH-MAIN',
                zone: 'Zone B',
                aisle: 'Aisle 02',
                parent_rack: 'Rack 02',
                level: '2',
                bin_id: 'B4',
                location_type: 'Bulk Storage',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'B3-R02-L3-B4',
                warehouse: 'WH-MAIN',
                zone: 'Zone B',
                aisle: 'Aisle 02',
                parent_rack: 'Rack 02',
                level: '3',
                bin_id: 'B4',
                location_type: 'Bulk Storage',
                location_type_detailed: 'Bulk'
            },
            // Zone C - Aisle 03 - Rack 01 (4 locations, levels 1-4)
            {
                location_id: 'C1-R01-L1-B5',
                warehouse: 'WH-MAIN',
                zone: 'Zone C',
                aisle: 'Aisle 03',
                parent_rack: 'Rack 01',
                level: '1',
                bin_id: 'B5',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'C1-R01-L2-B5',
                warehouse: 'WH-MAIN',
                zone: 'Zone C',
                aisle: 'Aisle 03',
                parent_rack: 'Rack 01',
                level: '2',
                bin_id: 'B5',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'C1-R01-L3-B5',
                warehouse: 'WH-MAIN',
                zone: 'Zone C',
                aisle: 'Aisle 03',
                parent_rack: 'Rack 01',
                level: '3',
                bin_id: 'B5',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            },
            {
                location_id: 'C1-R01-L4-B5',
                warehouse: 'WH-MAIN',
                zone: 'Zone C',
                aisle: 'Aisle 03',
                parent_rack: 'Rack 01',
                level: '4',
                bin_id: 'B5',
                location_type: 'Picking',
                location_type_detailed: 'Bulk'
            }
        ];

        console.log(`📦 Inserting ${locations.length} locations...\n`);

        let insertedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const loc of locations) {
            try {
                await connection.execute(`
                    INSERT INTO tabLocation 
                        (location_id, warehouse, zone, aisle, parent_rack, level, bin_id, 
                         location_type, location_type_detailed, is_available)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
                    ON DUPLICATE KEY UPDATE
                        warehouse = VALUES(warehouse),
                        zone = VALUES(zone),
                        aisle = VALUES(aisle),
                        parent_rack = VALUES(parent_rack),
                        level = VALUES(level),
                        bin_id = VALUES(bin_id),
                        location_type = VALUES(location_type),
                        location_type_detailed = VALUES(location_type_detailed),
                        updated_at = CURRENT_TIMESTAMP
                `, [
                    loc.location_id,
                    loc.warehouse,
                    loc.zone,
                    loc.aisle,
                    loc.parent_rack,
                    loc.level,
                    loc.bin_id,
                    loc.location_type,
                    loc.location_type_detailed
                ]);

                console.log(`✅ Created: ${loc.location_id} (${loc.zone || 'N/A'} - ${loc.location_type || 'N/A'})`);
                insertedCount++;
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    console.log(`⚠️  Skipped (duplicate): ${loc.location_id}`);
                    skippedCount++;
                } else {
                    console.error(`❌ Error creating ${loc.location_id}: ${error.message}`);
                    errorCount++;
                }
            }
        }

        console.log('\n==========================================');
        console.log('Insert Summary');
        console.log('==========================================');
        console.log(`✅ Successfully inserted: ${insertedCount}`);
        console.log(`⚠️  Skipped (duplicates): ${skippedCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log('==========================================\n');

        // Verify locations
        const [verifyRows] = await connection.execute(`
            SELECT location_id, warehouse, zone, location_type, COUNT(*) as count
            FROM tabLocation
            GROUP BY location_id, warehouse, zone, location_type
            ORDER BY location_id
            LIMIT 25
        `);

        if (verifyRows.length > 0) {
            console.log('📊 Verification - Sample Locations:');
            verifyRows.forEach(row => {
                console.log(`   ${row.location_id}: ${row.warehouse} - ${row.zone || 'N/A'} - ${row.location_type || 'N/A'}`);
            });
            console.log('');
        }

        await connection.end();
        console.log('✅ Script completed successfully');
    } catch (error) {
        console.error('❌ Script failed:', error);
        process.exit(1);
    }
}

insertSampleLocations();

