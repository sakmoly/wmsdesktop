import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkSchema() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop'
        });

        console.log('📋 Checking tabWmsScanEvent table structure...\n');
        
        const [columns] = await connection.execute(`
            DESCRIBE tabWmsScanEvent
        `);

        console.log('All columns in tabWmsScanEvent:');
        columns.forEach(col => {
            console.log(`  - ${col.Field} (${col.Type}, nullable: ${col.Null === 'YES' ? 'YES' : 'NO'})`);
        });
        console.log('');

        await connection.end();
    } catch (error) {
        console.error('Error:', error.message);
        if (connection) await connection.end();
    }
}

checkSchema();

