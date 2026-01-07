// Generate Putaway JSON Payloads from Database Items
// This script queries your database and generates JSON payloads for putaway API endpoints

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function generatePutawayJson() {
  let connection;

  try {
    console.log('\n🔄 Generating Putaway JSON Payloads from Database...\n');
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    // Get available items
    const [items] = await connection.execute(`
      SELECT code, name, stock_qty
      FROM tabItem
      ORDER BY code
      LIMIT 10
    `);

    if (items.length === 0) {
      console.log('❌ No items found in database. Please add items first.\n');
      return;
    }

    console.log(`📦 Found ${items.length} items:\n`);
    items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.code} - ${item.name} (Stock: ${item.stock_qty || 0})`);
    });
    console.log('');

    // Generate JSON payloads
    const payloads = {
      description: "Generated Putaway JSON Payloads from Database",
      generated_at: new Date().toISOString(),
      items_used: items.map(item => ({
        item_code: item.code,
        item_name: item.name
      })),
      endpoints: {
        assign_rack: [],
        complete_putaway: [],
        scan_transfer_carton: []
      }
    };

    // Generate assign-rack payloads
    console.log('📝 Generating assign-rack payloads...');
    const locations = [
      { rack: 'A1-R01', bin: 'L1-B1' },
      { rack: 'A1-R01', bin: 'L1-B2' },
      { rack: 'A2-R02', bin: 'L2-B1' },
      { rack: 'RACK-A', bin: 'BIN-01' },
      { rack: 'RACK-B', bin: 'BIN-02' }
    ];

    items.forEach((item, index) => {
      const location = locations[index % locations.length];
      payloads.endpoints.assign_rack.push({
        name: `Assign Rack - ${item.code}`,
        endpoint: 'POST /api/putaway/assign-rack',
        payload: {
          putaway_task: 'PUT-TEST-001',
          carton_id: `BOX-${item.code}-${String(index + 1).padStart(3, '0')}`,
          item_code: item.code,
          rack: location.rack,
          bin: location.bin,
          qty: (index + 1) * 10.0,
          user_id: 'USER-001'
        }
      });
    });

    // Generate complete-putaway payload
    console.log('📝 Generating complete-putaway payload...');
    const completeItems = items.slice(0, 5).map((item, index) => {
      const location = locations[index % locations.length];
      const targetBin = `${location.rack}-${location.bin}`;
      return {
        item_code: item.code,
        qty: (index + 1) * 10.0,
        source_bin: 'DOCK-01',
        target_bin: targetBin,
        completed: true
      };
    });

    payloads.endpoints.complete_putaway.push({
      name: 'Complete Putaway - Multiple Items',
      endpoint: 'POST /api/putaway/complete',
      payload: {
        putaway_task: 'PUT-TEST-001',
        performed_by: 'USER-001',
        items: completeItems
      }
    });

    // Generate scan-transfer-carton payloads
    console.log('📝 Generating scan-transfer-carton payloads...');
    payloads.endpoints.scan_transfer_carton.push(
      {
        name: 'Scan Transfer Carton - Format 1',
        endpoint: 'POST /api/putaway/scan-transfer-carton',
        payload: {
          tc_id: 'TC-TEST-001',
          rack: 'A1-R01',
          bin: 'L1-B1',
          user_id: 'USER-001'
        }
      },
      {
        name: 'Scan Transfer Carton - Format 2',
        endpoint: 'POST /api/putaway/scan-transfer-carton',
        payload: {
          tc_id: 'TC-TEST-001',
          rack: 'RACK-A',
          bin: 'BIN-01',
          user_id: 'USER-001'
        }
      },
      {
        name: 'Scan Transfer Carton - Update Existing',
        endpoint: 'POST /api/putaway/scan-transfer-carton',
        payload: {
          putaway_task: 'PUT-TEST-001',
          rack: 'A1-R01',
          bin: 'L1-B1',
          user_id: 'USER-001'
        }
      }
    );

    // Save to file
    const outputFile = 'PUTAWAY_JSON_GENERATED.json';
    fs.writeFileSync(outputFile, JSON.stringify(payloads, null, 2));
    console.log(`\n✅ Generated JSON saved to: ${outputFile}\n`);

    // Display summary
    console.log('📊 Summary:');
    console.log(`  - Assign Rack payloads: ${payloads.endpoints.assign_rack.length}`);
    console.log(`  - Complete Putaway payloads: ${payloads.endpoints.complete_putaway.length}`);
    console.log(`  - Scan Transfer Carton payloads: ${payloads.endpoints.scan_transfer_carton.length}`);
    console.log('');

    // Display sample payloads
    console.log('📋 Sample Payloads:\n');
    console.log('1. Assign Rack (First Item):');
    console.log(JSON.stringify(payloads.endpoints.assign_rack[0].payload, null, 2));
    console.log('\n2. Complete Putaway:');
    console.log(JSON.stringify(payloads.endpoints.complete_putaway[0].payload, null, 2));
    console.log('\n3. Scan Transfer Carton:');
    console.log(JSON.stringify(payloads.endpoints.scan_transfer_carton[0].payload, null, 2));
    console.log('');

    console.log('✅ Done! Use the generated JSON in your API testing tool.\n');

  } catch (error) {
    console.error('❌ Error generating JSON:', error.message);
    console.error(error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the script
generatePutawayJson();

