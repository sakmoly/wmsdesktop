// Script to update Transfer Order quantities from scan events
// Run this to sync sorted_qty and packed_qty for all Transfer Orders

import { updateAllTransferOrderQuantities } from './src/modules/transfer-orders/updateTransferOrderQuantities.js';

async function main() {
  try {
    console.log('🔄 Starting Transfer Order quantity update...\n');
    await updateAllTransferOrderQuantities();
    console.log('\n✅ Transfer Order quantity update completed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error updating Transfer Order quantities:', error);
    process.exit(1);
  }
}

main();

