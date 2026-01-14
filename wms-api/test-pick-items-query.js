// Test script to debug pick-items query
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wms_desktop',
};

async function testQuery() {
  const conn = await mysql.createConnection(dbConfig);
  
  try {
    const cartonId = 'PAW-ASN365425473-1768138301111';
    const itemCode = 'SKU-HAT-301-BLU-OS';
    const sourceBin = 'A1-R02-L1-B2';
    const warehouse = 'WH-MAIN';
    
    console.log('Testing exact match...');
    const [exact] = await conn.execute(
      `SELECT carton_id, item_code, bin_location, qty, status, warehouse 
       FROM tabCartonStock 
       WHERE carton_id = ? 
         AND item_code = ? 
         AND bin_location = ? 
         AND warehouse = ? 
         AND qty > 0 
         AND (status IS NULL OR status = '' OR status = 'PUTAWAY') 
       LIMIT 1`,
      [cartonId, itemCode, sourceBin, warehouse]
    );
    console.log('Exact match:', JSON.stringify(exact, null, 2));
    
    console.log('\nTesting LIKE patterns...');
    const parts = sourceBin.split('-');
    const lastPart = parts[parts.length - 1];
    let rackNumber = null;
    for (const part of parts) {
      if (part.startsWith('R') || part.match(/^Rack\s*\d+/i)) {
        rackNumber = part.replace(/^R/i, '').replace(/^Rack\s*/i, '').trim();
        break;
      }
    }
    console.log('Parsed - lastPart:', lastPart, 'rackNumber:', rackNumber);
    
    const likePatterns = [];
    if (rackNumber && lastPart) {
      likePatterns.push(`%Rack ${rackNumber}-${lastPart}%`);
      likePatterns.push(`%R${rackNumber}-${lastPart}%`);
      likePatterns.push(`%${rackNumber}-${lastPart}%`);
    }
    if (lastPart) {
      likePatterns.push(`%-${lastPart}`);
    }
    console.log('LIKE patterns:', likePatterns);
    
    if (likePatterns.length > 0) {
      const [partial] = await conn.execute(
        `SELECT carton_id, item_code, bin_location, qty, status, warehouse 
         FROM tabCartonStock 
         WHERE carton_id = ? 
           AND item_code = ? 
           AND warehouse = ? 
           AND (${likePatterns.map(() => 'bin_location LIKE ?').join(' OR ')})
           AND qty > 0 
           AND (status IS NULL OR status = '' OR status = 'PUTAWAY') 
         LIMIT 1`,
        [cartonId, itemCode, warehouse, ...likePatterns]
      );
      console.log('Partial match:', JSON.stringify(partial, null, 2));
    }
    
    // Also check what's actually in the database
    console.log('\nAll carton stock for this item:');
    const [all] = await conn.execute(
      `SELECT carton_id, item_code, bin_location, qty, status, warehouse 
       FROM tabCartonStock 
       WHERE item_code = ? AND carton_id = ?`,
      [itemCode, cartonId]
    );
    console.log(JSON.stringify(all, null, 2));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await conn.end();
  }
}

testQuery();
