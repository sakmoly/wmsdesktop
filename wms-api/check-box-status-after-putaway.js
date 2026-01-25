import { getConnection } from './src/db/connection.js';

async function checkBoxStatus() {
  const connection = await getConnection();

  try {
    console.log('=== Checking Sort Box Status After Putaway ===\n');

    // Get boxes that have been closed (have closed_by and closed_on) but status might be Open
    const [boxes] = await connection.execute(`
      SELECT 
        box_id,
        status,
        advance_shipping_notice as asn_no,
        closed_by,
        closed_on,
        updated_at
      FROM tabSortBox
      WHERE closed_by IS NOT NULL
        AND closed_on IS NOT NULL
      ORDER BY closed_on DESC
      LIMIT 10
    `);

    console.log(`Found ${boxes.length} boxes with closed_by and closed_on:\n`);

    for (const box of boxes) {
      console.log(`Box ID: ${box.box_id}`);
      console.log(`  Status: ${box.status}`);
      console.log(`  ASN: ${box.asn_no}`);
      console.log(`  Closed By: ${box.closed_by}`);
      console.log(`  Closed On: ${box.closed_on}`);
      console.log(`  Updated At: ${box.updated_at}`);
      
      if (box.status !== 'Closed') {
        console.log(`  ❌ MISMATCH: Status is "${box.status}" but box has closed_by and closed_on!`);
        
        // Check if putaway task is completed
        const [putawayTasks] = await connection.execute(`
          SELECT 
            pt.title,
            pt.status as task_status,
            pt.source_type,
            pt.advance_shipping_notice
          FROM tabPutawayTask pt
          WHERE pt.advance_shipping_notice = ?
            AND pt.source_type = 'ASN'
          ORDER BY pt.created_at DESC
          LIMIT 1
        `, [box.asn_no]);
        
        if (putawayTasks.length > 0) {
          const task = putawayTasks[0];
          console.log(`  Putaway Task: ${task.title} - Status: ${task.task_status}`);
          
          if (task.task_status === 'Completed') {
            console.log(`  ⚠️  Task is Completed but box status is "${box.status}" - should be "Closed"`);
          }
        }
      } else {
        console.log(`  ✅ Status matches (Closed)`);
      }
      console.log('');
    }

    // Check for boxes with status 'Open' but have closed_by/closed_on
    const [mismatchedBoxes] = await connection.execute(`
      SELECT 
        box_id,
        status,
        advance_shipping_notice as asn_no,
        closed_by,
        closed_on
      FROM tabSortBox
      WHERE status = 'Open'
        AND closed_by IS NOT NULL
        AND closed_on IS NOT NULL
      ORDER BY closed_on DESC
      LIMIT 10
    `);

    if (mismatchedBoxes.length > 0) {
      console.log(`\n⚠️  Found ${mismatchedBoxes.length} boxes with status='Open' but have closed_by/closed_on:\n`);
      mismatchedBoxes.forEach(box => {
        console.log(`  - ${box.box_id} (ASN: ${box.asn_no}, Closed: ${box.closed_on})`);
      });
      
      console.log('\n🔧 Fixing these boxes...\n');
      
      for (const box of mismatchedBoxes) {
        await connection.execute(`
          UPDATE tabSortBox
          SET status = 'Closed', updated_at = CURRENT_TIMESTAMP
          WHERE box_id = ?
        `, [box.box_id]);
        console.log(`  ✅ Fixed box ${box.box_id}`);
      }
      
      await connection.commit();
      console.log('\n✅ All mismatched boxes have been fixed!');
    } else {
      console.log('\n✅ No mismatched boxes found.');
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    await connection.rollback();
  } finally {
    await connection.end();
  }
}

checkBoxStatus();
