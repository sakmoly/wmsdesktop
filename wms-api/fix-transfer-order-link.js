// Fix Transfer Order link in Inbound Session
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function fix() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('Fixing Transfer Order link...\n');

        // First, check which Transfer Order exists for ASN-0002
        const [tos] = await connection.execute(`
            SELECT title, advance_shipping_notice, status
            FROM tabTransferOrder
            WHERE advance_shipping_notice = 'ASN-0002'
            ORDER BY created_at DESC
        `);
        
        if (tos.length === 0) {
            console.log('❌ No Transfer Order found for ASN-0002');
            await connection.end();
            return;
        }
        
        const toTitle = tos[0].title;
        console.log(`\n📋 Found Transfer Order: ${toTitle} for ASN-0002\n`);

        // Update by session title
        const [result1] = await connection.execute(`
            UPDATE tabInboundSession
            SET transfer_order = ?
            WHERE inbound_session = 'SESSION-ASN0002-DEVICE4-USER4'
              AND (transfer_order IS NULL OR transfer_order = '')
        `, [toTitle]);
        console.log(`✅ Updated by session title: ${result1.affectedRows} row(s)`);

        // Update by ASN (backup - update all sessions for ASN-0002 that don't have a TO)
        const [result2] = await connection.execute(`
            UPDATE tabInboundSession
            SET transfer_order = ?
            WHERE asn_no = 'ASN-0002'
              AND (transfer_order IS NULL OR transfer_order = '')
        `, [toTitle]);
        console.log(`✅ Updated by ASN: ${result2.affectedRows} row(s)\n`);

        // Verify
        const [sessions] = await connection.execute(`
            SELECT 
                inbound_session as session_title,
                asn_no,
                transfer_order,
                status
            FROM tabInboundSession
            WHERE asn_no = 'ASN-0002'
        `);
        console.log('Verification - Inbound Sessions:');
        console.table(sessions);

        // Check Transfer Order exists (verification)
        const [toList] = await connection.execute(`
            SELECT title, advance_shipping_notice, status
            FROM tabTransferOrder
            WHERE advance_shipping_notice = 'ASN-0002'
        `);
        console.log('\nTransfer Orders:');
        console.table(toList);

    } finally {
        await connection.end();
    }
}

fix().catch(console.error);

