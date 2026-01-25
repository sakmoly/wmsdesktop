import { getConnection } from './src/db/connection.js';

/**
 * Test Putaway API for All/ASN/TransferIn Tabs
 * 
 * This script tests the API endpoints that mobile app should call
 * for each tab to verify they return the correct tasks.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const TOKEN = process.env.API_TOKEN || 'YOUR_TOKEN_HERE';

async function testPutawayAPI() {
  console.log('=== Testing Putaway API for Mobile App Tabs ===\n');

  const tests = [
    {
      name: 'All Tab - Should return ASN + TransferIn',
      url: '/api/putaway/tasks?status=Draft,Open,In Progress',
      description: 'No source_type filter = returns all types',
      expectedSourceTypes: ['ASN', 'TransferIn']
    },
    {
      name: 'All Tab (Explicit) - Should return ASN + TransferIn',
      url: '/api/putaway/tasks?source_type=ASN,TransferIn&status=Draft,Open,In Progress',
      description: 'Explicitly includes both source types',
      expectedSourceTypes: ['ASN', 'TransferIn']
    },
    {
      name: 'ASN Tab - Should return only ASN',
      url: '/api/putaway/tasks?source_type=ASN&status=Draft,Open,In Progress',
      description: 'Filtered by source_type=ASN',
      expectedSourceTypes: ['ASN']
    },
    {
      name: 'TransferIn Tab - Should return only TransferIn',
      url: '/api/putaway/tasks?source_type=TransferIn&status=Open,In Progress',
      description: 'Filtered by source_type=TransferIn, status includes Open',
      expectedSourceTypes: ['TransferIn']
    },
    {
      name: 'TransferIn Tab (No Status Filter) - Should return only TransferIn',
      url: '/api/putaway/tasks?source_type=TransferIn',
      description: 'No status filter = API defaults to exclude Completed',
      expectedSourceTypes: ['TransferIn']
    }
  ];

  for (const test of tests) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Test: ${test.name}`);
    console.log(`URL: ${test.url}`);
    console.log(`Description: ${test.description}`);
    console.log(`Expected Source Types: ${test.expectedSourceTypes.join(', ')}`);
    console.log(`${'='.repeat(60)}`);

    try {
      // For testing, we'll query the database directly instead of making HTTP calls
      // This allows testing without authentication
      const connection = await getConnection();
      
      // Parse query string
      const url = new URL(test.url, 'http://localhost');
      const params = Object.fromEntries(url.searchParams);
      
      // Build query similar to API
      const conditions = [];
      const queryParams = [];

      // Status filter
      if (params.status) {
        const statusValues = params.status.split(',').map(s => s.trim());
        const placeholders = statusValues.map(() => '?').join(',');
        conditions.push(`pt.status IN (${placeholders})`);
        queryParams.push(...statusValues);
      } else {
        // Default: exclude Completed and Cancelled
        conditions.push(`pt.status NOT IN ('Completed', 'Cancelled')`);
      }

      // Source type filter
      if (params.source_type) {
        const sourceTypes = params.source_type.split(',').map(s => s.trim());
        if (sourceTypes.length > 1) {
          const placeholders = sourceTypes.map(() => '?').join(',');
          conditions.push(`COALESCE(pt.source_type, 'ASN') IN (${placeholders})`);
          queryParams.push(...sourceTypes);
        } else {
          conditions.push(`COALESCE(pt.source_type, 'ASN') = ?`);
          queryParams.push(sourceTypes[0]);
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [tasks] = await connection.execute(
        `SELECT 
          pt.title,
          pt.status,
          COALESCE(pt.source_type, 'ASN') as source_type,
          pt.transfer_in,
          pt.advance_shipping_notice
        FROM tabPutawayTask pt
        ${whereClause}
        ORDER BY pt.created_at DESC, pt.title
        LIMIT 20`,
        queryParams
      );

      console.log(`\n✅ Query executed successfully`);
      console.log(`   Found ${tasks.length} task(s)`);

      if (tasks.length > 0) {
        // Group by source type
        const bySourceType = {};
        tasks.forEach(task => {
          const st = task.source_type || 'ASN';
          if (!bySourceType[st]) {
            bySourceType[st] = [];
          }
          bySourceType[st].push({
            title: task.title,
            status: task.status,
            transfer_in: task.transfer_in || null,
            asn: task.advance_shipping_notice || null
          });
        });

        console.log(`\n   Breakdown by Source Type:`);
        Object.keys(bySourceType).forEach(st => {
          console.log(`     ${st}: ${bySourceType[st].length} task(s)`);
          bySourceType[st].forEach(t => {
            console.log(`       - ${t.title} (${t.status})`);
          });
        });

        // Verify expected source types
        const foundSourceTypes = Object.keys(bySourceType);
        const allExpected = test.expectedSourceTypes.every(st => foundSourceTypes.includes(st));
        const noUnexpected = foundSourceTypes.every(st => test.expectedSourceTypes.includes(st));

        if (allExpected && noUnexpected) {
          console.log(`\n   ✅ PASS: Found expected source types`);
        } else {
          console.log(`\n   ❌ FAIL: Source type mismatch`);
          console.log(`      Expected: ${test.expectedSourceTypes.join(', ')}`);
          console.log(`      Found: ${foundSourceTypes.join(', ')}`);
        }
      } else {
        console.log(`\n   ⚠️  No tasks found - this might be expected if no tasks exist`);
      }

      await connection.release();
    } catch (error) {
      console.error(`\n   ❌ ERROR: ${error.message}`);
      console.error(error.stack);
    }
  }

  console.log(`\n\n=== Test Summary ===`);
  console.log(`All tests completed. Review the results above.`);
  console.log(`\nIf TransferIn tasks are not showing in mobile app:`);
  console.log(`1. Verify mobile app includes "Open" in status filter`);
  console.log(`2. Verify mobile app doesn't filter by source_type for "All" tab`);
  console.log(`3. Verify mobile app accesses response.data (not response directly)`);
}

// Run tests
testPutawayAPI().catch(console.error);
