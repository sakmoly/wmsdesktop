// Quick script to verify Transfer Order link in Inbound Session
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

async function verify() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'wms_desktop'
    });

    try {
        console.log('Checking Inbound Sessions for ASN-0002...\n');
        
        const [sessions] = await connection.execute(`
            SELECT 
                inbound_session as session_title,
                asn_no,
                transfer_order,
                status,
                dock,
                started_by,
                started_at
            FROM tabInboundSession
            WHERE asn_no = 'ASN-0002'
            ORDER BY started_at DESC
        `);

        console.log(`Found ${sessions.length} session(s) for ASN-0002:\n`);
        console.table(sessions);

        if (sessions.length === 0) {
            console.log('\n⚠️  No sessions found! Checking all sessions...\n');
            const [allSessions] = await connection.execute(`
                SELECT inbound_session, asn_no, transfer_order, status
                FROM tabInboundSession
                ORDER BY started_at DESC
                LIMIT 5
            `);
            console.table(allSessions);
        }

        // Check Transfer Order
        const [tos] = await connection.execute(`
            SELECT title, advance_shipping_notice, status
            FROM tabTransferOrder
            WHERE advance_shipping_notice = 'ASN-0002'
        `);

        console.log(`\nTransfer Orders for ASN-0002:\n`);
        console.table(tos);

    } finally {
        await connection.end();
    }
}

verify().catch(console.error);

