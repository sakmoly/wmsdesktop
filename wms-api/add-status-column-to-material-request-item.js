import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function addStatusColumn() {
    console.log('==========================================');
    console.log('Adding status column to tabMaterialRequestItem');
    console.log('==========================================\n');

    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'root',
            database: process.env.DB_NAME || 'wms_desktop',
            multipleStatements: true
        });

        console.log(`✅ Connected to database: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '3306'}/${process.env.DB_NAME || 'wms_desktop'}\n`);

        // Check if column already exists
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabMaterialRequestItem' 
            AND COLUMN_NAME = 'status'
        `);

        if (columns.length > 0) {
            console.log('⚠️  Column "status" already exists in tabMaterialRequestItem\n');
            await connection.end();
            return;
        }

        // Add status column
        console.log('📝 Adding status column to tabMaterialRequestItem...\n');
        await connection.execute(`
            ALTER TABLE tabMaterialRequestItem
            ADD COLUMN status VARCHAR(50) DEFAULT 'Pending' AFTER picked_qty,
            ADD INDEX idx_status (status)
        `);

        console.log('✅ Status column added successfully\n');

        // Update existing records based on picked_qty
        console.log('📝 Updating status for existing records based on picked_qty...\n');
        await connection.execute(`
            UPDATE tabMaterialRequestItem
            SET status = CASE
                WHEN picked_qty >= requested_qty AND requested_qty > 0 THEN 'Picked'
                WHEN picked_qty > 0 THEN 'In Progress'
                ELSE 'Pending'
            END
        `);

        const [updateResult] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM tabMaterialRequestItem
        `);

        console.log(`✅ Updated status for ${updateResult[0].count} records\n`);

        // Verify the column was added
        const [verifyColumns] = await connection.execute(`
            SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'tabMaterialRequestItem' 
            AND COLUMN_NAME = 'status'
        `);

        if (verifyColumns.length > 0) {
            console.log('✅ Verification: Status column exists');
            console.log(`   Data Type: ${verifyColumns[0].DATA_TYPE}`);
            console.log(`   Default: ${verifyColumns[0].COLUMN_DEFAULT}\n`);
        }

        console.log('==========================================');
        console.log('✅ Migration completed successfully!');
        console.log('==========================================\n');

    } catch (error) {
        console.error('❌ Error adding status column:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

addStatusColumn().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});

