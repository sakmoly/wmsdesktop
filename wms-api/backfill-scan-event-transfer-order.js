// Backfill tabWmsScanEvent.transfer_order for SORT_TO_BOX from tabSortBox + tabTransferOrder.
// Usage:
//   node backfill-scan-event-transfer-order.js           — dry run (counts only)
//   node backfill-scan-event-transfer-order.js --apply  — update DB + refresh all TO quantities

import { getConnection } from './src/db/connection.js';
import { backfillSortToBoxTransferOrder } from './src/services/backfillScanEventTransferOrder.js';
import { updateAllTransferOrderQuantities } from './src/modules/transfer-orders/updateTransferOrderQuantities.js';

const apply = process.argv.includes('--apply');

async function main() {
  const connection = await getConnection();
  try {
    const result = await backfillSortToBoxTransferOrder(connection, {
      dryRun: !apply,
    });
    console.log(JSON.stringify(result, null, 2));

    if (apply && result.ok) {
      await updateAllTransferOrderQuantities();
      console.log('\n✅ All transfer order quantities refreshed.');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    connection.release();
  }
}

main();
