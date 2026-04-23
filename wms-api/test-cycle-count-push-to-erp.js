/**
 * Internal test: Cycle Count push to ERPNext (sync_task_capture_only).
 * Builds the same payload as desktop/wms-api and POSTs to the API, then asserts:
 * - response.message.ok === true
 * - response.message.updated_lines === payload.lines.length (line count match)
 * - response.message.task is set (ERP doc reference)
 *
 * Usage:
 *   Set env CYCLE_COUNT_ERP_URL and CYCLE_COUNT_ERP_API_KEY (or pass as args).
 *   node test-cycle-count-push-to-erp.js [baseUrl] [apiKey]
 *
 * Example:
 *   set CYCLE_COUNT_ERP_URL=http://your-erp:88/api/method/printechs_wms.api.cycle_count_batch.sync_task_capture_only
 *   set CYCLE_COUNT_ERP_API_KEY=your-key
 *   node test-cycle-count-push-to-erp.js
 */

const baseUrl = process.argv[2] || process.env.CYCLE_COUNT_ERP_URL || process.env.ERP_CYCLE_COUNT_PUSH_URL;
const apiKey = process.argv[3] || process.env.CYCLE_COUNT_ERP_API_KEY || process.env.ERP_CYCLE_COUNT_PUSH_API_KEY;

// Payload with exactly 3 lines (same shape as desktop/wms-api)
const payload = {
  payload: {
    company: 'Mohammed Abdullah Almousa Trading Company',
    warehouse: 'Main Warehouse - MAATC',
    warehouse_code: 'WH-MAIN',
    posting_date: new Date().toISOString().slice(0, 10),
    external_ref: 'CC-TEST-PUSH-' + Date.now(),
    bin_location: 'A1-R01-L1-B1',
    opening_stock: 0,
    counted_by: 'TEST-USER',
    counted_on: new Date().toISOString().replace('T', ' ').slice(0, 19),
    lines: [
      { item_code: '108226', bin_location: 'A1-R01-L1-B1', counted_qty: 10, uom: 'Nos' },
      { item_code: '108227', bin_location: 'A1-R01-L1-B1', counted_qty: 20, uom: 'Nos' },
      { item_code: '108228', bin_location: 'A1-R01-L1-B1', counted_qty: 30, uom: 'Nos' }
    ]
  }
};

const expectedLineCount = payload.payload.lines.length;

async function run() {
  console.log('\n🧪 Cycle Count Push to ERP (sync_task_capture_only) – internal test\n');
  if (!baseUrl || !apiKey) {
    console.error('❌ Set CYCLE_COUNT_ERP_URL and CYCLE_COUNT_ERP_API_KEY (or pass baseUrl and apiKey as args).');
    process.exit(1);
  }
  console.log('URL:', baseUrl.replace(/[?].*/, ''));
  console.log('Payload external_ref:', payload.payload.external_ref);
  console.log('Payload lines:', expectedLineCount);
  console.log('');

  const res = await fetch(baseUrl.trim(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `token ${apiKey.trim()}`
    },
    body: JSON.stringify(payload)
  });
  const body = await res.text();

  if (!res.ok) {
    console.error('❌ API returned', res.status, body);
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.error('❌ Invalid JSON response:', body.slice(0, 200));
    process.exit(1);
  }

  const msg = data?.message;
  if (!msg || typeof msg !== 'object') {
    console.error('❌ Response has no message object:', JSON.stringify(data).slice(0, 300));
    process.exit(1);
  }

  const ok = msg.ok === true;
  const updatedLines = msg.updated_lines;
  const task = msg.task || msg.name || msg.reference;

  console.log('Response message:', JSON.stringify(msg, null, 2));
  console.log('');

  if (!ok) {
    console.error('❌ message.ok is not true');
    process.exit(1);
  }
  if (updatedLines !== expectedLineCount) {
    console.error(`❌ Line count mismatch: expected updated_lines=${expectedLineCount}, got ${updatedLines}`);
    process.exit(1);
  }
  if (!task) {
    console.error('❌ No ERP reference (message.task/name/reference)');
    process.exit(1);
  }

  console.log('✅ ok:', ok);
  console.log('✅ updated_lines:', updatedLines, '(matches payload lines)');
  console.log('✅ task (ERP reference):', task);
  console.log('\n✅ Internal test passed: cycle count push and line count replace work correctly.\n');
}

run().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
