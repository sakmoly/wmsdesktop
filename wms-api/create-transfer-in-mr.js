/**
 * Create Transfer In and Material Request test data
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms'
});

// Create Transfer In (using STORE-001 as from_showroom)
console.log('Creating Transfer In...');
await conn.execute(`
  INSERT INTO tabTransferIn (title, status, from_showroom, to_warehouse, transfer_date, expected_arrival_date, prepared_by, total_qty, created_at, updated_at)
  VALUES ('TI-0001', 'Received', 'STORE-001', 'WH-MAIN', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'sysadmin', 80, NOW(), NOW())
  ON DUPLICATE KEY UPDATE status = 'Received', from_showroom = 'STORE-001', total_qty = 80, updated_at = NOW()
`);

// Create Transfer In Items
await conn.execute(`
  INSERT INTO tabTransferInItem (parent_title, item_code, qty, carton_id, received_qty, status, created_at, updated_at)
  VALUES ('TI-0001', 'SKU-HAT-301-BLU-OS', 50, 'CTN-TI-001', 50, 'Received', NOW(), NOW())
  ON DUPLICATE KEY UPDATE qty = 50, received_qty = 50, status = 'Received', updated_at = NOW()
`);

await conn.execute(`
  INSERT INTO tabTransferInItem (parent_title, item_code, qty, carton_id, received_qty, status, created_at, updated_at)
  VALUES ('TI-0001', 'SKU-HAT-301-GRN-OS', 30, 'CTN-TI-002', 30, 'Received', NOW(), NOW())
  ON DUPLICATE KEY UPDATE qty = 30, received_qty = 30, status = 'Received', updated_at = NOW()
`);

console.log('✅ Created TI-0001 with 2 items');

// Create Material Request (using STORE-001 as to_showroom)
console.log('\nCreating Material Request...');
await conn.execute(`
  INSERT INTO tabMaterialRequest (title, status, from_warehouse, to_showroom, requested_date, required_date, requested_by, total_requested_qty, total_picked_qty, created_at, updated_at)
  VALUES ('MR-0001', 'Pending', 'WH-MAIN', 'STORE-001', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'sysadmin', 35, 0, NOW(), NOW())
  ON DUPLICATE KEY UPDATE status = 'Pending', to_showroom = 'STORE-001', total_requested_qty = 35, updated_at = NOW()
`);

// Create Material Request Items (pending_qty is a generated column, don't insert it)
await conn.execute(`
  INSERT INTO tabMaterialRequestItem (parent_title, item_code, requested_qty, picked_qty, status, created_at, updated_at)
  VALUES ('MR-0001', 'SKU-HAT-301-BLU-OS', 20, 0, 'Pending', NOW(), NOW())
  ON DUPLICATE KEY UPDATE requested_qty = 20, status = 'Pending', updated_at = NOW()
`);

await conn.execute(`
  INSERT INTO tabMaterialRequestItem (parent_title, item_code, requested_qty, picked_qty, status, created_at, updated_at)
  VALUES ('MR-0001', 'SKU-HAT-301-GRN-OS', 15, 0, 'Pending', NOW(), NOW())
  ON DUPLICATE KEY UPDATE requested_qty = 15, status = 'Pending', updated_at = NOW()
`);

console.log('✅ Created MR-0001 with 2 items');

// Verify
console.log('\n=== Verification ===');
const [ti] = await conn.execute('SELECT title, status, total_qty FROM tabTransferIn');
console.log('Transfer Ins:', ti);

const [tiItems] = await conn.execute('SELECT parent_title, item_code, qty, status FROM tabTransferInItem');
console.log('Transfer In Items:', tiItems);

const [mr] = await conn.execute('SELECT title, status, total_requested_qty FROM tabMaterialRequest');
console.log('\nMaterial Requests:', mr);

const [mrItems] = await conn.execute('SELECT parent_title, item_code, requested_qty, status FROM tabMaterialRequestItem');
console.log('Material Request Items:', mrItems);

await conn.end();
console.log('\n✅ Done! Refresh your desktop app to see the data.');
